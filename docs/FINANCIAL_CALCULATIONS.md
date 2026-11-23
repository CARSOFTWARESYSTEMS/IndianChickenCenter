# Financial calculations — as built (P2)

The money engine is plain TypeScript in `src/domain`, with no React or Firebase. It reproduces every example in `IndianChickenCenter.txt`: 67,800 profit both ways and a ledger balance of 10,778 when paise are dropped. All 49 financial tests from the plan pass, plus 18 engine tests (ENG-*) and 10 tests for the owner's Gate A answers (G-*).

Status: built and tested, **not yet approved**. Section 3 lists where the engine differs from the plan. Review it at Gate B. The owner's answers are recorded in `REQUIREMENTS_TRACEABILITY.md`.

## 1. Units

| Quantity | Stored as | Example |
| --- | --- | --- |
| Weight | integer grams | 63.1 kg = 63,100 |
| Money | integer paise | ₹8,076.80 = 807,680 |
| Rate | integer paise per kg | ₹128/kg = 12,800 |
| Fuel | integer millilitres, paise per litre | 87.5 L at ₹91 = 87,500 × 9,100 |
| Exact line value | integer milli-paise (grams × paise/kg) | 63,100 × 12,800 = 807,680,000 |

User input is parsed from text (`parseKg`, `parseRupees`, …), never through floats.

## 2. Rules

- **Rounding (U-01: round to the rupee):** each sale stores the exact value, the posted amount, the policy id and the difference. Three policies are available:
  - `TRUNCATE_RUPEE` (matches the source ledger)
  - `ROUND_HALF_UP_RUPEE` (the owner's choice and the Settings default)
  - `EXACT_PAISE`

  Under the owner's choice, the source customer ends at ₹10,780, not ₹10,778. If the policy is ever set to `null`, posting sales stops.
- **Payments:** cash, UPI or bank transfer, with an optional reference (UPI or UTR number). Cash stays preselected.
- **Trip rate:** each trip has a default selling rate. Drivers sell at it; the owner or manager may change the rate on a sale.
- **Ledger:** append-only. Balance = Σ debits − Σ credits over financial entries. A MONTH_END_SNAPSHOT is never summed. If a snapshot disagrees with a recompute, the recompute is shown and the mismatch is flagged.
- **Trip stock:** remaining = loaded − sold (customer sales + shop sales) − wastage. An order never moves stock. A sale beyond the remaining stock needs an explicit confirmation, which is stored on the entry. Kg left at the end are sold at the shop or recorded as wastage (U-05).
- **Trip close:** the trip must have network, no unsynced writes on this device, and remaining exactly 0. After close the trip is read-only.
- **Profit:** Option 2 = sales − operating − purchases. Option 1 = (loaded − wastage) × valuation rate − operating − purchases.
  - The valuation rate, used for both the full load and the wastage (wastage at selling price, U-11), is chosen in this order:
    1. an override passed in for the report
    2. the trip's default selling rate (the owner's answer for D-03)
    3. the trip's sales ÷ kg sold, kept as an exact fraction
  - When some customers or the shop paid a different rate, the options differ, and the difference is shown, never forced to zero.
  - Both options are provisional until the trip closes.
- **Bill:** built only from ledger entries. Previous balance (including the opening balance) + items − paid ± reversals/adjustments = balance due.

## 3. Where the engine differs from the plan (needs approval)

