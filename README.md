# Howard’s Draperies — Motorized Shades

Standalone motorized-shades landing page for Boulder and the Front Range, served at https://go.howardsdraperies.com/ (Netlify site `howardsnewlanding`).

## Netlify

The checked-in `netlify.toml` publishes `dist` as static files and deploys one function, `netlify/functions/consultation.mjs`, at `/api/consultation`. The build command only runs the form tests, so a failing test stops the deploy. No dependency installation, Next.js adapter, or environment variables are needed. It also sets the main site's `Referrer-Policy` and `Permissions-Policy` headers, plus `X-Content-Type-Options: nosniff`.

## Local preview

Run `node server.mjs --mock` (Node 22+) and open http://localhost:4319. `--mock` answers the form the way Howard’s lead route does without sending anything. Without it, a submitted form creates a real contact in Howard’s GoHighLevel.

## Consultation form

The form posts to `/api/consultation`, which forwards the lead server to server to the main site’s lead route, `https://howardsdraperies.com/api/leads/` (`cody-del/howards-draperies`, `src/app/api/leads/route.ts`). That route upserts the contact into Howard’s GoHighLevel location and holds the GHL token; this repository has no credentials. The pattern follows Beacon Blinds’ motorized-shades landing page (`cody-del/beacon-landing-page`).

Spam protection, in `consultation.mjs` and `consultation-http.mjs`:

- **Hidden field:** `website` is hidden from people and skipped by the keyboard; a request that fills it in is refused. It is named like the main site's trap field, because browsers autofill fields whose names mention “company”.
- **Fill time:** `form.js` sends the time since the page loaded, measured on the visitor’s own clock. Anything under 3 seconds is refused, the same minimum as Howard’s route.
- **Same-site JSON only:** requests from another origin, non-JSON bodies, and bodies over 8 KiB are refused.
- **Validation:** all four fields are required; the phone needs 10 digits and the email must pass the same check as the main site.
- **Rate limit:** 5 leads per visitor every 15 minutes, held in memory like the main site’s.

Refused requests get a message with Howard’s phone number and are never forwarded. The visitor sees the thank-you message only when Howard’s route returns a contact id. That route answers `success: true` without an id when it discards a lead as spam, so success alone is not treated as delivered. Anything else asks the visitor to call (303) 449-4337.

Each lead reaches GoHighLevel with the main site’s source, `Website - Howard's Draperies`, and three tags: `Website Lead`, which the main site adds to every lead; `motorized`, the main consultation form’s value for motorized shades; and `google_landing_page`, which marks leads from this page. Beacon’s landing page sends the same `google_landing_page` tag. GHL matches tags literally, so workflows must filter on exactly that string. Dropping `Website Lead` would need a change to the main site’s route, or this page sending to GHL directly with its own token. The “Additional details” field reads “Motorized shades consultation request from go.howardsdraperies.com.” Howard’s route checks fill time against its own clock, so the function sends a start time computed from the visitor’s measured fill time; a visitor with a wrong clock is not dropped.

Howard’s route limits each sender address to 5 leads per 15 minutes. Every lead from this page reaches it from this function’s address, not the visitor’s, so a burst of real leads could hit that limit; those visitors are asked to call instead.

The form has no SMS consent checkboxes, so these leads are not opted in to texts. The main site’s forms have them. The page also has no Google tag, so form and call conversions are not tracked.

## Verification

`node --test consultation.test.mjs consultation-http.test.mjs` checks validation, spam rejection, the payload sent to Howard’s route, confirmed-success handling, the HTTP guards and the rate limit, using a mock transport.
