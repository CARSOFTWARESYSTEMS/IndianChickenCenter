# Indian Chicken Center — Requirements Review & Premium App Plan

22 Nov 2026

This file contains two parts:

- **Part 1 — Requirements Review & Premium App Plan** (review of both files, app plan, design system, architecture, Addendum v2)
- **Part 2 — Addendum v3: Implementation Plan, Traceability and Financial Tests** (where Part 1 and Part 2 conflict, Part 2 wins)

Nothing in `IndianChickenCenter.txt` is changed anywhere in this document.

---

# PART 1 — Requirements Review & Premium App Plan

## Summary

Both files are strong. The customer requirement is short but complete as a daily business journey, and the prompt protects it well. The prompt needs focus, not more features: it is about 1,390 lines with 14 required documents, which will spread Claude Code thin and make the app feel heavier than the owner needs.

Nothing in IndianChickenCenter.txt is changed by this review. Every point below is either a clarification to confirm with the owner or an improvement to how we build it.

Top recommendations:

1. **Build the app as the owner's own journey.** His document reads as one trip: Start → Load → Orders → Deliver → Expenses → Profit → Ledger → Bill. Make the Trip screen follow exactly those steps so he recognises his own words.
2. **The ledger arithmetic is not wrong, it truncates paise.** 63.1 × 128 = 8,076.80 is written as 8,076, and 153.2 × 118 = 18,077.60 as 18,077. Every ledger figure reconciles if paise are dropped. The prompt calls this an inconsistency; it is really a rounding rule to confirm.
3. **Simplify the data model.** One ledger entry per financial event (not separate sales + payments + ledger documents). Balances are always calculated from entries, never stored as a counter. This removes double-counting and makes offline work safe.
4. **Fix three technical traps before coding:** Next.js static export cannot serve runtime IDs like `/customers/[id]`; Google sign-in on iPhone PWAs breaks unless the auth domain equals the app domain; Vercel's free Hobby plan is non-commercial only.
5. **Add review gates.** Stop after Phase 0 (requirements + screen map) and after Phase 4 (financial engine) for owner sign-off, instead of "do not stop".
6. **Ask the owner about language.** A Kannada/English toggle (marked as an enhancement) may matter more to "no learning needed" than any visual polish.

## Requirement file review (IndianChickenCenter.txt)

All arithmetic in the customer file checks out except one wording slip in Option 1 and the paise truncation in the ledger. The table keeps the customer's original text and records only how we read it.

| Line | Original text (kept as-is) | Check | How to build it, without changing it |
| --- | --- | --- | --- |
| 5 | "Update Customer Details – one time while activating" | Ambiguous | "Customer" here means Umarabba (our customer), i.e. business details. Confirm with owner. |
| 8 | Contact Details: (blank) | Missing value | Field exists, owner fills it in. Needed on every bill. |
| 9 | Google Account: save logs and account details in Google Drive | OK | Drive backup of records + audit log, user-triggered. |
| 12 | Shop location, "Track Location" | Ambiguous | Could mean save the shop pin, or live vehicle tracking. A web app cannot track when closed. Confirm. |
| 14 | Diesel 91/ltr, price changes daily | OK | Price is entered per fill; history never rewritten. |
| 15 | Litres filled, price per litre | OK | Fuel cost = litres × price. Example 8,000 ÷ 91 ≈ 87.9 L. |
| 18 | 5000 kg × 100 Rs/kg | OK | Example only; both values editable. 5,00,000. |
| 19 | 5000 kg × 120 = 6,00,000 | Correct | This 6,00,000 is the purchase used in both profit options. |
| 21 | Order taking after loading [SAME AS BELOW] | Clarify | "Same as below" = same fields as the customer list (customer, kg, rate, amount). Keep orders separate from deliveries. |
| 23 | RouteMatics (OPTIONAL) | OK | Optional; no API assumed. |
| 26–31 | Six customers at 140 Rs/kg | Correct | 2000+500+200+1000+300+870 = 4,870 kg; amounts sum to 6,81,800. |
| 33 | Wastage 5000 − 4870 = 130 kg | Correct | Spelled "Wastege" in source; UI uses "Wastage". |
| 37 | "Laber [3 Labers] = 6000 (Driver, Laber1..5)" | Inconsistent count | Example has 3 people; form allows Driver + Labour 1–5. Both preserved. |
| 38 | Weight loss 130 × 140 = 18,200 | Correct | Wastage valued at selling price, as written. |
| 39–41 | Maintenance, Food, Other (blank) | OK | Categories exist with no example values. |
| 42 | Total expenses 32,200 | Correct | 8,000 + 6,000 + 18,200. Includes wastage. |
| 47–49 | 5000 × 140 = 7,00,000; less 32,200 = 6,67,800 | Correct | Option 1. |
| 50 | "Profit = Initial Purchase 6,00,000 − Selling 6,67,800 = 67,800" | Wording slip | Literal order gives −67,800. Intended: 6,67,800 − 6,00,000. Keep original text in traceability. |
| 54 | "Total purcahsed (after wastege) 4870 × 140" | Label slip | This is the amount sold, not purchased. Display as "Sold (after wastage)". |
| 55–57 | Expenses 14,000; 6,81,800 − 14,000 = 6,67,800; profit 67,800 | Correct | Option 2. Excludes wastage because it is already in the lower kg. |
| 64 | Initial balance 10,625 | OK | OPENING_BALANCE entry. |
| 65 | 63.1 kg × 128 = 8,076 | Truncated | Exact 8,076.80. Rounding gives 8,077; dropping paise gives 8,076. |
| 66 | 153.2 kg × 118 = 18,077 | Truncated | Exact 18,077.60. Rounding gives 18,078; dropping paise gives 18,077. |
| 67 | 10,625 + 8,076 + 18,077 = 36,778 | Correct | Matches with truncated amounts. |
| 68 | Paid 26,000 → balance 10,778, CashPayment | Correct | PAYMENT entry, method Cash. |
| 69 | MonthEndBalance 10,778 | OK | Month-end snapshot, carried forward. |
| 71–72 | Bill via WhatsApp with balance, items, paid | OK | Bill shows previous balance, purchases, paid, current balance. |

**Why both profit options always agree here.** Option 1 subtracts wastage valued at 140 from the full load at 140; Option 2 simply sells fewer kg at 140. Algebraically they are the same number whenever wastage is valued at the selling price and everyone pays the same rate. When customer rates differ (the ledger shows 128 and 118), Option 1 needs a stated valuation rate. Recommended default: the trip's weighted average selling rate, so the two options still reconcile; owner can override.

**Rounding policy recommendation.** *(Superseded by Part 2: the rounding default is now an open owner decision, U-01.)* Store paise exactly. Show line amounts using the owner's rule. The source consistently drops paise, so default to "drop paise per line" and make it a setting (drop / round). Regression tests use the source values: 8,076, 18,077, 36,778, 10,778.

## Questions to confirm with Umarabba

These 14 answers decide behaviour the file leaves open; none of them changes what he wrote. Ask them in one short call before Phase 1. *(Part 2 expands this to 13 numbered decisions, U-01 to U-13.)*

