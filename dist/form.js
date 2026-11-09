const form = document.querySelector('#consultation-form');
const button = form.querySelector('button[type="submit"]');
const errorBox = document.querySelector('#form-error');
const fields = ['firstName', 'lastName', 'phone', 'email'];
const CALL_US = 'We couldn’t confirm your request. Please call (303) 449-4337 before submitting again.';
// consultation.mjs rejects anything sent sooner than this after the page loads.
const MIN_FILL_MS = 3000;
// The same email pattern consultation.mjs and the main site accept.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;
// Google Ads conversion "SS - Submit Lead Form", sent with the lead's email for
// enhanced conversions. Email only: the privacy policy discloses a hashed email
// to Google Ads, and its SMS section promises no mobile information goes to
// third parties for marketing, so the phone number is never sent.
const LEAD_CONVERSION = 'AW-11359789040/EwciCLOgwJMdEPC_4qgq';
// GA4, howardsdraperies.com's property. index.html configures it on the production
// host only, and the lead event below is held to the same host.
const GA4_ID = 'G-GQTBSF9LP1';
const GA4_HOSTNAME = 'go.howardsdraperies.com';
let pending = false;

// Cloudflare Turnstile: an invisible human check on the consultation form; consultation-http.mjs
// checks its token. The widget is "Howards Draperies lead forms" in the gbp@shadestrategy.com
// Cloudflare account. Other hosts, such as Netlify previews and localhost, get Cloudflare's
// always-pass test key. The server only checks once TURNSTILE_SECRET_KEY is set in Netlify.
const TURNSTILE_LIVE_HOSTS = ['go.howardsdraperies.com'];
const TURNSTILE_SITE_KEY = TURNSTILE_LIVE_HOSTS.includes(window.location?.hostname) ? '0x4AAAAAAF2pk6Gwsff3y1Q9' : '1x00000000000000000000AA';
let turnstileLoaded;
function humanCheck(form) {
  let widget;
  let failed = false;
  let needsTick = false;
  // When the current token arrived. Cloudflare honours a token for 300 s; a visitor who leaves
  // the tab open while filling the form could otherwise send a stale one ("timeout-or-duplicate").
  let issuedAt = 0;
  try {
    const container = document.createElement('div');
    container.className = 'lead-form-turnstile';
    form.querySelector('button[type="submit"]').before(container);
    turnstileLoaded ??= new Promise((resolve, reject) => {
      window.onTurnstileLoad = resolve;
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
      script.async = true;
      script.onerror = reject;
      document.head.append(script);
    });
    turnstileLoaded.then(() => {
      widget = window.turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY, action: 'consultation', size: 'flexible', appearance: 'interaction-only',
        'refresh-expired': 'auto',
        callback: () => { issuedAt = Date.now(); },
        'before-interactive-callback': () => { needsTick = true; },
        'error-callback': () => { failed = true; },
      });
    }).catch(() => { failed = true; });
  } catch {
    failed = true;
  }
  return {
    // The token; '' when the check couldn't run (the server then decides); null while the
    // visitor still has to tick the box.
    async token() {
      try {
        // A token that has expired, or is close to it, is swapped for a fresh one first.
        if (widget !== undefined && !failed && (window.turnstile.isExpired?.(widget) || (issuedAt && Date.now() - issuedAt > 270000))) {
          issuedAt = 0;
          window.turnstile.reset(widget);
        }
      } catch {}
      for (let waited = 0; waited < 8000; waited += 200) {
        if (failed) return '';
        const token = widget !== undefined && window.turnstile.getResponse(widget);
        if (token) return token;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return needsTick ? null : '';
    },
    // Tokens work once, so every send attempt needs a fresh one.
    reset() {
      try { if (widget !== undefined) { issuedAt = 0; window.turnstile.reset(widget); } } catch {}
    },
  };
}
const human = humanCheck(form);

