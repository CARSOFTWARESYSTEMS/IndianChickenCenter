# Known limitations

These are limits of the platform (an installable web app on Firebase's free plan). The app will say so on screen rather than hide them.

| Limit | Effect | What the app does |
| --- | --- | --- |
| No background location in a web app | Live vehicle position (U-02) works only while the driver has the app open; iPhones stop when the screen locks | Position is sent about once a minute while the app is open. Background tracking needs an Android app wrapper or the vehicle's own tracker (open question). |
| Free-plan limit of 20,000 writes a day | Frequent position updates eat into it | One update a minute × 6 vehicles × 12 h ≈ 4,320 writes a day |
| pdf-lib cannot lay out Kannada | Kannada text in a pdf-lib PDF comes out broken | Kannada bills are drawn from the rendered page into an image inside the PDF; the text is not selectable. WhatsApp text and screens show Kannada correctly (checked in the browser). |
| Security rules cannot hide single fields | Anything a role may not see must sit where that role cannot read it | Purchase rates and profit move to owner/manager-only collections in P4 |
| Two phones offline can sell the same kg | Oversold stock shows only once both sync | Trip close is blocked until stock is reconciled |
| A sale that syncs after its trip closed is rejected | The phone shows "Needs attention" | How the owner re-posts it is an open question |
| A WhatsApp link cannot attach a PDF | The link carries the bill text only | The PDF goes through the phone's share sheet |
| Kannada wording is a first draft | Some words may read oddly | To be checked by a Kannada reader before release |
