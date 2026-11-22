# Indian Chicken Center

Trip, ledger and billing app for a chicken distribution business in Ujire / Belthangady. It is planned as an offline-first PWA on Vite, React and Firebase.

## Where things are

- `docs/IndianChickenCenter.txt` — the customer's requirement (source of truth, never edited)
- `docs/Indian_Chicken_Center_Plan.md` — the app plan (Part 2 wins over Part 1)
- `docs/FINANCIAL_CALCULATIONS.md` — the money rules as built, and where they differ from the plan
- `src/domain/` — the money engine (pure TypeScript) and its tests

## Commands

```bash
npm install
npm test
npm run typecheck
npm run dev
```

## Status

- **P2 money engine:** built. All 49 financial tests from the plan pass, plus 17 engine tests and 10 tests for the owner's answers.
- **Gate A:** answered on 22 Nov 2026 (see `docs/REQUIREMENTS_TRACEABILITY.md`), with a few follow-up questions.
- **P1 shell and design system:** built. It has:
  - five sections: Today, Trip, Customers, Ledger, More
  - light and dark modes, English and Kannada
  - an installable app that opens offline
  - More → Design system shows every component
- **`npm run dev`:** runs the app. More → Engine check shows the source examples run through the money engine.
- **Next:** the P3 clickable prototype on demo data, for the owner to try (Gate B).
