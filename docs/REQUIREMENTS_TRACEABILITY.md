# Requirements traceability — Gate A decisions

Umarabba's answers came in on 22 Nov 2026. Eleven of the 13 decisions are settled or settled in outline. Two were not asked: U-10 and U-12. Live vehicle tracking and GST amounts each need one more decision (see Open questions below).

The full 36-row traceability matrix stays in `Indian_Chicken_Center_Plan.md` (Part 2). This file records each answer and what the engine does with it. "G-xx" are the tests in `src/domain/__tests__/gate-a-decisions.test.ts`.

## Answers

| ID | Question | Owner's answer | Status | Built as |
| --- | --- | --- | --- | --- |
| U-01 | Drop paise or round? | Round (8,076.80 → 8,077) | Resolved | Default rounding is now round to the rupee; it can still be changed in Settings. The source customer now ends at ₹10,780 instead of ₹10,778 (G-01). |
| U-02 | Shop pin or vehicle tracking? | Both | Needs a platform choice | Shop map pin is in Settings. Live vehicle position: see Open questions 1. |
| U-03 | Activation details = own business? | Yes | Resolved | Business details live in Settings. |
| U-04 | Contact details on bills | Settings for owner name, phone, email, WhatsApp and all details | Resolved | Settings hold all contact details, with a show/hide switch per field for bills. The bill header is built from Settings (G-08, G-09). |
| U-05 | Unsold kg at trip end | Sold at the shop, or shown as wastage | Resolved | New shop-sale entry (kg × rate, payment method) plus wastage. The trip closes only when 0 kg are left (G-05). |
| U-06 | Trips, vehicles, vehicle number | One trip a day per vehicle; 6 vehicles; vehicle number yes | Resolved | Vehicle number is required and cleaned up (`ka-21 ab 1234` → `KA21AB1234`). One trip per vehicle per day (G-03). |
| U-07 | Who uses the app | Owner full access; Driver trip details; Manager manager level | Resolved in outline | Role table in `permissions.ts` (G-07). The exact split is D-17 below; please confirm it. |
| U-08 | GST on bills | Can be switched on in Settings | Partly | When on, the GSTIN and optional legal text print. Tax amounts are not calculated yet (Open questions 2). |
| U-09 | Language | English and Kannada, screens and bills | Resolved | Bill text works in both languages (G-08). The Kannada wording is a draft for a native reader to check. Screens come in P1. |
| U-10 | Opening balance as an advance? | Not asked | Open | Still disabled |
| U-11 | Wastage valued at selling or purchase price? | Selling price | Resolved | Wastage is valued at the same rate as the full load in Option 1 (see the note below). |
| U-12 | Accent colour, logo | Not asked | Open | Proposal stays deep green, text-only header |
| U-13 | Labour per person or one total? Same people? | Both options; people change per trip | Resolved | Per-person lines (Driver, Labour 1–5) with that trip's worker names, or one total. A trip uses one style or the other, not both (G-06). |
| E-01 | UPI / bank transfer | Cash, UPI and bank transfer | Approved | Payments take a method and an optional reference (UPI or UTR number) (G-02). |
| E-02 | Kannada | Yes | Approved | See U-09 |
| D-03 | Rate for Option 1 when customer rates differ | A default customer rate per trip, set by the owner; the owner can change the rate per customer | Changed | Each trip has a default selling rate, set when it opens and changeable later. Drivers sell at that rate; owner or manager may change it on a sale. Option 1 values the load at the trip rate; if no rate is set, it uses the average selling rate (G-04, G-04b). |
| D-08 | Month end = calendar month | Yes | Confirmed | Already built |

**Wastage at selling price.** This is what the requirement does: 130 kg × ₹140 = ₹18,200. It is also the right choice for Option 1, because Option 1 values the full load at the selling price. If the full load were valued at ₹140 and the wastage at the ₹120 purchase price, Option 1 would overstate profit by 130 × ₹20 = ₹2,600 and stop matching Option 2. The cost of the lost chicken at purchase price (₹15,600) can still be shown on its own as information.

