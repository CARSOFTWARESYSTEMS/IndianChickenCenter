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
  `device.ts` (P8): asks the browser to keep stored data (DV-06, shown in Settings → This phone) and reads the phone's location (DV-07).
- `src/store/` — app state and commands. `state.ts` (types + demo seed built through the engine), `commands.ts`
  (every change goes through engine functions; screens call `dispatch(command)`), `selectors.ts` (read views),
  `store.ts` (one store: demo state in localStorage, or a backend attached by the cloud store).
  `cloud.ts` (P5, lazy-loaded): Firestore listeners → AppState over a window (last month + this month + snapshots,
  `ledgerWindow` on AppState); dispatch runs the command, `src/data/diff.ts` turns before/after into batched DocWrites,
  an overlay keeps the screen steady until listeners show them. `sync.ts`: per-save status (pending → saved, or
  attention with the reason from re-running the command), pending paths for "Saved on phone" markers.
- `src/pages/` — today, trips (+ tripSheets), customers, bill, ledger, more (profile, settings, help), people (owner),
  auth (sign-in, not on the team, owner set-up), design gallery, engine check.
  Sheets are rendered only while open, so each opening gets fresh ids (plan §5).
- `src/domain/location.ts` — the shop's map pin: typed numbers or a Google Maps link, 6 decimal places (coordinates, not money).
  Screen: `src/pages/mapPin.tsx` on the Business profile.
- `docs/TEST_REPORT.md` (P8, Gate C) — automated results, engine checks on the Mac, the DV-* real-device table, device log and steps.
- `src/domain/billDocument.ts` — IssuedBill (number per financial year, content frozen), billDocument (the rows the
  screen and PDF both show), paginate. `src/pdf/billPdf.ts` (lazy) draws pages on a canvas (browser fonts handle
  Kannada and ₹) and puts them in an A4 PDF with pdf-lib; shareOrDownload uses Web Share with files, else downloads.
  Bills are issued through `issueBill()` in store.ts: demo counter, or a Firestore transaction on `billCounters/{FY}`.
- `src/backup/` (P7) — `backup.ts` (pure: file format, SHA-256 of canonical data, counts, full-recompute balances,
  checkBackup, verifyCopy, planRestore), `drive.ts` (Drive REST, drive.file scope, fetch injected), `connect.ts`
  (reauthenticateWithPopup for the Drive token, memory only), `collect.ts` (owner's full read), `flow.ts` (back up →
  read back → check → mark verified), `restore.ts` (Firestore REST, create-only writes). Page: `src/pages/backup.tsx`.
  Tools: `scripts/restore.ts` (`npm run restore`), `scripts/emulator-backup.ts` (`npm run emulator:backup`), run by jiti.
