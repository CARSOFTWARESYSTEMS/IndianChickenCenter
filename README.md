# Indian Chicken Center

Trip, ledger and billing app for a chicken distribution business in Ujire / Belthangady. It is planned as an offline-first PWA on Vite, React and Firebase.

## Where things are

- `docs/IndianChickenCenter.txt` — the customer's requirement (source of truth, never edited)
- `docs/Indian_Chicken_Center_Plan.md` — the app plan (Part 2 wins over Part 1)
- `docs/FINANCIAL_CALCULATIONS.md` — the money rules as built, and where they differ from the plan
- `docs/SETUP_AND_DEPLOY.md` — connecting Firebase, adding the first owner, trying sign-in with the emulators
- `src/domain/` — the money engine (pure TypeScript) and its tests
- `firestore.rules` — the same money and role rules on the server, tested in `tests/rules`

## Commands

```bash
npm install
```

```bash
npm test
```

```bash
npm run test:emulator
```

```bash
npm run dev
```

`npm run test:emulator` starts the Firestore emulator, so it needs Java 21 or newer.

## Status

- **P2 money engine:** built. All 49 financial tests from the plan pass, plus 17 engine tests and 10 tests for the owner's answers.
- **Gate A:** answered on 22 Nov 2026 (see `docs/REQUIREMENTS_TRACEABILITY.md`), with a few follow-up questions.
- **P1 shell and design system:** built. It has:
  - five sections: Today, Trip, Customers, Ledger, More
  - light and dark modes, English and Kannada
  - an installable app that opens offline
  - More → Design system shows every component
- **P3 clickable prototype:** built. Every flow works on demo data kept on the device, marked "Demo data" on screen.
- **P4 sign-in and security rules:** built.
  - Google sign-in. Only people with a user record can open the app. The owner adds managers and drivers by email under More → People.
  - On the owner's first sign-in, a short set-up asks for business details, bill rounding and bill language.
  - Firestore rules repeat the money engine on the server: posted entries are never edited, every amount is re-checked in whole paise, and each role can do only its own part. A driver cannot read purchase rates or profit.
  - Without Firebase settings the app stays in demo mode, as before. See `docs/SETUP_AND_DEPLOY.md`.
- **P5 saving in the cloud and offline:** built.
  - Signed in, customers, trips and the ledger are saved in Firestore through the same screens and money rules.
  - Every entry is saved on the phone first and sent when there is internet. A badge shows "Saved to cloud", "Syncing", "Saved on phone" or "Needs attention". Entries still on the phone say so under their line.
  - If the cloud refuses an entry (say the trip was closed on another phone), it appears under "Needs attention" with the reason, and balances leave it out.
  - Each phone reads last month and this month, and balances start from the last month-end close. This keeps daily reads inside the free plan.
- **P6 bills:** built.
  - A bill starts as a statement. "Issue bill" gives it the next number for the financial year (ICC/2026-27/0001) and freezes its lines and totals. Issued bills are listed on the customer.
  - Share as a PDF (English or Kannada) through the phone's share sheet, send the text on WhatsApp, or print. Offline, the bill can still be shared as a statement; numbers need the internet.
- **Next:** Gate B with the owner, then P7 (Google Drive backup and restore).

## Trying the prototype (Gate B)

Run `npm run dev` and open it on a phone, or use the Browser pane. Settings come prefilled: rate ₹140/kg and diesel ₹91/L.

1. **Check his own numbers.**
   - Customers → Customer1 shows his October ledger: ₹10,625 → ₹18,701 → ₹36,778 → paid ₹26,000 → **₹10,778**, then the month-end balance.
   - Trip → Recent trips → 02-11-2026 shows the source trip: **₹67,800** profit with both options.
2. **Start a trip.** Today → Start trip: choose a vehicle, keep Ramesh as driver, enter litres.
3. **Load.** Add loading, for example 1,000 kg at ₹120.
4. **Sell.** Record sale: pick a customer, enter the kg (the rate is the trip rate), and optionally the amount paid now with Cash, UPI or Bank.
5. **Expenses.** Add labour per person (Driver, Labour 1–5 with names) or as one total, plus food and other costs.
6. **Finish.** Sell what is left at the shop, or record wastage, then Close trip. Both profit options appear; any difference between them is shown.
7. **Payment and bill.** On a customer, tap Payment, then Bill. Choose a period and English or ಕನ್ನಡ. Tap **Issue bill** to give it the next number (ICC/2026-27/0001); the issued bill then appears under Bills on the customer. **Share PDF** opens the phone's share sheet (WhatsApp is one of the choices); **WhatsApp text** opens the chat with the bill as text (add the customer's mobile number first); **Print** prints it.
8. **Month end.** Ledger → Close (last month).
9. **Roles.** More → Acting as → Driver. The driver sees only his trips, sells at the trip rate, and sees no purchase rates or profit.
10. **Start again.** More → Reset demo data.
