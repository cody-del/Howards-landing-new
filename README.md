# Howard’s Draperies — Motorized Shades

Standalone motorized-shades landing page for Boulder and the Front Range, served at https://go.howardsdraperies.com/ (Netlify site `howardsnewlanding`).

## Netlify

The checked-in `netlify.toml` publishes `dist` as static files and deploys one function, `netlify/functions/consultation.mjs`, at `/api/consultation`. The build command only runs the tests, so a failing test stops the deploy. No dependency installation or Next.js adapter is needed.

The function needs two environment variables on this Netlify site, available to Functions in every deploy context:

- `GHL_PRIVATE_TOKEN`: a GoHighLevel Private Integration token for Howard’s location that can write contacts. `GHL_API_KEY` is read if it is not set.
- `GHL_LOCATION_ID`: Howard’s GoHighLevel location ID.

Without them, every submission is refused and the visitor is asked to call. Netlify applies new values on the next deploy.

The site sends the main site’s `Referrer-Policy` and `Permissions-Policy` headers, plus `X-Content-Type-Options: nosniff`. There is no Content-Security-Policy: a policy would have to allow the service-area map’s OpenStreetMap tiles and ClickCease’s script, frame and worker.

## Local preview

Run `node server.mjs --mock` (Node 22+) and open http://localhost:4319. `--mock` answers the form the way GoHighLevel does, without credentials or sending anything. Without it, the server reads `GHL_PRIVATE_TOKEN` and `GHL_LOCATION_ID` from the environment, and a submitted form creates a real contact.

## Consultation form

The form posts to `/api/consultation`, which upserts the contact straight into Howard’s GoHighLevel location. It follows Shutter Factory’s landing pages (`cody-del/shutter-factory-landing-page`, `netlify/functions/lead.ts` and `TRACKING.md`).

Every lead carries one tag, `google_landing_page`, and the source `Motorized Shades Page`. The follow-up workflow is triggered inside GoHighLevel by that tag, so the tag *is* the enrolment; this code makes no workflow call. GHL matches tags literally. Renaming the tag silently detaches new leads from the workflow, so change the GHL trigger in the same sitting. On Shutter Factory the tag moved `Website Lead` → `Landing Page` → `google_landing_page`.

Spam protection, in `consultation.mjs` and `consultation-http.mjs`:

- **Hidden field:** `website` is hidden from people and skipped by the keyboard; a request that fills it in is refused. It is named like the main site’s trap field, because browsers autofill fields whose names mention “company”.
- **Fill time:** `form.js` sends the time since the page loaded, measured on the visitor’s own clock, and waits until 3 seconds have passed before sending. Anything faster is refused.
- **Same-site JSON only:** requests from another origin, non-JSON bodies, and bodies over 8 KiB are refused.
- **Validation:** all four fields are required; the phone needs 10 digits and the email must pass the main site’s check.
- **Rate limit:** 5 leads per visitor every 15 minutes, held in memory.

There is no captcha: a visible challenge on a paid-traffic form costs conversions. Refused requests get a message with Howard’s phone number and never reach GHL. The visitor sees the thank-you message only when GHL returns a contact id, and the function passes that id back so ad conversions can be reported for real leads only. Anything else asks the visitor to call (303) 449-4337.

The form has no SMS consent checkboxes, so these leads are not opted in to texts. The page has no Google Ads or Meta tag yet, so form and call conversions are not tracked.

## ClickCease

ClickCease (CHEQ) click-fraud protection runs on the page with the tag issued for this domain in the ClickCease dashboard: host `ob.sornavellon.com`, hash `f55b4de59e892a78c4939af00208d7e7`. As ClickCease instructs, the script is the first thing in `<head>` after the charset, and its no-JavaScript fallback opens `<body>`.

- The `ct_clicktrue` class is load-bearing. The script finds its own element by that class and reads its configuration from that element’s `src`; without the class it loads and does nothing.
- The host and hash are issued per domain and cannot be derived. Never copy a tag between sites (Shutter Factory’s is `ob.buzzfighter.com`, Shenandoah’s `ob.buzzfufighter.com`), and never substitute the generic `clickcease.com/monitor/stat.js`.
- ClickCease blocks fraud by adding IPs to the connected Google Ads account’s exclusion list, so Howard’s Google Ads account must be connected in the dashboard.
- Proving it fires needs a real browser on the live domain. Its beacons can take up to a minute to appear; the tag in the HTML proves nothing on its own.

`clickcease.test.mjs` pins the tag, its position, the fallback’s hash and the absence of any other tag.

## Verification

`node --test consultation.test.mjs consultation-http.test.mjs clickcease.test.mjs` checks validation, spam rejection, the contact sent to GHL, credential handling, confirmed-success handling, the HTTP guards and the rate limit, using a mock transport, and pins the ClickCease tag.
