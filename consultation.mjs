// Leads are forwarded to the main site's lead route, which upserts the contact
// into Howard's GoHighLevel location (cody-del/howards-draperies,
// src/app/api/leads/route.ts). That route holds the GHL token; this page never does.
export const LEADS_URL = 'https://howardsdraperies.com/api/leads/';

// Howard's route discards anything submitted sooner than this after the form
// appeared (MIN_FORM_FILL_MS there), so the same minimum is enforced here.
export const MIN_FILL_MS = 3000;

const PHONE = '(303) 449-4337';
const DAY_MS = 24 * 60 * 60 * 1000;

// The pattern zod's z.string().email() applies on the main site, so an address
// accepted here is never rejected there.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

export async function submitConsultation(data, {fetcher = fetch, now = Date.now, rateLimited = () => false} = {}) {
  const fail = (status, error) => ({status, body: {success: false, error}});
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'Please check your contact details.');
  // Hidden field that people never see; bots fill it in. Named like the main
  // site's: browsers autofill fields whose names mention "company".
  if (data.website) return fail(400, `Unable to submit this request. Please call ${PHONE}.`);
  // Time since the page loaded, measured on the visitor's own clock.
  if (!Number.isSafeInteger(data.elapsedMs) || data.elapsedMs < MIN_FILL_MS) return fail(400, `Unable to submit this request. Please call ${PHONE}.`);
  const limits = {firstName: 100, lastName: 100, phone: 30, email: 254};
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof data[field] !== 'string' || !data[field].trim() || data[field].trim().length > limit) return fail(400, 'Please complete all contact fields.');
  }
  const phone = data.phone.replace(/\D/g, '');
  if (!/^\d{10}$|^1\d{10}$/.test(phone) || !EMAIL.test(data.email.trim())) return fail(400, 'Please enter a valid phone number and email address.');
  if (rateLimited()) return fail(429, `Too many requests. Please wait a few minutes or call ${PHONE}.`);
  const payload = {
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    phone: data.phone.trim(),
    email: data.email.trim(),
    // Howard's route adds its own "Website Lead" tag, then turns product and
    // type into tags. "motorized" is the value the main site's consultation form
    // sends for motorized shades. google_landing_page marks leads from this page,
    // the same tag Beacon's landing page sends. GHL matches tags literally, so
    // its workflows must filter on exactly this string.
    product: 'motorized',
    type: 'google_landing_page',
    message: 'Motorized shades consultation request from go.howardsdraperies.com.',
    // Howard's route requires a start time and compares it with its own clock.
    // The fill time was checked above on the visitor's clock; restating it on
    // this server's clock keeps a visitor's wrong clock from dropping a real lead.
    formStartedAt: now() - Math.min(data.elapsedMs, DAY_MS),
  };
  try {
    const response = await fetcher(LEADS_URL, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      // Netlify stops synchronous functions after 10 seconds.
      body: JSON.stringify(payload), signal: AbortSignal.timeout(9000),
    });
    const result = await response.json();
    // Howard's route answers {success: true, contactId: null} when it discards a
    // submission as spam, so only a contact id confirms the lead reached GHL.
    if (!response.ok || result.success !== true || typeof result.contactId !== 'string' || !result.contactId) {
      console.error(`[consultation] howardsdraperies.com did not confirm the lead (HTTP ${response.status})`);
      return fail(502, `We couldn’t confirm your request. Please call ${PHONE} for help.`);
    }
    return {status: 200, body: {success: true}};
  } catch (error) {
    console.error(`[consultation] Lead delivery failed: ${error.name}`);
    return fail(502, `We couldn’t confirm your request. Please call ${PHONE} before submitting again.`);
  }
}
