# Known limitations

These are limits of the platform (an installable web app on Firebase's free plan). The app will say so on screen rather than hide them.

| Limit | Effect | What the app does |
| --- | --- | --- |
| No background location in a web app | Live vehicle position (U-02) works only while the driver has the app open; iPhones stop when the screen locks | Position is sent about once a minute while the app is open. Background tracking needs an Android app wrapper or the vehicle's own tracker (open question). |
| Free-plan limit of 20,000 writes a day | Frequent position updates eat into it | One update a minute × 6 vehicles × 12 h ≈ 4,320 writes a day |
| pdf-lib cannot lay out Kannada | Kannada text in a pdf-lib PDF comes out broken | Kannada bills are drawn from the rendered page into an image inside the PDF; the text is not selectable. WhatsApp text and screens show Kannada correctly (checked in the browser). |
| Security rules cannot hide single fields | Anything a role may not see must sit where that role cannot read it | Built in P4: a loading's purchase rate and amount are in `trips/{id}/purchases`, and a closed trip's money totals in `trips/{id}/totals`. Only owner and manager can read them. |
| Security rules cannot add up documents | Rules cannot check stock left on a vehicle, a customer's balance, or whether a trip mixes per-person labour with a labour total (D-20) | The app checks these, and trip close re-checks stock. Rules check every single document: amounts, roles, trip status, closed months. |
| A phone's offline copy is not re-checked by the rules | Data already on a phone stays readable there, even after the owner changes that person's role | Sign out empties the phone's copy. After changing someone's role, ask them to sign out and in again. |
| A driver may sell at the old rate offline | If the trip rate changes while a driver is offline, their sale at the old rate is refused when it syncs | It shows "Needs attention" (P5). The driver records it again at the new rate. |
| Two phones offline can sell the same kg | Oversold stock shows only once both sync | Trip close is blocked until stock is reconciled |
| A sale that syncs after its trip closed is rejected | The phone shows "Needs attention" | How the owner re-posts it is an open question |
| A WhatsApp link cannot attach a PDF | The link carries the bill text only | The PDF goes through the phone's share sheet |
| Kannada wording is a first draft | Some words may read oddly | To be checked by a Kannada reader before release |
| The local emulator sign-in needs 127.0.0.1 | On `localhost` the emulator's Google screen never returns (the browser keeps the two sites' storage apart) | Open the app at http://127.0.0.1:5174 when using the emulators (SETUP_AND_DEPLOY.md). Production is not affected: the auth domain is the app's own domain. |
