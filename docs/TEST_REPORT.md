# Test report (Gate C)

**Status: Gate C not passed.** The automated tests pass. None of the real-device checks (DV-01 to DV-08) has been done yet.

The plan's rule: nothing is marked working on a device until it has been seen working on that device. The app is "production-ready" only when every cell of the device table below is filled in.

- Branch: `p9-deploy`
- Last updated: 23 Nov 2026
- Live app: https://indian-chicken-ujire.web.app

## 1. Automated tests

| Suite | Command | Result (23 Nov 2026) |
| --- | --- | --- |
| Money engine, store, bills, backup, map pin, deploy settings | `npm test` | 130 passed |
| Security rules, offline sync, restore (Firestore emulator) | `npm run test:emulator` | 46 passed |
| Types | `npm run typecheck` | Clean |
| Production build | `npm run build` | Builds; 31 files kept for offline use |

The 130 unit tests:

| Tests | Count |
| --- | --- |
| F-* (money engine) | 49 |
| ENG-* (engine extras) | 18 |
| G-* (Gate A decisions) | 10 |
| CU-*, DT-* (customers and dates) | 4 |
| ST-* (store) | 6 |
| DOC-* (stored documents) | 7 |
| RC-* (rule constants) | 2 |
| LW-* (read window) | 6 |
| DIFF-* (save batches) | 7 |
| BD-* (bill documents) | 5 |
| PDF-01 | 1 |
| B-01–B-06 (backup) | 6 |
| LOC-01–05 (map pin) | 5 |
| DEP-01–04 (deploy settings) | 4 |

The 46 emulator tests:

| Tests | Count |
| --- | --- |
| S-01–S-10 (security; S-04 has two tests) | 11 |
| R-01–R-17 and R-09b (rules) | 18 |
| BR-01–BR-04 (bill rules) | 4 |
| SY-01–SY-10 (sync) | 10 |
| B-04, B-06, B-06b (restore) | 3 |

The test map is in `FINANCIAL_CALCULATIONS.md`.

## 2. Engine checks on the developer's Mac

These are not device results. They show the code paths work in one browser engine, so the device checks start from a working build. Every check ran against the production build with the local Firebase emulators (`npm run build:emulators`, then `npm run preview:emulators`).

**Chrome's engine.** Chrome 156, inside the Claude desktop app's browser on macOS 26.6. This is the same engine as Android Chrome, Chrome on Windows and Mac, and Edge. Each check below was seen on 23 Nov 2026.

| Check | Result |
| --- | --- |
| Google sign-in, through the emulator's sign-in screen | Seen working. The pop-up was blocked, and the app fell back to the redirect on its own. |
| "A new version is ready" → Update | Seen working: the new build loaded. |
| DV-06 path. Firebase stopped; payment of ₹459 recorded | Balance updated at once (₹35,459 → ₹35,000). The badge showed "Syncing 1" and the row "Saved on phone". |
| DV-06 path. Tab closed and opened again, still offline | Still signed in. The payment was still there and still waiting. |
| DV-06 path. Firebase started again | The badge turned "Saved to cloud" without any tap. |
| Settings → This phone | Shows "May be cleared", "Keep them" and the space used (3.4 MB). Chrome keeps data only for installed or well-used sites. |
| DV-07 path. Location answers stood in by a script | "Blocked" shows the type-the-pin message. A position sets the pin, rounded to 6 places, "Within about 18 m". |
| DV-07 path. Typed pins | A short `maps.app.goo.gl` link is refused with the reason. A full place link gives the place's own pin, not the map's centre. The pin was saved and still there after a reload. |
| Phone width (375 px) | No sideways scrolling on Business profile or Settings. Kannada labels fit after two fixes in this branch. |
| Sharing files | This engine cannot share files, so "Share PDF" downloads instead, as designed (checked in P6). |