// Reported (to Ads, and to GA4 on production) only for a lead GHL confirmed. The transaction id is keyed by the
// contact id, which GHL reuses when the same person submits again, so Google
// counts that person once. Tracking must never hold up or break the form.
function reportLeadConversion(contactId, email) {
  try {
    if (typeof window.gtag !== 'function') return;
    // Set before the conversion fires, or Ads records it without the email. It goes
    // in lowercased but unhashed: the Google tag hashes it in the browser, and only
    // the hash leaves.
    const normalized = String(email || '').trim().toLowerCase();
    if (EMAIL.test(normalized)) window.gtag('set', 'user_data', {email: normalized});
    window.gtag('event', 'conversion', {send_to: LEAD_CONVERSION, transaction_id: `lead_${contactId}`});
    // The main site's GA4 lead event, to GA4 only (send_to) so Ads gets no second
    // event. No email or phone: these parameters go to Google Analytics.
    if (window.location?.hostname === GA4_HOSTNAME) window.gtag('event', 'generate_lead', {send_to: GA4_ID, form_type: 'landing_page'});
  } catch {
    // A blocked or broken tag skips the conversion; the lead is already in GHL.
  }
}

function fieldError(name) {
  const value = form.elements[name].value.trim();
  if (!value) return `Please enter your ${{firstName: 'first name', lastName: 'last name', phone: 'phone number', email: 'email address'}[name]}.`;
  if (name === 'email' && !EMAIL.test(value)) return 'Please enter a valid email address.';
  if (name === 'phone' && !/^\d{10}$|^1\d{10}$/.test(value.replace(/\D/g, ''))) return 'Please enter a 10-digit phone number.';
  return '';
}

function validate(name) {
  const message = fieldError(name);
  const error = document.querySelector(`#${name}-error`);
  error.textContent = message;
  error.hidden = !message;
  form.elements[name].setAttribute('aria-invalid', String(Boolean(message)));
  return !message;
}

for (const name of fields) {
  form.elements[name].addEventListener('input', () => {
    if (form.elements[name].getAttribute('aria-invalid') === 'true') validate(name);
  });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending) return;
  errorBox.hidden = true;
  const invalid = fields.filter(name => !validate(name));
  if (invalid.length) {
    form.elements[invalid[0]].focus();
    return;
  }
  pending = true;
  button.disabled = true;
  button.textContent = 'Sending your request…';
  form.setAttribute('aria-busy', 'true');
  let attempted = false;
  try {
    // Someone whose browser autofills the form can be faster than the minimum;
    // wait it out rather than have the lead rejected.
    const wait = MIN_FILL_MS + 100 - performance.now();
    const [token] = await Promise.all([human.token(), wait > 0 && new Promise(resolve => setTimeout(resolve, wait))]);
    if (token === null) throw new Error('Please tick the box to confirm you’re a person, then send again.');
    const payload = Object.fromEntries(new FormData(form));
    // Time since the page started loading, on this browser's own clock.
    payload.elapsedMs = Math.round(performance.now());
    // FormData leaves unticked boxes out and sends ticked ones as "on"; send
    // both SMS opt-ins as booleans.
    payload.smsTransactional = form.elements.smsTransactional.checked === true;
    payload.smsMarketing = form.elements.smsMarketing.checked === true;
    payload['cf-turnstile-response'] = token;
    attempted = true;
    const response = await fetch('/api/consultation', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      // AbortSignal.timeout is missing before Safari 16 (iOS 15 iPads); send
      // without a timeout there rather than fail.
      signal: AbortSignal.timeout?.(20000),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || CALL_US);
    reportLeadConversion(result.contactId, payload.email);
    form.hidden = true;
    form.reset();
    const success = document.querySelector('#consultation-success');
    success.hidden = false;
    success.focus();
  } catch (error) {
    errorBox.textContent = error.name === 'TimeoutError' || error instanceof TypeError || error instanceof SyntaxError
      ? CALL_US
      : error.message;
    errorBox.hidden = false;
  } finally {
    if (attempted) human.reset();
    pending = false;
    button.disabled = false;
    button.textContent = 'Request My Consultation';
    form.removeAttribute('aria-busy');
  }
});
