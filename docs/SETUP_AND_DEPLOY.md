# Setup and deploy

How to connect the app to a Firebase project, add the first owner, and try sign-in on this computer with the Firebase emulators. Without Firebase settings the app runs on demo data only, as in the P3 prototype.

Status (P7): signed in, everything is saved in Firestore: sign-in, roles, People, the owner's set-up, customers, trips, the ledger and issued bills. Entries are saved on the phone first and sent when there is internet; bill numbers need the internet. The owner backs up to Google Drive from the app; restoring is done with a tool on a computer. Hosting deploy is P9.

## 1. Create the Firebase project (once)

1. In the [Firebase console](https://console.firebase.google.com), add a project. The free Spark plan is enough; Analytics is not needed.
2. **Authentication** → Get started → Sign-in method → **Google** → Enable. Choose the support email.
3. **Firestore Database** → Create database → production mode. Location: a region near Ujire, e.g. `asia-south1` (Mumbai). The location cannot be changed later.
4. **Project settings** → Your apps → add a **Web** app. Copy its values into `.env.production.local` for the hosted app (§9), or `.env.local` to try it from this computer (start from `.env.example`):

   | `.env.local` | Firebase config value |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | the domain that serves the app, e.g. `your-project.web.app` (see the note below) |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |

   **Auth domain.** Google sign-in on iPhones and installed apps only works when the auth domain is the domain the app is served from (plan Part 1, trap 2). With Firebase Hosting that is `your-project.web.app` or your own domain added to Hosting.
5. **Authentication** → Settings → Authorized domains: keep `localhost` for development, and add your own domain if you use one.
6. **For backups to Google Drive (P7)**, in the [Google Cloud console](https://console.cloud.google.com) for the same project:
   - APIs & Services → Library → **Google Drive API** → Enable.
   - APIs & Services → OAuth consent screen: app name and support email. The only Drive permission the app asks for is `drive.file` (files the app created), which needs no Google review. While the consent screen is in "Testing", add the owner's Google account as a test user, or publish it.

## 2. Deploy the security rules and indexes

The rules are in `firestore.rules` and checked by the emulator tests in `tests/rules` (`npm run test:rules`). The indexes in `firestore.indexes.json` are needed by the app's queries: a driver's trips, and the cross-trip reads of events, purchases and totals. Deploy both together:

```bash
npx firebase login
```

```bash
npm run deploy:rules -- --project your-project-id
```

`.firebaserc` points at the local demo project `demo-icc`, so a real deploy always names its project.

## 3. Add the first owner (once)

Nobody can make themselves an owner from the app. The first owner is added by hand:

1. Open the app and sign in with the owner's Google account. The screen says "This account is not on the team yet" and shows a **user ID**. Tap Copy.
2. In the console: Firestore Database → Start collection `users` → Document ID = that user ID, with these string fields:

   | Field | Value |
   | --- | --- |
   | `name` | the owner's name |
   | `email` | the Google email, in lower case |
   | `role` | `owner` |
   | `addedBy` | `console` |
   | `addedOn` | today, `YYYY-MM-DD` |

3. Back in the app, tap **Check again**. The owner sees **Set up your business** (business name, contact details, bill rounding and language). This is saved once and can be changed later under More → Business profile.

## 4. Add managers and drivers

The owner opens **More → People** and adds each person by name, Google email and role (Manager or Driver). When that person signs in with that Google account, the app gives them the role and removes the invite. The owner can change a role or remove a person on the same page. A second owner can only be added in the console (step 3).

## 5. Try it locally with the emulators

The emulators run Firebase Auth and Firestore on this computer with a fake Google sign-in. No real project or account is used.

- Needs Java 21 or newer. `scripts/firebase.sh` picks a Java 21+ install on a Mac if the default `java` is older.
- In the Browser pane: start **emulators**, then **vite-emulators** (`.claude/launch.json`). In a terminal, start them one at a time:

  ```bash
  npm run emulators
  ```

  ```bash
  npm run dev:emulators -- --port 5174
  ```

- Open **http://127.0.0.1:5174**, not `localhost`. The emulator's sign-in page is served from `127.0.0.1`. On `localhost` the browser keeps the two sites' storage apart, and the sign-in never comes back.
- Sign in: "Add new account" with any email, e.g. `owner@example.com`. Then make that account the owner (this stands in for step 3):

  ```bash
  node scripts/emulator-add-user.mjs owner@example.com owner "Umarabba"
  ```

- Emulator data is kept in `.emulator-data/` (not committed): saved when the emulators stop, loaded when they start. Delete the folder to start empty. After a restart you may need to sign in again. The Emulator UI is at http://127.0.0.1:4000.
- To see "Saved on phone" and "Syncing", stop the emulators while the app is open, save something, then start them again.
- To try the production build (service worker, offline start) against the emulators: `npm run build:emulators`, then `npm run preview:emulators -- --port 4174` and open http://127.0.0.1:4174 ("preview-emulators" in `.claude/launch.json`). The iPhone and iPad simulators on a Mac reach it at the same address.

## 6. Checks

```bash
npm test
```

```bash
npm run test:emulator
```

```bash
npm run build
```

`npm run test:emulator` runs the rule tests and the offline sync tests (SY-*) in the Firestore emulator; `npm run test:rules` runs the rule tests only. `npm run rules:generate` rewrites the role table and value lists in `firestore.rules` from `src/domain`; test RC-01 fails if someone changes the engine and forgets.

## 7. Backups and restore (P7)

**Backing up (owner, in the app).** More → Backup to Google Drive → **Back up now**. The app reads every record, saves one JSON file to the owner's Drive, reads the copy back and checks it. Only then does it show **Verified** (and mark the file so on Drive). Do this after closing each month. The app cannot back up by itself: a Drive sign-in from a browser lasts about an hour. Each backup reads every record once, so it uses that many of the day's free reads.

- **Save a copy on this device** downloads the same file without Drive.
- **Check a backup file** re-checks any backup file: checksum, record counts, every customer's balance recomputed from all entries, and every month-end snapshot. **Compare with the cloud** shows which records are missing from the cloud now.

**Restoring (on a computer).** Records are only ever added back, never changed. The app cannot do this itself: the security rules accept records written now, by the person signed in, and a record from a backup is neither (decision D-29). The restore tool uses the project's admin access instead:

```bash
gcloud auth login
```

```bash
npm run restore -- "ICC backup 2026-11-23 0915.json" --project your-project-id
```

That shows the plan: records already there, records that differ (left as they are), and records missing. Then add the missing ones:

```bash
npm run restore -- "ICC backup 2026-11-23 0915.json" --project your-project-id --apply
```

The tool refuses a file that fails its checks. Instead of `gcloud`, an owner access token can be given in `ICC_ACCESS_TOKEN`.

**Practising with the emulators.** With the emulators running and some data in them:

```bash
npm run emulator:backup -- owner@example.com backup.json
```

```bash
npm run restore -- backup.json --emulator --database restore-check --apply
```

`restore-check` is an empty second database in the emulator, so this is the "dry-run restore into a blank emulator" of test B-04.

## 8. Device checks (P8)

The real-device checks (DV-01 to DV-08) and their results are in `docs/TEST_REPORT.md`. Google sign-in on phones needs the app on its real address with the matching auth domain, so run them after deploying (§9), or on a Firebase Hosting preview channel whose address is added to Authentication → Settings → Authorised domains.

## 9. Deploy the app (P9)

**The live project (23 Nov 2026):**
- **Project:** `indian-chicken-ujire`, display name "Indian Chicken Center", under the CAR Software Systems Google account.
- **Firestore:** Native mode, `asia-south1` (Mumbai).
- **App address:** https://indian-chicken-ujire.web.app

### Settings for the production build
Put them in `.env.production.local`, which is never committed (start from `.env.example`):
- The values come from Firebase console → Project settings → Your apps, or from `firebase apps:sdkconfig WEB <app id>`.
- `VITE_FIREBASE_AUTH_DOMAIN` must be the app's address, `indian-chicken-ujire.web.app`, not the `firebaseapp.com` default.
- `npm run dev` does not read this file, so development stays on demo data.

### Deploy
```bash
npm run deploy -- --project indian-chicken-ujire --account <Google account that owns the project>
```

`scripts/deploy.sh` stops at the first failure, and nothing is deployed until every check before it has passed:
1. checks the settings (`src/firebase/deployCheck.ts`): all present, emulators off, the right project, sign-in domain = app address
2. typecheck and unit tests
3. rule, sync and restore tests in the emulator
4. production build
5. deploys the rules, indexes and app together
6. runs the smoke test

**Smoke test** (`npm run smoke -- https://indian-chicken-ujire.web.app --project indian-chicken-ujire`, read-only):
- SM-01, SM-02: the page and deep links load.
- SM-03: the service worker, page and manifest are re-checked on every visit, so updates reach phones.
- SM-03b: the service worker leaves Firebase's `/__/` pages to Firebase. Otherwise Google sign-in would loop.
- SM-04: fingerprinted files are cached for a year.
- SM-05: the install manifest is served as a manifest.
- SM-06: security headers are set.
- SM-07: the built app signs in through its own domain.
- SM-08: Firebase's sign-in helper is served there.
- SM-09: the hosting belongs to the project.
- SM-10: the live database refuses a reader who is not signed in.

`npm run smoke:local` runs SM-01 to SM-06 against the Firebase Hosting emulator, with no real project.

### Once, after the first deploy (console steps the CLI cannot do)
1. **Turn on Google sign-in.** Firebase console → Authentication → Get started → Sign-in method → **Google** → Enable, with the support email. This creates the Google OAuth client.
2. **Allow sign-in through the app's own domain.** Google Cloud console → APIs & Services → Credentials → "Web client (auto created by Google Service)" → Authorised redirect URIs → add `https://indian-chicken-ujire.web.app/__/auth/handler`. Without it Google answers `redirect_uri_mismatch`, because the sign-in domain is not the `firebaseapp.com` default ([Firebase guidance](https://firebase.google.com/docs/auth/web/redirect-best-practices)).
3. **Backups:**
   - The Drive API is already on.
   - Set up the OAuth consent screen (step 1.6), and add the owner as a test user or publish it.
4. **Add the first owner** (step 3).
5. **Run the real-device checks** in `docs/TEST_REPORT.md` on https://indian-chicken-ujire.web.app.

### Updating the app later
Run the same `npm run deploy` command. Phones show "A new version is ready" and update when tapped.

To undo a bad release, use Firebase console → Hosting → release history → **Rollback**.

Rules roll back by deploying the previous commit's `firestore.rules`. Entries already saved are never changed by a deploy.