**iPhone and iPad simulators (Safari's engine).** Xcode's iOS 17.5 simulators on the same Mac, using real Mobile Safari. These are still not device results: there is no WhatsApp, no real GPS, no flight mode and no real Google account. Each check below was seen on 23 Nov 2026.

iPhone SE (3rd generation), the smallest current iPhone screen (375 × 667):

| Check | Result |
| --- | --- |
| Google sign-in in Safari (emulator screen) | Seen working. The pop-up opened as a new tab and came back signed in. The first opening took about 10 s ("Opening…"); later openings were quick. |
| Install card | Shows the iPhone steps (Share → Add to Home Screen). |
| "A new version is ready" → Update | Seen working. |
| DV-07 path. Location | iOS first asks whether Safari may use location, then whether this site may. **Don't Allow** shows the type-the-pin message, and Safari keeps that answer until the page is reloaded. **Allow** with the simulator's position set to Ujire gives 12.996300, 75.308600, "Within about 5 m". Save stored both numbers in the cloud, so the new rule accepts a real save. |
| Settings → This phone in Safari | "May be cleared", 2.2 MB. Safari declines **Keep them** without asking; the screen now says so. |
| DV-06 path. Offline restart | Firebase stopped, ₹1,000 payment recorded: it shows at once. Safari quit completely and opened again: still signed in, balance ₹34,000, "Syncing 1". Firebase started again: "Saved to cloud" without a tap. |
| DV-04 path. Share PDF | The iOS share sheet opens with "Bill-ICC-2026-27-0001-…" (PDF, 56 KB). WhatsApp is not installed on the simulator. |
| DV-08 path. Print | iOS print options: A4, page 1 of 1, showing only the title and the bill (no buttons, tabs or badge). |
| DV-03 path. Add to Home Screen | Icon and the name "ICC" come from the manifest. It opens full screen without Safari's bars, and the install card no longer shows. |
| Installed app: sign-in | It has its own storage, so it asks to sign in again. The emulator's sign-in page (another port) opened in an overlay that did not close by itself; after **Done** the app was signed in. On the real address the sign-in page is on the app's own domain (D-02). This is the first thing to check on a real iPhone (DV-01, installed). |
| Installed app: Settings → This phone | **Kept.** iOS keeps a Home Screen app's data. |
| Screen changes | A new screen now opens at its top. Before the fix, Business profile opened half-way down because it kept the More page's scroll position. |

iPad (10th generation), 820 × 1180:

| Check | Result |
| --- | --- |
| Google sign-in in Safari | Seen working (new tab, came back signed in). |
| Layout | Side bar layout. The install card shows the iPad steps. |
| Add to Home Screen | Works. The installed app opens full screen and asks for its own sign-in, as on iPhone. |

Fixed from the simulator checks:
- A new screen opens at the top.
- "Keep them" says when the browser declines, instead of doing nothing.
- The storage row is titled "Saved entries", so it fits on a small iPhone.

Seen but not changed (looks only):
- On a 375 px screen the bill buttons "Share PDF" and "WhatsApp text" wrap onto two lines.
- The iPhone system font draws a wider gap after "₹" than Chrome does.

## 3. Production smoke test

`npm run smoke -- https://indian-chicken-ujire.web.app --project indian-chicken-ujire` ran on 23 Nov 2026, right after the first deploy. **All 11 checks passed.**

| ID | Check |
| --- | --- |
| SM-01 | The app page loads (the real sign-in screen, not demo data) |
| SM-02 | A deep link opens the app |
| SM-03 | The service worker, page and manifest are re-checked on every visit |
| SM-03b | The service worker leaves Firebase's `/__/` pages (Google sign-in) to Firebase |
| SM-04 | Fingerprinted files are cached for a year |
| SM-05 | The install manifest is served as a manifest |
| SM-06 | Security headers are set |
| SM-07 | The built app signs in through `indian-chicken-ujire.web.app` itself |
| SM-08 | Firebase's sign-in helper is served on that domain |
| SM-09 | The hosting belongs to `indian-chicken-ujire` |
| SM-10 | The live database refuses a reader who is not signed in (S-01 in production) |

Google sign-in itself is not checked yet. It needs the console steps in SETUP_AND_DEPLOY.md §9 (turn on Google sign-in, add the redirect address) and the first owner.

## 4. Real devices (DV-01 to DV-08)

Fill each cell with ✓ (seen working), ✗ (failed: add a line to the log), or — (not applicable). Every ✓ needs a log line with the device, OS version, date and tester.

| ID | Check | iPhone Safari | iPhone installed | Android Chrome | iPad | Mac | Windows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DV-01 | Google sign-in | □ | □ | □ | □ | □ | □ |
| DV-02 | Still signed in after the app is closed and reopened the next day | □ | □ | □ | □ | □ | □ |
| DV-03 | Install to home screen or dock | — | □ | □ | □ | □ | □ |
| DV-04 | Share bill PDF to WhatsApp | □ | □ | □ | □ | □ | □ |
| DV-05 | WhatsApp text opens the right chat | □ | □ | □ | □ | □ | □ |
| DV-06 | Offline sale survives an app restart; storage kept | □ | □ | □ | □ | □ | □ |
| DV-07 | Location permission prompt, and the typed pin when it is blocked | □ | □ | □ | □ | □ | □ |
| DV-08 | Print bill | □ | □ | □ | □ | □ | □ |

### Device log

| Date | Tester | Device | OS version | Browser / installed | Check | Result | Notes / screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

## 5. How to run the device checks

### Before you start
- **The app on its real address:** https://indian-chicken-ujire.web.app (deployed in P9, with the sign-in domain set to that same address, plan trap 2, D-02). First finish the console steps in SETUP_AND_DEPLOY.md §9, or nobody can sign in.
- **Accounts.** The owner's Google account is set up as owner, and one driver account has been invited (More → People).
- **Test customer.** A customer whose phone number has WhatsApp. Use your own second number, not a real customer's.
- **Trip.** A trip open today with some stock loaded, so a sale can be recorded.
- **Printer.** A printer, or the phone's "Save as PDF".
- **For each device**, note the model, the OS version (Settings → About) and the browser version.

### DV-01 Google sign-in
1. Open the app's address.
2. Tap **Continue with Google** and choose the account.

**Pass:** the Today screen opens, with the user's role shown under More.

On an installed iPhone app the sign-in uses a full-page redirect instead of a pop-up. That is expected.

### DV-02 Still signed in the next day
1. After DV-01, close the app fully: swipe it away, or quit the browser.
2. Open it again the next day.

**Pass:** it opens on Today with no sign-in screen, and the sync badge says "Saved to cloud".

### DV-03 Install
- **Android, Mac, Windows (Chrome or Edge):** More → Help & install → **Install app**, or use the browser's install icon.
- **iPhone and iPad:** in Safari, Share → **Add to Home Screen**.

**Pass:**
- The icon appears on the home screen, dock or Start menu.
- The app opens without the browser's address bar.
- Help & install says "The app is installed on this device".

### DV-04 Share the bill PDF to WhatsApp
1. Customers → the test customer → **Bill**.
2. Tap **Share PDF**.
3. In the share sheet, choose WhatsApp, then the test chat.

**Pass:** WhatsApp receives a PDF that opens, and the ₹ and Kannada text are correct (check both languages).

Where the browser cannot share files (most computers), the PDF downloads instead. Write "download" in the cell.

### DV-05 WhatsApp text
Tap **WhatsApp text** on the same bill.

**Pass:**
- WhatsApp, or WhatsApp Web on a computer, opens the chat for the customer's number.
- The message holds the bill text, with "₹" and the amounts intact.

### DV-06 Offline sale survives a restart
1. More → Settings → This phone: note whether entries are **Kept**. Tap **Keep them** if it is offered.
2. Turn on flight mode.
3. Record a sale on today's trip. The badge shows "Syncing" and the sale shows "Saved on phone".
4. Close the app fully, then open it again, still in flight mode.

**Pass:**
- It opens, still signed in.
- The sale and the new balance are still there, marked "Saved on phone".
- After flight mode is turned off, the badge turns "Saved to cloud", and the sale appears on a second phone.
- In the cell, write whether storage showed Kept. On iPhone it is expected only for the installed app.

### DV-07 Location
1. More → Business profile (owner) → **Use this phone's location**.
2. Allow the prompt.

**Pass:** a pin with "Within about N m". **Open in Maps** shows the shop.

Then block location for the app in the phone's settings and tap the button again.

**Pass:**
- The message tells you to type the pin.
- Typing `12.9963, 75.3086`, or pasting a full Google Maps link, sets the pin.
- Save keeps the pin.

### DV-08 Print
On a bill, tap **Print**.

**Pass:** the print preview shows only the bill (no buttons or tabs), on one A4 page per page of the bill, readable in both languages.

## 6. What to expect on each device

| Device | Expected differences |
| --- | --- |
| iPhone Safari (not installed) | No install button (Share → Add to Home Screen). Safari may clear a site's saved data after about 7 days without use, and it declines "Keep them" (seen on the simulator). Use the installed app for real work. |
| iPhone installed | Separate from Safari: sign in again after adding it, and entries still waiting in Safari stay in Safari. Its data is kept (seen on the simulator). Sign-in uses a full-page redirect. If the Drive pop-up does not appear, back up from Safari (KNOWN_LIMITATIONS.md). |
| Android Chrome | Install button in Help & install. Chrome decides on its own whether to keep the data, usually once the app is installed. |
| iPad | Uses the side bar layout (768 px and wider). Same install steps as iPhone. |
| Mac, Windows | "Share PDF" may download the PDF instead of sharing it. "WhatsApp text" opens WhatsApp Web or the desktop app. |