## New proposed defaults to confirm

| ID | Default | Why |
| --- | --- | --- |
| D-17 | Role split below | The owner's answer gives the roles, not the detail |
| D-18 | A driver sells only at the trip default rate; owner or manager can change the rate on a sale | "Owner can change rate per customer" |
| D-19 | A shop sale uses the same rounding as customer sales and has no customer ledger | Paid at the shop on the spot |
| D-20 | A trip uses either per-person labour lines or one labour total, never both | Prevents counting labour twice |
| D-21 | Only owner or manager record loading (kg × purchase rate) | Keeps purchase rates away from drivers |
| D-22 | People join by invite: the owner enters a Google email and a role (Manager or Driver) under More → People. The user record is made when that account first signs in. | The plan had user records made only in the Firebase console, which the owner cannot easily do. The rules still stop anyone choosing their own role. |
| D-23 | A second owner can be added only in the Firebase console | Owner access covers everything, so it should never be one tap away |
| D-24 | An opening balance is entered only when the customer is added | Rules cannot see a customer's other entries; saving both together keeps the opening balance first |
| D-25 | A trip-rate change is never reversed; the owner or manager sets the rate again | The trip keeps its current rate, and the rules check drivers' sales against it (ENG-18) |
| D-26 | Month-end closes go in order for each customer | The rules then need only one "closed through" month per customer |
| D-27 | Each phone reads last month and this month (plus month-end snapshots), not the whole history | Keeps daily reads inside the free plan while months are closed on time (KNOWN_LIMITATIONS.md) |
| D-28 | Anyone who sends bills (owner, manager, driver) can issue a numbered bill; numbers run per financial year from 0001 | The D-17 table lets drivers send bills. One series per year matches how GST bills are usually numbered; the accountant should confirm (open question 2) |

### Role split (D-17)

| Action | Owner | Manager | Driver |
| --- | --- | --- | --- |
| Settings, users, rounding, GST | Yes | No | No |
| Adjustments, month-end close | Yes | No | No |
| Open and close trips, set the trip rate, record loading | Yes | Yes | No |
| See purchase rates and profit | Yes | Yes | No |
| Change the rate on a sale, reverse an entry, add customers | Yes | Yes | No |
| Fuel, orders, expenses, wastage on a trip | Yes | Yes | Own trip only |
| Sales and payments | Yes | Yes | Own trip only, at the trip rate |
| See customer balances, send bills | Yes | Yes | Yes |

## Open questions (Gate A follow-up)

1. **Live vehicle tracking (U-02).** A web app can report its position only while it is open on screen. Choose one:
   - (a) The driver keeps the app open, and it reports position about once a minute.
   - (b) Package the app as an Android app so it can track in the background. This is more work and needs Play Store approval for background location.
   - (c) Use the vehicles' GPS trackers, or WhatsApp / Google Maps live location sharing.

   Suggested: (a) now, plus (c) if the vehicles already have trackers.
2. **GST (U-08).** Before the app calculates any tax, his accountant should confirm:
   - the rate, and whether ₹140/kg already includes GST;
   - whether GST adds to the customer's balance;
   - which bill title to use.

   Fresh chicken is often GST-exempt, in which case a registered dealer issues a bill without tax.
3. **Manager and driver detail (U-07).**
   - May the manager see profit and purchase rates?
   - May drivers see customer balances and send bills?
4. **Loading.** Who enters kg and the purchase rate at the loading point? Today only the owner or manager can (D-21).
5. **Rate per customer.** Is a change on the sale enough, or should each customer keep their own saved rate for future trips?
6. **Shop sales.** Does the owner type the shop rate each time, or should Settings hold a shop rate?
7. Not asked yet: U-10 (opening balance as an advance) and U-12 (colour, logo).
8. **Daily reads (D-27).** If the business grows past the free plan's 50,000 reads a day, should the app move to the pay-as-you-go plan (a few rupees a day at this size), or load last month only when someone opens it?
9. Still open from the build:
   - How should a sale be corrected after its trip is closed?
   - What happens to a sale that syncs after its trip closed?
