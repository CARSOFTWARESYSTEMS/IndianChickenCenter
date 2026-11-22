# Setup and deploy

How to connect the app to a Firebase project, add the first owner, and try sign-in on this computer with the Firebase emulators. Without Firebase settings the app runs on demo data only, as in the P3 prototype.

Status (P5): signed in, everything is saved in Firestore: sign-in, roles, People, the owner's set-up, customers, trips and the ledger. Entries are saved on the phone first and sent when there is internet. Hosting deploy is P9.

## 1. Create the Firebase project (once)

1. In the [Firebase console](https://console.firebase.google.com), add a project. The free Spark plan is enough; Analytics is not needed.
2. **Authentication** → Get started → Sign-in method → **Google** → Enable. Choose the support email.
3. **Firestore Database** → Create database → production mode. Location: a region near Ujire, e.g. `asia-south1` (Mumbai). The location cannot be changed later.
4. **Project settings** → Your apps → add a **Web** app. Copy its values into `.env.local` (start from `.env.example`):

   | `.env.local` | Firebase config value |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | the domain that serves the app, e.g. `your-project.web.app` (see the note below) |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |

   **Auth domain.** Google sign-in on iPhones and installed apps only works when the auth domain is the domain the app is served from (plan Part 1, trap 2). With Firebase Hosting that is `your-project.web.app` or your own domain added to Hosting.
5. **Authentication** → Settings → Authorized domains: keep `localhost` for development, and add your own domain if you use one.

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

## 7. Deploy the app (P9)

Firebase Hosting serves `dist/` with a rewrite to `index.html` (`firebase.json`). The full production checklist (auth domain, smoke test) is part of P9.
