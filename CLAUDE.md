# Indian Chicken Center — working rules

## Sources of truth
- `docs/IndianChickenCenter.txt` — the customer's requirement (owner: Umarabba). Never edit it.
- `docs/Indian_Chicken_Center_Plan.md` — the app plan. Part 2 (Addendum v3) wins over Part 1 and over the v2 paste block.
- `docs/FINANCIAL_CALCULATIONS.md` — the money rules as built, including deviations from the plan that still need approval.

Plan labels: **C** confirmed · **D** proposed default · **U** owner decision (U-01…U-13) · **E** enhancement (off unless approved).
Never guess a U item: keep the feature disabled until the owner answers.

## Stack (decided in the plan)
Vite + React + TypeScript, Tailwind + vite-plugin-pwa (P1), Firebase Auth (Google) + Firestore `persistentLocalCache`,
Firebase Hosting (Spark), pdf-lib for bills. No Cloud Functions, no paid APIs, no Vercel.

## Money rules (do not break)
- Integers only: grams, paise, paise/kg, millilitres, paise/litre. Parse user input from strings (`src/domain/units.ts`), never floats.
- Ledger entries and trip events are append-only. Corrections are REVERSAL or ADJUSTMENT entries.
- Balances are always derived from entries. MONTH_END_SNAPSHOT is a checkpoint and is never summed.
- A SALE stores the exact amount (milli-paise) and the posted amount (paise) with its rounding policy id.
  The owner chose ROUND_HALF_UP_RUPEE (U-01, Gate A); it is the Settings default. The F-LED tests keep TRUNCATE to reproduce the source.
- Roles: owner / manager / driver, checked through `src/domain/permissions.ts`. Firestore rules must use the same table.
- Owner answers and open follow-ups: `docs/REQUIREMENTS_TRACEABILITY.md`. Platform limits: `docs/KNOWN_LIMITATIONS.md`.
- Fuel, purchases and orders keep exact paise (they are not bill lines).
- "One only" rules use fixed ids: `open_<customerId>`, `rev_<originalId>`, `snap_<customerId>_<YYYY-MM>`.
- Test expected values are literal numbers checked by hand. Never compute an expected value with engine code.

## Layout
- `src/domain/` — pure TypeScript money engine. No React, no Firebase imports.
- `src/domain/__tests__/` — financial tests named by plan id (F-FUEL-01 …), engine extras (ENG-*), Gate A decisions (G-*).
- `src/styles/index.css` — design tokens (`--ui-*`, light/dark) mapped into Tailwind v4 via `@theme inline`
  (bg-card, text-ink, text-ink-2, text-due, text-received, bg-accent …) plus the type scale (text-large/title/body/sub/caption/amount).
- `src/ui/` — design system components: Button/ButtonLink, PageHeader, Section/Row, Card, Amount, Pill, StatTile,
  EmptyState, Field, Segmented, SyncStatus, Stepper, Sheet, Icon. Use these, not ad-hoc styles.
- `src/i18n/labels.ts` — every screen label, English + Kannada; the type makes a missing Kannada key a build error.
  Read labels with `useT()`; never hard-code screen text.
- `src/app/` — shell (bottom tabs < 768 px, sidebar ≥ 768 px), preferences (language, theme), install + update prompts, shortcuts.
- `src/store/` — app state and commands. `state.ts` (types + demo seed built through the engine), `commands.ts`
  (every change goes through engine functions; screens call `dispatch(command)`), `selectors.ts` (read views),
  `store.ts` (demo store saved in localStorage; P5 replaces it with Firestore behind the same commands).
- `src/pages/` — today, trips (+ tripSheets), customers, bill, ledger, more (profile, settings, help), design gallery, engine check.
  Sheets are rendered only while open, so each opening gets fresh ids (plan §5).
- PWA: vite-plugin-pwa (`registerType: 'prompt'`), icons generated from `public/icon.svg` by `npx pwa-assets-generator`.

## Commands
- `npm test` — run all tests once
- `npm run typecheck`
- `npm run dev` — Vite dev server

## Status
P2 money engine built: 49 F-* + 17 ENG-* + 10 G-* tests pass. Gate A answered on 22 Nov 2026 except U-10 and U-12;
the follow-up questions are in docs/REQUIREMENTS_TRACEABILITY.md.
P1 shell + design system built (branch p1-shell). P3 clickable prototype built (branch p3-prototype): every Gate B flow
works on demo data (start trip, loading, orders, sale with paid now, expenses, shop sale, wastage, close and both profits,
payments, reversals, Kannada/English bill to WhatsApp or print, month-end close, business profile, role switch).
Tests: 49 F-* + 17 ENG-* + 10 G-* + 4 customer/date + 5 store (ST-*) = 85.
Run: `npm run dev` ("vite" in .claude/launch.json); production check: `npm run build` then "preview-build".
Next: Gate B with the owner (README "Trying the prototype"), then P4 auth + Firestore rules.