| # | Plan said | Engine does | Why |
| --- | --- | --- | --- |
| 1 | F-BILL-02: "10,778" intact in the URL | Checks the decoded `text` parameter | `encodeURIComponent` turns "," into `%2C`, so the plan's check could never pass |
| 2 | F-FMT-01: values only | Rule: no decimals for whole rupees, two when there are paise | The default INR format prints ₹1,000.00 |
| 3 | D-06: auto-IDs for all entries | Fixed ids: `open_<customer>`, `rev_<original>`, `snap_<customer>_<YYYY-MM>` | Rules cannot search the database; fixed ids let create-only rules reject a second opening balance, reversal or month close (S-07) |
| 4 | Silent on late entries | An entry dated in a closed month is rejected; it must be dated in the open month | Otherwise a late offline sync would make the snapshot path and the recompute disagree |
| 5 | Fuel = litres × price | Fuel can also be entered by pump amount: the amount wins and litres are derived (₹8,000 at ₹91 → 87.912 L) | The source's ₹8,000 is a round pump amount |
| 6 | Silent | Fuel, purchases and orders keep exact paise; only customer SALE lines follow U-01 | They are not bill lines |
| 7 | Silent | Entries cannot be dated before the customer's opening balance | Keeps the passbook in date order |
| 8 | Silent | Displayed Option 1 parts round to the nearest paisa (halves away from zero); profit itself is exact | Parts can differ from the profit by at most 1 paisa when shown |
| 9 | Silent | A trip-rate change (DEFAULT_RATE) cannot be reversed; a new rate replaces it (ENG-18, D-25) | The stored trip holds the current rate, which the rules check drivers' sales against |
| 10 | D-06: auto-IDs | A stored trip's id is `trip_<date>_<vehicle>` | Makes "one trip per vehicle per day" (U-06) enforceable by the rules |
| 11 | bills/{id}: entry IDs and totals at issue | An issued bill keeps its whole content: every line (with its entry id) and the totals | The bill can be shared again later, even when its entries are no longer loaded on the phone (the read window) |

## 3a. The same rules on the server (P4)

`firestore.rules` repeats these checks for every document saved, in integer units, without trusting the phone:

- **Sales and shop sales:** `exactMilliPaise = grams × rate`, and the posted amount matches the entry's rounding policy. The check uses only multiplication and comparison (for half-up to the rupee: `amount × 1000 ≤ exact + 50,000 < amount × 1000 + 1,00,000`), so there is no integer-division question.
- **Fuel, loading, orders:** exact paise, half up. Fuel by pump amount re-derives the litres the same way the engine does.
- **Corrections:** a reversal mirrors its original's amount in the other direction, once (`rev_<id>`), and never on a closed trip. An adjustment needs the owner and a reason.
- **Month end:** an entry dated in a month already closed for that customer is refused. The snapshot and the customer's "closed through" month are saved together.
- **Who:** the role table is generated from `permissions.ts`. A driver writes only on their own open trip, sells at the trip's current rate, and cannot read purchase rates or money totals.
- **Limits:** up to 100 tonnes, ₹1,00,000 per kg or litre, ₹10 crore per entry. These keep every product below 2^53, so the app reads back exactly what was checked.

Rules cannot add up documents, so stock, balances and the labour-style check (D-20) stay in the app (KNOWN_LIMITATIONS.md).

## 3b. Balances in the cloud: a window plus snapshots (P5)

A phone does not read the whole ledger (free-plan reads). It reads every entry dated on or after the **window start**, plus month-end snapshots. The window starts on the first day of last month, or earlier for any customer whose months are not all closed (then it starts the month after their last closed month, or at the month they were added).

- **Balance now** = latest snapshot's closing balance + every entry after that month. The demo (complete) ledger still uses a full recompute.
- **Balance before a date** (a bill's "previous balance", a passbook's first line) = balance now − every entry dated on or after that date. All of those are loaded, so no older entry is needed.
- **Month-end close** = previous snapshot + the entries of the months after it. The entry count carries forward the same way.
- A passbook that starts at the window opens with a **Brought forward** line, unless the customer has no history before the window.
- A bill for a period that starts before the window is refused ("Older entries are not on this phone").

Tests LW-01–05 check each of these against the full ledger on the source example (₹10,778 in October, ₹11,178 after November). SY-07 checks a month-end close in the emulator with October's entries not loaded.

## 3c. Bills (P6)