- [ ] **Rounding:** On the bill, do you drop the paise (8,076.80 → 8,076) or round (→ 8,077)?
- [ ] **"Track location":** Save the shop's map pin only, or see where the vehicle is during the trip?
- [ ] **Activation "customer details":** Is this your own business details (name, phone, address) for the bill?
- [ ] **Contact details:** Which phone number(s) and address should print on bills?
- [ ] **Labour:** Pay per person per trip (Driver, Labour 1–5) or one total? Same people every day?
- [ ] **Wastage value:** Keep valuing weight loss at selling price (140), or sometimes at purchase price?
- [ ] **Different customer rates:** When customers pay different rates, which rate should Option 1 use for the full load?
- [ ] **Unsold stock at trip end:** Is leftover chicken wastage, carried to the next trip, or sold at shop?
- [ ] **Trips per day:** One trip a day, or several? One vehicle or more? Vehicle number on records?
- [ ] **Who uses the app:** Only you, or also driver/staff on their phones? Should staff see profit?
- [ ] **Payments:** Cash only, or also UPI / bank transfer? (UPI would be an enhancement.)
- [ ] **Month end:** Calendar month (1st–30th) for month-end balance?
- [ ] **Language:** English only, or Kannada (or another language) for screens and bills?
- [ ] **Bills:** Any GST number or legal text needed on bills? (Default: none, as no tax details were given.)

## Prompt review (attachment.txt)

The prompt's guardrails are excellent; its weaknesses are size, a few internal conflicts and some platform facts that will break on real devices.

### What is already very good

- Treats the customer file as the source of truth, with a traceability matrix and "no silent changes".
- Integer paise, explicit kg precision, append-only ledger, audit trail.
- Honest limits: no fake background tracking, no claim that a wa.me link attaches a PDF, no unattended Drive backups.
- Free-tier discipline: no Cloud Functions, no paid APIs, Spark plan.
- Tests built on the original numbers, and a rule that tests must exercise real logic.

### Conflicts and risks inside the prompt