- `src/data/docs.ts` — how engine records are stored in Firestore (paths, document shapes, `DocWrite` batches). Pure TS.
  `src/data/diff.ts` — the writes a command made (new trips first and alone; at most 4 records per batch for the rules' look-up limit).
  Purchase rates live in `trips/{id}/purchases`, money totals in `trips/{id}/totals/close` (drivers cannot read them).
  `src/data/rulesConstants.ts` generates the role table and value lists in `firestore.rules` from `src/domain`.
- `src/firebase/` — `deployCheck.ts` (P9: production settings checked before every deploy), `config.ts` (env), `client.ts` (lazy-loaded Auth + Firestore with persistentLocalCache, `commitWrites`),
  `session.tsx` (session states: demo, signedOut, notAuthorised, needsActivation, waitingForOwner, ready).
  `src/app/AuthGate.tsx` shows the app only when ready (or in demo mode) and starts the cloud store once signed in.
  `src/app/SyncBadge.tsx` — "Saved to cloud / Syncing / Saved on phone / Needs attention" with its sheet.
- `firestore.rules` — server copy of the engine rules (append-only, integer money checks, roles). Tests: `tests/rules/`.
  `firestore.indexes.json` — indexes the cloud store's queries need. Sync tests: `tests/sync/` (real SDK, emulator).
  No Firebase settings in env → demo mode, exactly as P3. `.env.emulators` → local emulators (open http://127.0.0.1:5174).
- PWA: vite-plugin-pwa (`registerType: 'prompt'`), icons generated from `public/icon.svg` by `npx pwa-assets-generator`.

## Commands
- `npm test` — run all unit tests once (no emulator)
- `npm run test:emulator` — security-rule and sync tests in the Firestore emulator (Java 21+; `scripts/firebase.sh`
  finds it on a Mac); `npm run test:rules` runs the rule tests only. Stop running emulators first (port 8080).
- `npm run rules:generate` — rewrite the generated block in `firestore.rules` after changing roles or value lists
- `npm run typecheck`
- `npm run dev` — Vite dev server, demo mode
- `npm run build:emulators` + `npm run preview:emulators -- --port 4174` — production build (service worker) against the emulators
  at http://127.0.0.1:4174 ("preview-emulators" in .claude/launch.json); the iOS simulators reach it at the same address
- `npm run emulators` + `npm run dev:emulators -- --port 5174` — the app against local Auth/Firestore emulators at
  http://127.0.0.1:5174 (data kept in `.emulator-data/`); `node scripts/emulator-add-user.mjs <email> owner "<name>"`
  makes an emulator account the owner
- `npm run deploy:rules -- --project <id>` — deploy rules (needs `npx firebase login`; ask before deploying)
- `npm run deploy -- --project indian-chicken-ujire --account <email>` — full production deploy (scripts/deploy.sh: settings check,
  all tests, build, rules + indexes + hosting, smoke test); needs `.env.production.local`. Ask before deploying.
- `npm run smoke -- https://indian-chicken-ujire.web.app --project indian-chicken-ujire` (read-only); `npm run smoke:local` (hosting emulator)
- `npm run restore -- <backup.json> (--emulator [--database restore-check] | --project <id>) [--apply]` — restore tool;
  dry run unless --apply (never run --apply against a real project without the owner's say-so)

## Status
P2 money engine built: 49 F-* + 18 ENG-* + 10 G-* tests pass. Gate A answered on 22 Nov 2026 except U-10 and U-12;
the follow-up questions are in docs/REQUIREMENTS_TRACEABILITY.md.
P1 shell + design system built (branch p1-shell). P3 clickable prototype built (branch p3-prototype): every Gate B flow
works on demo data (start trip, loading, orders, sale with paid now, expenses, shop sale, wastage, close and both profits,
payments, reversals, Kannada/English bill to WhatsApp or print, month-end close, business profile, role switch).
Tests: 49 F-* + 17 ENG-* + 10 G-* + 4 customer/date + 5 store (ST-*) = 85.
Run: `npm run dev` ("vite" in .claude/launch.json); production check: `npm run build` then "preview-build".
P4 auth + rules built (branch p4-auth-rules): Google sign-in, users/{uid} roles, invites (More → People, D-22),
owner set-up wizard, sign-out clears the phone's Firestore cache. Business settings are saved in Firestore; trips,
customers and the ledger are still demo data until P5. Tests: 49 F-* + 18 ENG-* + 10 G-* + 4 CU/DT + 5 ST-* + 7 DOC-*
+ 2 RC-* = 95 unit tests, plus 27 emulator rule tests (S-01–S-10, R-01–R-15). Setup: docs/SETUP_AND_DEPLOY.md.
P5 persistence + offline built (branch p5-persistence): signed in, customers, trips and the ledger live in Firestore
behind the same commands; entries save on the phone first; sync badge and Needs attention; balances from month-end
snapshots over a read window (D-27). Tests: 108 unit (adds LW-* and DIFF-*) and 37 emulator (28 rule tests up to R-16,
9 sync tests SY-01–SY-09); the test map is in docs/FINANCIAL_CALCULATIONS.md.
P6 bills built (branch p6-bills): statement → "Issue bill" (ICC/2026-27/0001, online transaction, frozen content),
issued bills on the customer, Share PDF / WhatsApp text / Print, English and Kannada. Tests: 115 unit (adds BD-*,
ST-06, PDF-01) and 42 emulator (adds BR-01–04 and SY-10).
P7 backup + restore built (branch p7-backup): owner's "Back up now" to Drive (drive.file), read back and checked
before "Verified"; check any backup file; compare with the cloud; restore tool adds only missing records (D-29).
Tests: 121 unit (adds B-01–B-06 preview) and 45 emulator (adds B-04, B-06, B-06b).
P8 device checks prepared (branch p8-devices): persistent storage request + Settings → This phone (DV-06), shop map pin from
location or typed/pasted (DV-07), docs/TEST_REPORT.md with the DV matrix and steps. Checked in Chrome's engine and on the
iOS 17.5 simulators (iPhone SE, iPad) in Safari; no real device checked yet. Tests: 126 unit (adds LOC-01–05) and 46 emulator (adds R-17).
P9 deployed (branch p9-deploy): live at https://indian-chicken-ujire.web.app (project indian-chicken-ujire, Firestore asia-south1,
D-31). firebase.json headers (assets immutable, sw/index/manifest no-cache, security headers), service worker leaves /__/ to
Firebase (sign-in), deploy settings check (DEP-01–04), smoke test SM-01–10 all pass. Tests: 130 unit and 46 emulator.
Still to do in the console: enable Google sign-in, add https://indian-chicken-ujire.web.app/__/auth/handler as a redirect URI,
OAuth consent screen for Drive, first owner. Then Gate B on the live app and the DV-* checks for Gate C.