- A bill is built only from ledger entries (section 2). Until it is issued it is a **statement**.
- **Issuing** gives it the next number for the Indian financial year, `ICC/2026-27/0001`, starting again at 0001 each April (D-07). The number comes from a counter in the cloud, in one transaction with the bill, so numbers have no gaps and no repeats. The rules check both. Demo mode keeps its own counter.
- An issued bill is dated the day it is issued (by the cloud's clock), cannot cover days after that, and never changes. A later payment shows on the next bill, not on this one (ST-06).
- The screen, the PDF and the WhatsApp text show the same lines: previous balance, each sale (kg × rate), items total, each payment, paid, reversals and adjustments, balance due (or advance).

## 3d. Backups (P7)

A backup holds every record and every customer's balance from a **full recompute** of all their entries. Checking a backup recomputes them again from the file, compares them with the file's own figures, and checks every month-end snapshot against a recompute of its month. This is the full re-check a phone cannot do from its read window (section 3b). A backup is "Verified" only when the copy read back from Drive passes all of this and has the checksum it was saved with.

## 4. Open questions found while building

- **Correcting a sale after the trip closes.** A closed trip is read-only, so its sales cannot be reversed (ENG-09). Options:
  - the owner reopens the trip, or
  - a ledger ADJUSTMENT with a reason, although the plan says adjustments are not for typos.
- **A sale synced after the trip closed.** If another phone saved a sale offline and syncs after close, the sale is rejected (`trip_closed`) and shows "Needs attention". Decide whether the owner re-posts it on a new trip or reopens the closed one.
- **Hiding profit from staff (U-07).** Done in P4: purchase rates and money totals have their own documents that drivers cannot read. Whether the manager may see them is still open question 3 in REQUIREMENTS_TRACEABILITY.md.

## 5. Test map

| File | Tests |
| --- | --- |
| `__tests__/fuel-load-sale.test.ts` | F-FUEL-01–02, F-LOAD-01–03, F-SALE-01–08 |
| `__tests__/rounding.test.ts` | F-RND-01–06 |
| `__tests__/wastage-expenses-inventory.test.ts` | F-WST-01, F-EXP-01–05, F-INV-01–03 |
| `__tests__/profit.test.ts` | F-PRF-01–06 |
| `__tests__/ledger.test.ts` | F-LED-01–12 |
| `__tests__/bill-format.test.ts` | F-BILL-01–02, F-FMT-01 |
| `__tests__/bill-document.test.ts` | BD-01–05: bill numbers per financial year, the source month as printed (English and Kannada), pages, file names |
| `src/pdf/__tests__/pdf.test.ts` | PDF-01: one A4 page per drawn page |
| `tests/rules/bills.test.ts` (emulator) | BR-01–04: numbers without gaps or repeats, dated today, totals add up, never changed |
| `src/backup/__tests__/backup.test.ts` | B-01 (drive.file only), B-02 (file format, SHA-256, no tokens), B-03 (upload and read back, fake Drive), B-05 and B-05b (verified only when the copy passes; snapshot re-check), B-06 preview |
| `tests/backup/restore.test.ts` (emulator) | B-04 (restore into an empty database: same records, counts and balances), B-06 (adds only missing records, never overwrites), B-06b (a failed file is refused) |
| `__tests__/engine-extras.test.ts` | ENG-01–18 (input parsing, U-01 gate, fixed ids, closed month and trip, S-* rule mirrors, rate change not reversible) |
| `__tests__/gate-a-decisions.test.ts` | G-01–09 and G-04b (rounding, payment methods, vehicles, trip rate, shop sale, labour, roles, Kannada bill, settings) |
| `__tests__/ledger-window.test.ts` | LW-01–05 and LW-03b: balance, previous balance, passbook, bill and month end from a window plus snapshots |
| `src/data/__tests__/docs.test.ts` | DOC-01–07: how records are stored (loading split, rate change, trip id, close totals, month-end closure, invites) |
| `src/data/__tests__/diff.test.ts` | DIFF-01–07: what each command saves, and in which batches |
| `src/data/__tests__/rules-constants.test.ts` | RC-01–02: the role table and value lists in `firestore.rules` match the engine |
| `tests/rules/*.test.ts` (emulator) | S-01–S-10 from the plan, R-01–R-17 (drivers, visibility, invites, settings, customers, vehicles, trips, loading, rates, month end, opening balance, fuel, shop sales, orders, cross-trip reads, shop map pin) |
| `__tests__/location.test.ts` | LOC-01–05: the shop's map pin typed or pasted (numbers, Google Maps links, short links refused), 6 decimal places, both numbers or none (not money) |
| `tests/sync/sync.test.ts` (emulator) | SY-01–SY-06 from the plan, SY-07–10 (month end from a window, loading rate kept apart, saves left over after a restart, bill numbers online) |

Expected values are literal numbers checked by hand, never computed by the engine. To confirm the tests can fail, the engine was broken on purpose and then restored:
- truncating paise was swapped for rounding: 19 tests failed
- Option 1 was made to ignore wastage: 5 tests failed