| Issue | Why it matters | Recommendation |
| --- | --- | --- |
| "Do not stop after documentation" | No checkpoint for you or the owner to correct the screen map or the money rules before code is written. | Add two gates: after Phase 0 and after Phase 4. |
| 14 required documents | Agent time goes into docs, not the app. Docs drift from code. | Keep 5: README, REQUIREMENTS_TRACEABILITY, FINANCIAL_CALCULATIONS, SETUP_AND_DEPLOY, KNOWN_LIMITATIONS. |
| "Extremely simple" vs 9 items in More | Orders, Expenses, Bills are part of the trip and customer flows, not separate places. | More holds only Reports, Backup, Business Profile, Settings, Help. |
| Separate sales/, payments/, ledgerEntries/ collections | Same event stored 2–3 times = the double-counting the prompt itself warns against. | One ledgerEntries collection is the money truth; trip totals read SALE entries by tripId. |
| IndexedDB "where necessary" | Invites a hand-built sync engine, the riskiest code in the app. | Use Firestore's built-in persistent offline cache. No custom sync. |
| "Atomic Firestore transactions" | Transactions fail offline, so a sale could not be saved in a signal dead zone. | Use batched writes with client-made IDs (these queue offline). Derive balances; no counters. |
| Oversell prevention | Cannot be guaranteed offline or across two phones. | Warn on screen when remaining kg goes negative; enforce at trip close. *(Part 2: explicit confirmation required.)* |
| Sequential bill numbers | Needs a central counter, which needs to be online. | *(Superseded by Part 2 §6: collision-resistant internal IDs; visible number assigned online.)* |
| Vercel as target 2 | [Vercel Hobby is non-commercial only](https://vercel.com/docs/platform/fair-use-policy); a business tool needs paid Pro. | Drop Vercel, or note it costs money. Firebase Hosting alone is enough. |
| Language not mentioned | "No need to learn" depends on reading the screen in his language. | Add an i18n-ready label file; Kannada as an enhancement if owner wants it. |

### Technical traps to fix before coding

1. **Next.js static export and dynamic routes.** A static export cannot render `/customers/[id]` for customers created later. Use query routes (`/customer?id=…`) or plain Vite + React Router. Vite is simpler for a static PWA. *(Part 2: Vite confirmed.)*
2. **Google sign-in on iPhone and in installed PWAs.** Popup and redirect flows break in browsers that block third-party storage unless the auth domain matches the app domain. [Firebase's own guidance](https://firebase.google.com/docs/auth/web/redirect-best-practices) is to serve the app on Firebase Hosting and set `authDomain` to that same domain. Another reason to stay on Firebase Hosting.
3. **iPhone install and storage.** iOS has no install button; users tap Share → Add to Home Screen. Request persistent storage so offline data is not evicted. Build an in-app "How to install" card per device.
4. **Google Drive scope.** Use only the `drive.file` scope (files the app created). Browser tokens last about an hour and there is no refresh token without a server, so backups are "tap to back up", and the app reminds weekly.
5. **Security rules can check money.** Rules can verify amount = kg × rate in integer units and forbid update/delete on ledger entries. Corrections become new ADJUSTMENT or REVERSAL entries.
6. **Fonts.** Use the system font stack (-apple-system, Segoe UI, Roboto). Do not bundle SF Pro files; their licence does not allow it on the web.
7. **Spark quotas.** Free Firestore reads are limited per day. Month-end snapshots plus the offline cache keep balance views cheap; avoid re-reading every entry on each screen.

## Premium app plan

The app has one idea: today's trip, step by step, in the owner's own order, with customers and money one tap away.

### Experience principles

1. **One primary button per screen.** The big button always says the next thing to do ("Start trip", "Add loading", "Record sale", "Close trip").
2. **His words, his order.** Steps and labels mirror the customer file: Starting Point, Loading Point, Orders, Distribution, Expenses, Profit, Ledger, Bill.
3. **Type numbers, never calculate.** Every amount (kg × rate, litres × price, balances, profit) appears live as he types, in large tabular figures.
4. **Remember the last value.** Today's diesel price, a customer's last rate and the last loading point are prefilled and editable. (Prefill = enhancement; values never change history.)
5. **Show the sync truth.** Every money entry carries a small status: Saved on phone · Syncing · Saved to cloud · Needs attention.
6. **Undo instead of "Are you sure?"** Posting is quick; corrections are a visible reversal entry, never a silent edit.

### Navigation

| Phone (bottom tabs) | iPad / Android tablet | Mac / Windows |
| --- | --- | --- |
| Today · Trip · Customers · Ledger · More | Sidebar with the same 5; customers in list + detail | Persistent sidebar, wide ledger table, keyboard shortcuts (N new sale, P payment, B bill, / search) |

### Screens

| Screen | What the owner sees | Main action |
| --- | --- | --- |
| Today | Business name + location; trip card with Loaded · Sold · Left · Wastage · Expenses · Profit (marked Provisional while open); To collect (total outstanding); Received today | Contextual: Start trip / Record sale |
| Trip | Six-step stepper: Start (fuel) → Load → Orders → Deliver → Expenses → Close & Profit. Each step shows its total and a tick when done | Next step's action |
| Starting Point sheet | Date, shop location, optional GPS, vehicle, litres, price/litre, live fuel cost | Save fuel |
| Loading sheet | Loading point, kg, rate/kg, live amount; list of loads with different rates | Add loading |
| Orders | Per customer: Ordered · Delivered · Remaining, status pill (Open / Part / Done) | Take order |
| Sale sheet | Customer (recent first), kg (decimal keypad), rate/kg, live amount, optional "Paid now" | Record sale |
| Expenses | Six categories from the file; labour rows Driver + Labour 1–5; fuel auto-linked from Starting Point (no duplicate) | Add expense |
| Close & Profit | Remaining kg → reconcile as wastage (or other, per owner answer); Option 1 and Option 2 side by side, each step shown, a "Both match" check | Close trip |
| Customers | Search; each row shows shop name, name and balance (orange if due) | Add customer |
| Customer detail | Large balance; passbook-style ledger with the file's 7 columns; Sale · Payment · Bill buttons | Share bill |
| Ledger | All balances, month-end close, statement per month | Month-end close |
| Bill preview | Business header, customer, bill no., date, items, previous balance, paid, balance due | Share on WhatsApp / PDF / Print |
| More | Reports · Backup to Google Drive · Business profile · Settings · Help & install | — |

### Key flows and tap targets

| Task | Path | Taps (plus typing) |
| --- | --- | --- |
| Start a trip | Today → Start trip → enter litres (price prefilled) → Save | 2 |
| Record loading | Trip → Add loading → kg, rate → Save | 2 |
| Add customer sale | Record sale → pick customer → kg (rate prefilled) → Save | 3 |
| Record payment | Customers → customer → Payment → amount (Cash default) → Save | 4 |
| See customer balance | Customers → balance is on the row | 1 |
| Generate and share bill | Customer → Bill → Share → WhatsApp | 4 |

### WhatsApp bill (within browser limits)

On phones that support file sharing, "Share" sends the PDF straight to WhatsApp. Elsewhere, the app downloads the PDF and opens WhatsApp chat with a ready text summary (previous balance, today's items, paid, balance due); the owner attaches the PDF. The text-only message always works and is often enough.

## Design system (iOS-style, original)

The premium feel comes from type, spacing and numbers, not decoration: grouped lists, large titles, one accent colour and perfectly aligned rupees.

| Element | Specification |
| --- | --- |
| Font | System stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Kannada", sans-serif |
| Numbers | `font-variant-numeric: tabular-nums`; amounts right-aligned; ₹ with Indian grouping (₹6,81,800) via `Intl.NumberFormat('en-IN')` |
| Type scale | Large title 34/41 bold · Title 22 semibold · Body 17 · Secondary 15 · Caption 13. Key amount on a sheet: 40 semibold |
| Colour (light) | Background #F2F2F7 · Card #FFFFFF · Text #000 / #3C3C43 at 60% · Separator #C6C6C8 |
| Colour (dark) | Background #000 · Card #1C1C1E · Text #FFF / #EBEBF5 at 60% · Separator #38383A |
| Accent | One brand accent for buttons and active tab (proposal: deep green, "fresh"); confirm with owner |
| Semantic | Received = green · Due = orange · Error/reversal = red · Provisional = grey label |
| Shape | Cards radius 12–16, inset grouped lists, hairline separators, no heavy shadows |
| Spacing | 4-pt grid; 16 screen margin on phone, 24 on tablet, 32 on desktop |
| Touch | Minimum 44 × 44 pt targets; primary button 52 tall, full width, sticky above keyboard and safe area |
| Sheets | Bottom sheet on phone (with grabber), centred sheet on tablet/desktop; Save always visible |
| Motion | 200–250 ms ease-out for sheets and step ticks; off under `prefers-reduced-motion` |
| Haptics | `navigator.vibrate(10)` on save where supported (Android); silent elsewhere |
| Inputs | `inputmode="decimal"` for kg and rupees, `inputmode="tel"` for phone; no spinners |
| Brand header | Text only: "Indian Chicken Center" in semibold + "Ujire · Belthangady" in secondary, until a real logo arrives |
| Empty states | One line + one button, e.g. "No trip today. Start trip" |

Recommended next step: build these tokens and the Today, Sale and Bill screens as a clickable design mock-up for Umarabba to try on his phone before any Firebase work.

## Architecture and data model

Keep the prompt's stack, cut the collections from 14 to 8, and make one ledger entry the single truth for every rupee.

**Stack:** React + TypeScript + Tailwind, built as a static PWA with Vite (confirmed in Part 2) · Firebase Auth (Google) · Firestore with `persistentLocalCache` · Firebase Hosting (Spark) · pdf-lib for bills in the browser · Vitest + Playwright + Firebase Emulator.

### Collections

| Collection | Holds | Rule |
| --- | --- | --- |
| settings/business | Name, owner, contacts, location, rounding policy, language, accent | Owner only |
| users/{uid} | Authorised UIDs and role (owner / staff) | Created in Firebase console; never from the app |
| customers/{id} | Shop name, name, phone, optional map pin | No auto-merge; warn on duplicate phone |
| trips/{id} | Date, vehicle, status (open / closed), close summary | Closed trips are read-only |
| tripEvents/{id} | FUEL, LOADING, ORDER, EXPENSE, WASTAGE, each with tripId | Append-only; corrections = REVERSAL |
| ledgerEntries/{id} | OPENING_BALANCE, SALE, PAYMENT, ADJUSTMENT, REVERSAL, MONTH_END_SNAPSHOT, with customerId and optional tripId | Append-only; no update or delete |
| bills/{id} | Bill no., customer, period, entry IDs included, totals at time of issue | Immutable once issued |
| auditLog/{id} | Who did what, when, from which device | Create only |

### Money rules

- Money in integer paise, kg in integer grams, rates in paise per kg.
- Line amount (exact, in paise) = grams × rate ÷ 1,000; posted amount follows the rounding setting (see Part 2 §2).
- A SALE is one ledger entry. Trip "Sold" = sum of SALE entries with that tripId. No second sales document, so no double counting.
- Balance = sum of debits − sum of credits over financial entries (snapshots excluded). Never stored as an editable number.
- Fuel cost entered at Starting Point is the fuel expense. The Expenses screen shows it; it does not create a second one.
- Writes use client-generated IDs in batches, so a repeated tap or a retry after reconnect cannot create duplicates.

### Profit, generalised for different customer rates

```
Option 2 = Σ sales − operating expenses − Σ purchases

Option 1 = (kg loaded × r_v) − (wastage kg × r_v) − operating expenses − Σ purchases
           where r_v = Σ sales ÷ kg sold
```

With the default valuation rate r_v (the trip's average selling rate) both options give the same profit, as in the customer's example: 7,00,000 − 18,200 − 14,000 − 6,00,000 = 67,800, and 6,81,800 − 14,000 − 6,00,000 = 67,800. While a trip has unsold kg, both are labelled Provisional.

## Delivery plan with review gates

Keep the prompt's phases but add two stops where the owner signs off, so screens and money rules are fixed before code depends on them. *(Superseded by the Part 2 implementation plan, which has three gates.)*

1. Phase 0 · Requirements audit — traceability matrix, screen map, money spec, 14 owner questions
2. **Gate 1 · owner approves plan and answers**
3. Phase 1 · Foundation and design system — PWA shell, tokens, Today/Sale/Bill mock-up tried on the owner's phone
4. Phase 2 · Sign-in and security rules — Google sign-in, authorised UIDs, append-only rules, emulator tests
5. Phase 3 · Trip operations — Customers, Starting Point, Loading, Orders, Distribution
6. Phase 4 · Money engine — Expenses, wastage, both profit options, ledger, payments, month-end
7. **Gate 2 · original examples pass, owner OK**
8. Phase 5 · Bills — Preview, PDF in browser, print, WhatsApp share and text fallback
9. Phase 6 · Offline and backup — Offline cache, sync status, Google Drive backup and validated restore
10. Phases 7–9 · Polish, verify, deploy — Device checks, full test run, Firebase Hosting, install guide

Gate 1 is where the owner questions get answered; Gate 2 is where Umarabba checks the app reproduces his own numbers (67,800 profit both ways, 10,778 ledger balance) before billing and offline work begin.

## Prompt addendum to paste into Claude Code (v2)

**Superseded in part by Addendum v3 (Part 2).** Where they conflict, v3 wins: the rounding default is no longer "drop paise" but an open decision; bill IDs are collision-resistant and visible numbers are defined separately; overselling needs explicit confirmation; and the UI and money rules are approved on a clickable prototype before Firebase work.

Append this block to the end of the existing prompt; it overrides only the points it names and leaves the customer requirements untouched.

```text
==================================================
30. ADDENDUM v2 (takes precedence where it conflicts with sections 1-29)
==================================================

A. REVIEW GATES
- Stop after Phase 0 and present: requirements matrix, screen map, financial spec,
  and the open questions list. Wait for approval.
- Stop after Phase 4 and present the financial engine test results on the
  original examples. Wait for approval.

B. DOCUMENTATION (replaces section 27)
Generate only: README.md, REQUIREMENTS_TRACEABILITY.md, FINANCIAL_CALCULATIONS.md,
SETUP_AND_DEPLOY.md, KNOWN_LIMITATIONS.md.

C. HOSTING
- Firebase Hosting (Spark) is the only target. Do not deploy to Vercel Hobby
  (non-commercial only). Keep the build portable.
- Set Firebase authDomain to the domain that serves the app.

D. ROUTING
- Static export must not use runtime dynamic segments. Use query parameters
  (e.g. /customer?id=...) or a client router.

E. DATA MODEL (refines section 20)
- Collections: settings, users, customers, trips, tripEvents, ledgerEntries,
  bills, auditLog.
- A sale is ONE ledgerEntries document (type SALE, customerId, tripId).
  Trip sold totals are derived from it. No separate sales or payments collections.
- Balances are always derived from entries; never store an editable balance.
- ledgerEntries and tripEvents are append-only. Corrections = REVERSAL/ADJUSTMENT.
- Money in integer paise, quantity in integer grams, rate in paise per kg.

F. ROUNDING
- The source ledger drops paise per line: 63.1 x 128 = 8076 (exact 8076.80),
  153.2 x 118 = 18077 (exact 18077.60), totals 36778 and 10778.
- Default display policy: drop paise per line (configurable: drop / round).
- Regression tests must reproduce 8076, 18077, 36778 and 10778 exactly.

G. PROFIT OPTION 1 VALUATION
- Default valuation rate = trip sales / kg sold (weighted average), owner may
  override per trip. Both options must reconcile with this default.
- Show "Provisional" while any loaded kg is unaccounted for.

H. OFFLINE
- Use Firestore persistentLocalCache. Do not build a custom IndexedDB sync engine.
- Use batched writes with client-generated IDs, not transactions, for sales,
  payments and expenses so they queue offline.
- Overselling: warn when remaining kg < 0; block only at trip close.
- Bill numbers: ICC-YYMMDD-NN, generated on the device.
- Call navigator.storage.persist() after sign-in.

I. UX
- Bottom tabs: Today, Trip, Customers, Ledger, More.
- More contains only: Reports, Google Drive Backup, Business Profile, Settings,
  Help & Install. Orders, Expenses and Bills live inside Trip and Customer.
- Trip screen is a 6-step stepper in the order of the customer file.
- Prefill last diesel price, last customer rate, last loading point (editable).
- All labels in one i18n file; English first, Kannada ready (enhancement).
- Use system fonts only; do not bundle SF Pro.

J. DRIVE
- Scope drive.file only. Backups are user-triggered; show last backup date and
  a weekly reminder.
```

---

# PART 2 — Addendum v3: Implementation Plan, Traceability and Financial Tests

## Status key and what v3 changes

All 12 v3 corrections are accepted. Nothing in IndianChickenCenter.txt changes, and the money engine stays switched off for real posting until the owner decides how paise are handled (U-01).

Every item in this part carries one label:

| Label | Meaning | Who can change it |
| --- | --- | --- |
| **C** Confirmed | Written in IndianChickenCenter.txt (C-TXT) or directed in the development prompt (C-PRM) | Only the customer (TXT) or you (PRM) |
| **D** Proposed default | Our engineering choice where the files are silent; documented and reversible | You, at a gate |
| **U** Unresolved | A business decision only Umarabba can make; blocks the feature it affects | Owner |
| **E** Optional enhancement | Beyond both files; off unless approved; must not interfere with C items | You + owner |

| v3 # | Change from v2 | Where handled |
| --- | --- | --- |
| 1 | Vite + React + TS confirmed; Firebase Hosting Spark primary | Plan, P1 |
| 2 | Exact amount and posted amount stored separately; rounding default now **U-01**, not "drop paise" | Financial rules §2 |
| 3 | Explicit debit/credit/reversal/adjustment/snapshot semantics | Financial rules §1 |
| 4 | Stable command IDs; pending vs confirmed writes | Financial rules §5, tests SY-* |
| 5 | No silent overselling; explicit reconciliation | Financial rules §3 |
| 6 | Weighted-average rate = documented default; differences shown, not forced | Financial rules §4, F-PRF-04 |
| 7 | Internal IDs collision-resistant; visible numbering separate; statutory check before "final invoices" | Financial rules §6, U-08 |
| 8 | Emulator tests for auth, immutability, field validation, corrections | Tests S-* |
| 9 | Backup counts only after a verified restore check | Tests B-* |
| 10 | Real-device checks for iPhone Safari and installed PWA | Tests DV-* |
| 11 | Five-section navigation and owner workflow kept; no new screens | Plan |
| 12 | Gate B on clickable UI + money rules before Firebase; Gate C on test evidence | Plan |

## Implementation plan

The money engine is built and tested as plain TypeScript before any Firebase code. The owner approves it on a clickable prototype, so Firebase only stores rules that are already agreed.

**Stack (C-PRM, v3 #1):** Vite + React + TypeScript + Tailwind · vite-plugin-pwa (Workbox) · React Router (client routes, SPA rewrite on Firebase Hosting) · Firebase Auth + Firestore with `persistentLocalCache` · pdf-lib for bills · Vitest, Playwright, `@firebase/rules-unit-testing`. No Cloud Functions, no Cloud Storage, no paid APIs.

1. **P0 — Requirements audit.** Traceability matrix, discrepancy register, decision list (this part).
    - **Gate A:** owner answers U-01 to U-13. Items still open keep their feature disabled, not guessed.
2. **P1 — Shell and design system.** Vite PWA shell, five-section navigation (Today, Trip, Customers, Ledger, More), tokens, light/dark, install guide card.
3. **P2 — Financial engine (no Firebase).** Pure functions in `/src/domain`: money and quantity types, rounding policies, ledger fold, trip inventory, both profit methods, bill totals. All F-* tests green.
4. **P3 — Clickable prototype.** Full UI on an in-memory store labelled DEMO DATA, seeded with the original examples. Runs on the owner's phone from a preview URL.
    - **Gate B:** owner taps through start trip, loading, sale, payment, close trip, bill; confirms the numbers match his own. Sign-off on UI and financial rules recorded.
5. **P4 — Auth and security rules.** Google sign-in, authorised-UID check, activation wizard, Firestore rules. All S-* emulator tests green.
6. **P5 — Persistence and offline.** Firestore repositories behind the same interfaces as the demo store; command IDs, sync status, conflict reporting. SY-* tests green.
7. **P6 — Bills.** Preview, PDF, print, Web Share, WhatsApp text fallback. Bill numbering per U-08.
8. **P7 — Drive backup and restore.** `drive.file` scope, export, upload, verify, restore preview. B-* tests green.
9. **P8 — Device verification.** DV-* matrix on real iPhone, Android phone, iPad, Mac, Windows.
10. **P9 — Deploy.** Firebase Hosting with authDomain = serving domain; production smoke test.
    - **Gate C:** TEST_REPORT.md with results, screenshots and device log. "Production-ready" only after Gate C.

Documents kept (v2 list): README, REQUIREMENTS_TRACEABILITY, FINANCIAL_CALCULATIONS, SETUP_AND_DEPLOY, KNOWN_LIMITATIONS, plus TEST_REPORT at Gate C.

## Financial rules

Every rupee lives in one immutable event, balances are always recomputed from those events, and nothing posted is ever edited.

### 1. Customer ledger events (v3 #3)

Sign convention (D-05): a **debit** raises what the customer owes; a **credit** lowers it. Balance = Σ debits − Σ credits over financial events only.

| Event | Direction | Rules | Source |
| --- | --- | --- | --- |
| OPENING_BALANCE | Debit (credit if advance, U-10) | At most one per customer, before any other event; amount entered, not calculated | C-TXT L64 |
| SALE | Debit | Stores grams, rate (paise/kg), exact amount, posted amount, policy ID, tripId | C-TXT L65–66 |
| PAYMENT | Credit | Amount, method (Cash default, C-TXT L68), date, optional reference | C-TXT L68 |
| REVERSAL | Opposite of original | Points to one original event; same posted amount; one reversal per original; original untouched | C-PRM |
| ADJUSTMENT | Debit or credit | Owner only; reason required; never used to fix a typo (that is REVERSAL + new event) | C-PRM |
| MONTH_END_SNAPSHOT | None (checkpoint) | Records closing balance and the last event included; **excluded from every sum**; recompute wins if they ever differ | C-TXT L69 |

No separate sales or payments collections: a SALE event is the sale. Trip totals read SALE events by tripId. A ledger read never adds a snapshot to events, so a snapshot cannot double a balance.

### 2. Exact amount vs posted amount (v3 #2)

- Units: grams (integer), paise per kg (integer), money in paise (integer).
- **Exact amount** = grams × rate ÷ 1,000, kept as the integer numerator grams × rate (milli-paise), so no precision is lost.
- **Posted amount** = exact amount after the active rounding policy, in paise. Only posted amounts enter balances, bills and totals.
- Each SALE stores exact, posted, policyId and the difference. Example: 63.1 kg × ₹128 → exact ₹8,076.80; posted ₹8,076 under TRUNCATE_RUPEE.
- Policies available: TRUNCATE_RUPEE (matches the source ledger), ROUND_HALF_UP_RUPEE, EXACT_PAISE (keeps paise; sub-paise rounded half-up). **Which one is live is U-01.** Until answered, real posting is disabled and the prototype shows all three side by side.
- Changing the policy affects only new events. Posted history never changes (test F-RND-04).

### 3. Trip inventory (v3 #5)

- Remaining kg = loaded − delivered (SALE) − recorded wastage − other reconciled kg. Orders never move stock (C-PRM).
- A sale above remaining stock is blocked unless the owner taps an explicit "Sell more than stock" confirmation, which is stored on the event (D-04). It is never silent.
- Closing a trip requires online access, recomputes from server data, and requires remaining = 0 through explicit lines: wastage, plus other outcomes per U-05.
- Limitation (documented, not hidden): two offline phones can each sell the same kg. The app shows "Saved on phone" and the conflict surfaces at close, not before.

### 4. Profit (v3 #6)

- **Option 2 (C-TXT L53–57):** sales − operating expenses − purchases.
- **Option 1 (C-TXT L46–51):** loaded kg × valuation rate − wastage kg × valuation rate − operating expenses − purchases. Original total expenses (wastage + operating) shown as in the source.
- Default valuation rate (D-03): trip sales ÷ kg sold, computed as a fraction so the two options match to the paisa. The owner may override per trip; the screen then shows "Methods differ by ₹X because valuation rate ₹a ≠ average ₹b".
- Any open trip with unaccounted kg shows both as **Provisional**; no "final" figure until closed.

### 5. Offline commands (v3 #4)

- The event ID is generated when the form opens and saved with the draft, so a retry, double tap or reload reuses it. Rules allow create only, so a repeat write of an existing ID is rejected and the app treats it as "already saved", never as a second entry.
- Each event and its audit record go in one batched write. Status comes from Firestore metadata: `hasPendingWrites` → "Saved on phone"; server-confirmed snapshot → "Saved to cloud"; rejected write → "Needs attention" with the reason.

### 6. Bills and numbering (v3 #7)

- Internal ID: Firestore auto-ID (collision-resistant, offline-safe).
- Visible number: separate field, format proposed as ICC/2026-27/0001 (D-07), assigned by a counter transaction **when online**. Offline, a bill can be previewed and shared as "Statement" without a visible number.
- The document is titled "Bill" as in the source (C-TXT L71). No tax fields, GST number or legal classification until U-08 is verified.

## Requirements traceability matrix

All 36 requirements in IndianChickenCenter.txt map to a build item and at least one test; 11 depend on an open decision. Original wording is quoted (spelling kept); every row is C-TXT unless a decision is noted.

| ID | Line | Original requirement | Build | Tests | Open |
| --- | --- | --- | --- | --- | --- |
| R01 | 5 | Update Customer Details – one time while activating | Activation wizard, shown once, recoverable | E2E-ACT-1, S-01 | U-03 |
| R02 | 6 | Name of the Business: Indian Chicken Center | settings.business.name, editable | E2E-ACT-1 | — |
| R03 | 7 | Owner Name: Umarabba | settings.business.owner | E2E-ACT-1 | — |
| R04 | 8 | Contact Details | Phone/address fields, printed on bill | F-BILL-01 | U-04 |
| R05 | 9 | Google Account (save logs, account details in google drive) | Drive backup incl. audit log | B-01–B-06 | — |
| R06 | 12 | Shop Location: Ujire/Belthangady | settings.location + optional map pin | E2E-ACT-1 | — |
| R07 | 12 | (Track Location) | GPS capture at trip start with permission | DV-07 | U-02 |
| R08 | 13 | Vehicle Fuel Loading – Diesel | FUEL trip event, fuel type Diesel | F-FUEL-01 | U-06 |
| R09 | 14 | Daily fuel price changing, current 91/ltr | Price per entry; history immutable | F-FUEL-02 | — |
| R10 | 15 | Number of liters filled, fuel price per liter | Litres × price = cost | F-FUEL-01 | — |
| R11 | 18 | Loaded chicken 5000kg × 100 Rs/kg, both editable | LOADING event | F-LOAD-01 | — |
| R12 | 19 | Per kg value may change at each point; 5000 × 120 = 6,00,000 | Multiple loadings per trip, own rates | F-LOAD-02, F-LOAD-03 | — |
| R13 | 21 | Order taking After Loading [SAME AS BELOW] | ORDER event: customer, kg, rate, amount; no stock move | F-INV-03 | — |
| R14 | 23 | [RouteMatics](OPTIONAL) | Not integrated; interface stub; maps link (E-04) | — | — |
| R15 | 25–31 | Travel to customers; Customer1–6, kg × 140 | SALE events, per-customer rate | F-SALE-01–06, F-SALE-08 | — |
| R16 | 32 | Total 4870kg × 140 = 6,81,800 | Trip totals from SALE events | F-SALE-07 | — |
| R17 | 33 | Wastege = 5000 − 4870 = 130kg | Reconciliation line at close | F-WST-01, F-INV-02 | U-05 |
| R18 | 36 | Fuel: Diesel = 8000 | Expense view reads FUEL event, no duplicate | F-EXP-03 | — |
| R19 | 37 | Laber [3 Labers] = 6000 (Driver, Laber1..5) | Labour lines: Driver + Labour 1–5 | F-EXP-01, F-EXP-04 | U-13 |
| R20 | 38 | Weight Loss: 130kg × 140 = 18,200 (Wastege) | Wastage valuation | F-WST-01 | U-11 |
| R21 | 39 | Vehicle Maintanance | Expense category | F-EXP-05 | — |
| R22 | 40 | Food Expenses | Expense category | F-EXP-05 | — |
| R23 | 41 | Other Expenses | Expense category | F-EXP-05 | — |
| R24 | 42 | Total Expenses 32,200 | Expense summary incl. wastage | F-EXP-02 | — |
| R25 | 46–51 | OPTION 1 profit = 67,800 | Option 1 view with every step | F-PRF-01, F-PRF-03–05 | — |
| R26 | 53–57 | OPTION 2 profit = 67,800 | Option 2 view with every step | F-PRF-02, F-PRF-03–05 | — |
| R27 | 62 | Customer: [Shop name][Name][contact number] | Customer record; no auto-merge | E2E-CUS-1 | — |
| R28 | 63 | Ledger columns: Date, TotalItemsInKG, ItemPerKG, TotalAmount, PaidAmount, BalanceAmount, Comments | Ledger table, exactly these 7 columns | F-LED-04 | — |
| R29 | 64 | BalanceAmount 10,625 – Initial Balance | OPENING_BALANCE | F-LED-01 | U-10 |
| R30 | 65 | 63.1 × 128 = 8076 | SALE, exact + posted | F-LED-02, F-RND-01 | U-01 |
| R31 | 66 | 153.2 × 118 = 18077 | SALE, exact + posted | F-LED-03, F-RND-02 | U-01 |
| R32 | 67 | 10,625 + 8076 + 18077 = 36778 | Running balance | F-LED-04 | — |
| R33 | 68 | PaidAmount 26000 → 10778, CashPayment | PAYMENT, method Cash | F-LED-05 | — |
| R34 | 69 | BalanceAmount 10778 – MonthEndBalance | MONTH_END_SNAPSHOT | F-LED-06, F-LED-07, F-LED-12 | — |
| R35 | 71 | Generate Bill and send to customer using whatsapp | Bill PDF, Web Share, wa.me text fallback | F-BILL-02, DV-04, DV-05 | U-08 |
| R36 | 72 | Bill with Balance, items purchase and paid details | Bill: previous balance, items, paid, current balance | F-BILL-01 | — |

## Discrepancies, defaults, decisions and enhancements

Six discrepancies are recorded but not corrected in the source. Twelve defaults are proposed, 13 decisions belong to the owner, and 6 enhancements stay off unless approved.

### Discrepancy register (source text preserved)

| ID | Line | Source says | Observation | Implementation |
| --- | --- | --- | --- | --- |
| DSC-01 | 50 | "Initial Purchase price 6,00,000 − Selling Price 6,67,800 = 67,800" | Literal order gives −67,800 | Profit = 6,67,800 − 6,00,000; source text kept in docs |
| DSC-02 | 54 | "Total purcahsed (after wastege) 4870kg" | 4,870 kg is the quantity sold | UI label "Sold (after wastage)" |
| DSC-03 | 65–66 | 8076, 18077 | Exact values 8,076.80 and 18,077.60; source drops paise | Exact + posted stored; policy = U-01 |
| DSC-04 | 37 | "[3 Labers]" with "(Driver, Laber1..5)" | Example count differs from slots | Driver + Labour 1–5 slots; any number used |
| DSC-05 | 18–19 | 5000 × 100 and 5000 × 120 | Two purchase examples; profit uses 6,00,000 (the 120 rate) | Both tested; profit tests use 6,00,000 |
| DSC-06 | 5 | "Update Customer Details" at activation | Likely means the business's own details | Wizard collects business details; U-03 confirms |

### Proposed defaults (D)

| ID | Default | Why |
| --- | --- | --- |
| D-01 | Vite + React + TS static PWA | v3 #1; no server rendering needed |
| D-02 | Firebase Hosting Spark; authDomain = serving domain | Free; reliable Google sign-in on iPhone |
| D-03 | Valuation rate = trip sales ÷ kg sold, owner may override | Both profit methods reconcile; differences shown |
| D-04 | Overselling needs explicit confirmation, stored on the event | No silent oversell |
| D-05 | Debit = customer owes more; credit = owes less | Matches source columns |
| D-06 | Firestore auto-IDs, generated at form open | Collision-resistant, retry-safe |
| D-07 | Visible bill number ICC/2026-27/0001, assigned online | Readable, Indian financial year |
| D-08 | Month end = calendar month, Asia/Kolkata time | Matches "MonthEndBalance" |
| D-09 | Snapshots never summed; recompute wins | No double counting |
| D-10 | Payment method Cash, preselected | Source shows CashPayment |
| D-11 | Trip close needs network | Reconcile against server truth |
| D-12 | Only the owner can post ADJUSTMENT or month-end close | Protects history |

### Unresolved business decisions (U) — owner answers at Gate A

| ID | Question | Blocks |
| --- | --- | --- |
| U-01 | Drop paise, round to rupee, or keep paise on ledger lines? | Real posting of SALE events |
| U-02 | "Track location": shop pin only, or vehicle location during trip? | R07 scope |
| U-03 | Activation "customer details" = your own business details? | Wizard wording |
| U-04 | Phone(s) and address to print on bills | Bill header |
| U-05 | Unsold kg at trip end: wastage, carry to next trip, or shop sale? | Trip close |
| U-06 | Trips per day, vehicles, vehicle number needed? | Trip form |
| U-07 | Will driver/staff use the app? May they see profit? | Roles, rules |
| U-08 | GST or any statutory text on bills? | Final invoices; visible numbering |
| U-09 | Screen and bill language | i18n launch set |
| U-10 | Can an opening balance be an advance (customer in credit)? | OPENING_BALANCE sign |
| U-11 | Value wastage at selling rate always, or sometimes purchase rate? | Option 1 valuation |
| U-12 | Accent colour; real logo available? | Brand header |
| U-13 | Labour paid per person per trip, or one total? | Labour form |

### Optional enhancements (E) — off unless approved

| ID | Enhancement | Note |
| --- | --- | --- |
| E-01 | UPI / bank transfer payment methods | Cash remains default |
| E-02 | Kannada screens and bills | Depends on U-09 |
| E-03 | Prefill last diesel price, customer rate, loading point | Always editable; history unaffected |
| E-04 | Customer map pins, manual delivery order, open in Maps | RouteMatics stays a stub |
| E-05 | Weekly backup reminder | No unattended backup |
| E-06 | Customer statement PDF for a chosen month | Uses the same bill engine |

## Financial test specification

There are 49 financial tests. Each one sends inputs through the real engine functions and compares the result with a fixed value checked by hand. No expected value is computed by the code under test. Values are in rupees for reading; tests assert in paise and grams. "Source" = example from IndianChickenCenter.txt; "Synthetic" = added to cover a rule.

### Purchases, fuel and sales

| ID | Input | Expected | Kind |
| --- | --- | --- | --- |
| F-FUEL-01 | 87.5 L × ₹91/L | ₹7,962.50 | Synthetic |
| F-FUEL-02 | Post fuel at ₹91, then set today's price to ₹93 | First entry still ₹91 and unchanged cost | Synthetic |
| F-LOAD-01 | 5,000 kg × ₹100 | ₹5,00,000 | Source L18 |
| F-LOAD-02 | 5,000 kg × ₹120 | ₹6,00,000 | Source L19 |
| F-LOAD-03 | 3,000 kg × ₹120 + 2,000 kg × ₹110 | 5,000 kg, ₹5,80,000 | Synthetic |
| F-SALE-01 | 2,000 kg × ₹140 | ₹2,80,000 | Source L26 |
| F-SALE-02 | 500 kg × ₹140 | ₹70,000 | Source L27 |
| F-SALE-03 | 200 kg × ₹140 | ₹28,000 | Source L28 |
| F-SALE-04 | 1,000 kg × ₹140 | ₹1,40,000 | Source L29 |
| F-SALE-05 | 300 kg × ₹140 | ₹42,000 | Source L30 |
| F-SALE-06 | 870 kg × ₹140 | ₹1,21,800 | Source L31 |
| F-SALE-07 | Trip total of F-SALE-01–06 | 4,870 kg, ₹6,81,800 | Source L32 |
| F-SALE-08 | 2,000 kg × ₹140 + 2,870 kg × ₹135 | ₹6,67,450 | Synthetic |

### Rounding (posted vs exact)

| ID | Input | TRUNCATE_RUPEE | ROUND_HALF_UP_RUPEE | EXACT_PAISE | Kind |
| --- | --- | --- | --- | --- | --- |
| F-RND-01 | 63.1 kg × ₹128 (exact ₹8,076.80) | ₹8,076 | ₹8,077 | ₹8,076.80 | Source L65 |
| F-RND-02 | 153.2 kg × ₹118 (exact ₹18,077.60) | ₹18,077 | ₹18,078 | ₹18,077.60 | Source L66 |
| F-RND-03 | 0.5 kg × ₹101 (exact ₹50.50) | ₹50 | ₹51 | ₹50.50 | Synthetic |
| F-RND-05 | 1.234 kg × ₹99.99 (exact ₹123.38766) | ₹123 | ₹123 | ₹123.39 (sub-paise half-up) | Synthetic |

- **F-RND-04:** post F-RND-01 under TRUNCATE, switch policy to ROUND, post F-RND-02. Expected: first event still ₹8,076, second ₹18,078, balance from ₹10,625 opening = ₹36,779; no stored event changed.
- **F-RND-06:** F-RND-01 under TRUNCATE stores exact ₹8,076.80, posted ₹8,076, difference ₹0.80, policyId TRUNCATE_RUPEE.

### Wastage, expenses and inventory

| ID | Input | Expected | Kind |
| --- | --- | --- | --- |
| F-WST-01 | Loaded 5,000 kg, sold 4,870 kg, valuation ₹140 | 130 kg; ₹18,200 | Source L33, L38 |
| F-EXP-01 | Fuel ₹8,000 + Labour ₹6,000 | Operating ₹14,000 | Source L55 |
| F-EXP-02 | Operating + wastage ₹18,200 | Total ₹32,200 | Source L42 |
| F-EXP-03 | Fuel posted at Starting Point, then open Expenses | Fuel listed once; total ₹8,000, not ₹16,000 | Synthetic |
| F-EXP-04 | Driver ₹2,000 + Labour 1 ₹2,000 + Labour 2 ₹2,000 | ₹6,000 | Synthetic split of L37 |
| F-EXP-05 | Maintenance ₹0, Food ₹300, Other ₹150 added to F-EXP-01 | Operating ₹14,450 | Synthetic |
| F-INV-01 | Loaded 5,000, sold 4,950, new sale 100 kg | Blocked; with explicit confirmation saved, flagged, remaining −50 kg | Synthetic |
| F-INV-02 | Close trip with 130 kg remaining | Blocked until 130 kg wastage line; then remaining 0, close allowed | Source L33 |
| F-INV-03 | Order 500 kg for Customer2; deliver 300 kg | Stock unchanged by order; order shows delivered 300, remaining 200, status Part | Synthetic |

### Profit

| ID | Input | Expected | Kind |
| --- | --- | --- | --- |
| F-PRF-01 | Option 1: 5,000 kg × ₹140, wastage ₹18,200, operating ₹14,000, purchase ₹6,00,000 | Value after expenses ₹6,67,800; profit +₹67,800 (never −₹67,800) | Source L46–51 |
| F-PRF-02 | Option 2: sales ₹6,81,800, operating ₹14,000, purchase ₹6,00,000 | After expenses ₹6,67,800; profit ₹67,800 | Source L53–57 |
| F-PRF-03 | F-SALE-08 sales, 4,870 kg sold, 130 kg wastage, operating ₹14,000, purchase ₹6,00,000, default rate | Option 2 ₹53,450; Option 1 full load ₹6,85,266.94, wastage ₹17,816.94, profit ₹53,450.00; difference ₹0.00 | Synthetic |
| F-PRF-04 | F-PRF-03 with valuation rate overridden to ₹140 | Option 1 ₹67,800; Option 2 ₹53,450; difference ₹14,350 displayed, not forced | Synthetic |
| F-PRF-05 | Open trip with 200 kg unaccounted | Both options marked Provisional; no final profit shown | Synthetic |
| F-PRF-06 | Source sales with purchase 5,000 kg × ₹100 | Both options ₹1,67,800 | Source L18 variant |

### Ledger (customer from source lines 63–69, TRUNCATE policy)

| ID | Action | Expected balance | Kind |
| --- | --- | --- | --- |
| F-LED-01 | Opening balance ₹10,625 | ₹10,625 | Source L64 |
| F-LED-02 | Sale 63.1 kg × ₹128 | ₹18,701 | Source L65 |
| F-LED-03 | Sale 153.2 kg × ₹118 | ₹36,778 | Source L66–67 |
| F-LED-04 | Ledger view rows | 7 columns; running balances ₹10,625 → ₹18,701 → ₹36,778 → ₹10,778 | Source L63 |
| F-LED-05 | Cash payment ₹26,000 | ₹10,778 | Source L68 |
| F-LED-06 | Month-end snapshot | Snapshot ₹10,778; balance still ₹10,778 (not ₹21,556) | Source L69 |
| F-LED-07 | Next month: sale 10 kg × ₹130 | ₹12,078 by snapshot path and full recompute | Synthetic |
| F-LED-08 | Then partial payment ₹5,000 | ₹7,078 | Synthetic |
| F-LED-09 | From ₹10,778, reverse the 63.1 kg sale | Credit ₹8,076; ₹2,702; original unchanged; second reversal rejected | Synthetic |
| F-LED-10 | Adjustment ₹500 debit without reason; then with reason | Rejected; then balance +₹500 | Synthetic |
| F-LED-11 | Same sale event ID submitted twice | One event; balance unchanged by the repeat | Synthetic |
| F-LED-12 | Snapshot stored as ₹10,000 but events give ₹10,778 | Mismatch flagged; ₹10,778 shown | Synthetic |

### Bill and formatting

| ID | Input | Expected | Kind |
| --- | --- | --- | --- |
| F-BILL-01 | Bill for source month | Previous ₹10,625; items 216.3 kg, ₹26,153; paid ₹26,000; current ₹10,778 | Source L64–72 |
| F-BILL-02 | WhatsApp fallback for phone 9876543210, balance ₹10,778 | URL `https://wa.me/919876543210?text=…` with ₹ encoded as `%E2%82%B9` and "10,778" intact | Synthetic |
| F-FMT-01 | 1000; 100000; 681800; 8076.80 | ₹1,000; ₹1,00,000; ₹6,81,800; ₹8,076.80 | Prompt examples |

## Security, sync, backup and device verification

These tests back up the financial tests. Security and sync run in the Firebase Emulator. Backup and device checks run against real Google and real hardware and are logged in TEST_REPORT.md.

### Security rules (Emulator, v3 #8)

| ID | Attempt | Expected |
| --- | --- | --- |
| S-01 | Unauthenticated read of any collection | Denied |
| S-02 | Signed-in Google user not in users/ reads customers or ledger | Denied |
| S-03 | Authorised user writes to users/ or changes own role | Denied |
| S-04 | Update or delete any ledgerEntries or tripEvents document | Denied |
| S-05 | SALE whose posted amount does not match grams × rate under the stored policy | Denied |
| S-06 | SALE with createdBy ≠ caller, missing fields, wrong types, negative kg or rate | Denied |
| S-07 | REVERSAL of a missing event, with a different amount, or a second reversal of the same event | Denied |
| S-08 | ADJUSTMENT without reason, or by non-owner | Denied |
| S-09 | New event on a closed trip | Denied |
| S-10 | Valid owner SALE, PAYMENT, REVERSAL, ADJUSTMENT | Allowed |

Rules cannot add up documents. So they cannot check stock levels or customer balances. Those checks are done in the app and at trip close, and the limit is recorded in KNOWN_LIMITATIONS.md.

### Offline and sync (v3 #4)

| ID | Scenario | Expected |
| --- | --- | --- |
| SY-01 | Record sale with network off | Shows "Saved on phone"; balance updates locally, marked pending |
| SY-02 | Reconnect | Status becomes "Saved to cloud" only after server confirmation |
| SY-03 | Double-tap Save; reload mid-save; retry | One event with the original ID |
| SY-04 | Write rejected by rules after reconnect | "Needs attention" with reason; balance excludes it |
| SY-05 | Two devices offline sell from the same trip, then reconnect | Both events kept; trip shows oversold; close blocked until reconciled |
| SY-06 | Close trip while offline | Blocked with plain message |

### Google Drive backup and restore (v3 #9)

| ID | Step | Pass condition |
| --- | --- | --- |
| B-01 | Connect with `drive.file` scope only | Consent screen lists no wider scope |
| B-02 | Export | JSON with schemaVersion, record counts, SHA-256, no tokens |
| B-03 | Upload, then download the same file ID | Checksum matches |
| B-04 | Dry-run restore of downloaded file into a blank emulator | Same record counts and same balance for every customer |
| B-05 | Mark backup "Verified" | Only after B-03 and B-04 pass |
| B-06 | Restore into live data | Preview, owner confirmation, adds missing IDs only, never overwrites |

### Real devices (v3 #10)

| ID | Check | iPhone Safari | iPhone installed | Android Chrome | iPad | Mac | Windows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DV-01 | Google sign-in | □ | □ | □ | □ | □ | □ |
| DV-02 | Session restored after app closed and reopened next day | □ | □ | □ | □ | □ | □ |
| DV-03 | Install to home screen / dock | — | □ | □ | □ | □ | □ |
| DV-04 | Share bill PDF to WhatsApp | □ | □ | □ | □ | □ | □ |
| DV-05 | WhatsApp text fallback opens correct chat | □ | □ | □ | □ | □ | □ |
| DV-06 | Offline sale survives app restart; storage persisted | □ | □ | □ | □ | □ | □ |
| DV-07 | Location permission prompt and manual fallback | □ | □ | □ | □ | □ | □ |
| DV-08 | Print bill | □ | □ | □ | □ | □ | □ |

□ = to be verified and logged with device, OS version, date and result. Nothing is marked working until it has been seen working on that device.
