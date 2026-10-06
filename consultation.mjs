// Leads go straight to Howard's GoHighLevel location, the way Shutter Factory's
// landing pages send theirs (cody-del/shutter-factory-landing-page,
// netlify/functions/lead.ts). The token and location come from this site's
// Netlify environment variables.
export const GHL_UPSERT_URL = 'https://services.leadconnectorhq.com/contacts/upsert';
const GHL_VERSION = '2021-07-28';

// The tag GHL's follow-up workflow triggers on; nothing here enrols the lead.
// Renaming it detaches every new lead from that workflow without any error, so
// change the GHL trigger in the same sitting.
export const LEAD_TAG = 'google_landing_page';
// Page attribution rides on the contact's source, as on Shutter Factory's pages.
export const LEAD_SOURCE = 'Motorized Shades Page';

// Submissions sooner than this after the page loads are refused. form.js waits
// it out, so a person is never caught by it.
export const MIN_FILL_MS = 3000;

const PHONE = '(303) 449-4337';

// The pattern zod's z.string().email() accepts, as on the main site's forms.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

export async function submitConsultation(data, {fetcher = fetch, rateLimited = () => false, env = process.env} = {}) {
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

  const token = env.GHL_PRIVATE_TOKEN || env.GHL_API_KEY;
  const locationId = env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    console.error('[consultation] GHL_PRIVATE_TOKEN and GHL_LOCATION_ID are not configured');
    return fail(500, `We couldn’t send your request. Please call ${PHONE}.`);
  }
  const contact = {
    locationId,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    phone: data.phone.trim(),
    email: data.email.trim().toLowerCase(),
    source: LEAD_SOURCE,
    tags: [LEAD_TAG],
  };
  try {
    const response = await fetcher(GHL_UPSERT_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${token}`, Version: GHL_VERSION, 'Content-Type': 'application/json', Accept: 'application/json'},
      // Netlify stops synchronous functions after 10 seconds.
      body: JSON.stringify(contact), signal: AbortSignal.timeout(9000),
    });
    const result = await response.json();
    const contactId = result?.contact?.id || result?.contactId;
    // Only a contact id confirms the lead reached GHL. It is returned so that
    // conversions can be reported for real leads only, keyed lead_<contactId>.
    if (!response.ok || typeof contactId !== 'string' || !contactId) {
      console.error(`[consultation] GHL did not confirm the lead (HTTP ${response.status})`);
      return fail(502, `We couldn’t confirm your request. Please call ${PHONE} for help.`);
    }
    return {status: 200, body: {success: true, contactId}};
  } catch (error) {
    console.error(`[consultation] GHL request failed: ${error.name}`);
    return fail(502, `We couldn’t confirm your request. Please call ${PHONE} before submitting again.`);
  }
}
