# Financial calculations — as built (P2)

The money engine is plain TypeScript in `src/domain`, with no React or Firebase. It reproduces every example in `IndianChickenCenter.txt`: 67,800 profit both ways and a ledger balance of 10,778 when paise are dropped. All 49 financial tests from the plan pass, plus 17 engine tests (ENG-*) and 10 tests for the owner's Gate A answers (G-*).

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

## 4. Open questions found while building

- **Correcting a sale after the trip closes.** A closed trip is read-only, so its sales cannot be reversed (ENG-09). Options:
  - the owner reopens the trip, or
  - a ledger ADJUSTMENT with a reason, although the plan says adjustments are not for typos.
- **A sale synced after the trip closed.** If another phone saved a sale offline and syncs after close, the sale is rejected (`trip_closed`) and shows "Needs attention". Decide whether the owner re-posts it on a new trip or reopens the closed one.
- **Hiding profit from staff (U-07).** If staff must not see profit, purchase rates must move out of `tripEvents` before P4. Security rules cannot hide single fields.

## 5. Test map

| File | Tests |
| --- | --- |
| `__tests__/fuel-load-sale.test.ts` | F-FUEL-01–02, F-LOAD-01–03, F-SALE-01–08 |
| `__tests__/rounding.test.ts` | F-RND-01–06 |
| `__tests__/wastage-expenses-inventory.test.ts` | F-WST-01, F-EXP-01–05, F-INV-01–03 |
| `__tests__/profit.test.ts` | F-PRF-01–06 |
| `__tests__/ledger.test.ts` | F-LED-01–12 |
| `__tests__/bill-format.test.ts` | F-BILL-01–02, F-FMT-01 |
| `__tests__/engine-extras.test.ts` | ENG-01–17 (input parsing, U-01 gate, fixed ids, closed month and trip, S-* rule mirrors) |
| `__tests__/gate-a-decisions.test.ts` | G-01–09 and G-04b (rounding, payment methods, vehicles, trip rate, shop sale, labour, roles, Kannada bill, settings) |

Expected values are literal numbers checked by hand, never computed by the engine. To confirm the tests can fail, the engine was broken on purpose and then restored:
- truncating paise was swapped for rounding: 19 tests failed
- Option 1 was made to ignore wastage: 5 tests failed
