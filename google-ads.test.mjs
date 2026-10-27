import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const ADS_ID = 'AW-11359789040';
const PHONE = '(303) 449-4337';

const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
const formJs = await readFile(new URL('./dist/form.js', import.meta.url), 'utf8');
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>'));

test('the Google tag loads in <head>, after ClickCease', () => {
  const tag = `<script async src="https://www.googletagmanager.com/gtag/js?id=${ADS_ID}"></script>`;
  assert.ok(head.includes(tag));
  assert.ok(head.indexOf('ob.sornavellon.com') < head.indexOf(tag));
  assert.ok(head.includes(`gtag('config','${ADS_ID}');`));
});

test('call tracking matches every number shown on the page, character for character', () => {
  // For visitors from a Google ad, Google swaps in a forwarding number by
  // matching this exact string in the page text; other formats are left alone.
  assert.ok(head.includes(`gtag('config','${ADS_ID}/h0pSCKD2wZMdEPC_4qgq',{'phone_conversion_number':'${PHONE}'});`));
  const text = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  const shown = text.match(/\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/g) ?? [];
  assert.ok(shown.length > 0);
  assert.deepEqual([...new Set(shown)], [PHONE]);
});

test('the lead conversion fires only after GHL confirms the lead', () => {
  assert.ok(formJs.includes(`const LEAD_CONVERSION = '${ADS_ID}/EwciCLOgwJMdEPC_4qgq';`));
  const confirmed = formJs.indexOf('if (!response.ok || result.success !== true) throw');
  const reported = formJs.indexOf('reportLeadConversion(result.contactId, payload.email);');
  assert.ok(confirmed > 0 && reported > confirmed);
  assert.match(formJs, /transaction_id: `lead_\$\{contactId\}`/);
});

// Runs form.js against a stub page and submits the form once, returning every gtag call.
async function submitForm({ok = true, body = {success: true, contactId: 'abc123'}, email = ' Jane.Doe@Example.COM ', hostname = 'localhost'} = {}) {
  const values = {firstName: 'Jane', lastName: 'Doe', phone: '(303) 555-0100', email};
  const node = () => ({hidden: true, textContent: '', disabled: false, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, addEventListener() {}, focus() {}});
  const elements = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, {...node(), value}]));
  elements.smsTransactional = {...node(), checked: false};
  elements.smsMarketing = {...node(), checked: false};
  const listeners = {};
  const form = {...node(), elements, querySelector: node, addEventListener: (name, callback) => { listeners[name] = callback; }, reset() {}};
  const gtag = [];
  vm.runInNewContext(formJs, {
    window: {gtag: (...args) => gtag.push(args), location: {hostname}},
    document: {querySelector: selector => selector === '#consultation-form' ? form : node()},
    performance: {now: () => 10_000},
    FormData: class { *[Symbol.iterator]() { yield* Object.entries(values); } },
    fetch: async () => ({ok, json: async () => body}),
    AbortSignal: {timeout: () => undefined},
    setTimeout,
  });
  await listeners.submit({preventDefault() {}});
  // Objects built inside the sandbox have its prototypes; compare plain copies.
  return JSON.parse(JSON.stringify(gtag));
}

test('enhanced conversions: the email is set right before the conversion, and the phone never is', async () => {
  // Ads only attaches user data that is already set when the conversion fires.
  const gtag = await submitForm();
  assert.deepEqual(gtag, [
    ['set', 'user_data', {email: 'jane.doe@example.com'}],
    ['event', 'conversion', {send_to: `${ADS_ID}/EwciCLOgwJMdEPC_4qgq`, transaction_id: 'lead_abc123'}],
  ]);
  // The privacy policy's SMS section promises no mobile information reaches third parties.
  assert.doesNotMatch(formJs, /phone_number|sha256_phone/);
});

test('a lead GHL did not confirm reports nothing, user data included', async () => {
  assert.deepEqual(await submitForm({ok: false, body: {success: false, error: 'nope'}}), []);
  assert.deepEqual(await submitForm({body: {success: false}}), []);
});

// GA4: until 2026-10-27 this page loaded only the Ads tag, so the ad traffic it carries
// was missing from howardsdraperies.com's GA4 property. Only the production host sends.
const GA4 = 'G-GQTBSF9LP1';
const NOT_PRODUCTION = ['howardsnewlanding.netlify.app', 'deploy-preview-8--howardsnewlanding.netlify.app', '69a1b2c3d4e5f6--howardsnewlanding.netlify.app', 'localhost', '127.0.0.1', 'howardsdraperies.com', 'go.howardsdraperies.com.evil.example'];

function headConfigs(hostname) {
  const context = {location: {hostname}, Date};
  context.window = context;
  for (const [, script] of head.matchAll(/<script>([^<]*)<\/script>/g)) vm.runInNewContext(script, context);
  return Array.from(context.dataLayer, args => Array.from(args)).filter(([command]) => command === 'config').map(([, id]) => id);
}

test('GA4 is configured after the Ads tag on the production host only', () => {
  assert.deepEqual(headConfigs('go.howardsdraperies.com'), [ADS_ID, GA4, `${ADS_ID}/h0pSCKD2wZMdEPC_4qgq`]);
  for (const hostname of NOT_PRODUCTION) assert.deepEqual(headConfigs(hostname), [ADS_ID, `${ADS_ID}/h0pSCKD2wZMdEPC_4qgq`], hostname);
});

test('a confirmed lead on the production host also sends one generate_lead, to GA4 only', async () => {
  const gtag = await submitForm({hostname: 'go.howardsdraperies.com'});
  assert.deepEqual(gtag.filter(([, name]) => name === 'generate_lead'), [['event', 'generate_lead', {send_to: GA4, form_type: 'landing_page'}]]);
  assert.deepEqual(gtag.filter(([, name]) => name === 'conversion').length, 1);
});

test('GA4 gets no lead event for a rejected (honeypot, too fast) submission or off the production host', async () => {
  // consultation.mjs answers a filled honeypot or a too-fast submission with a 400.
  assert.deepEqual(await submitForm({ok: false, body: {success: false, error: 'Unable to submit this request.'}, hostname: 'go.howardsdraperies.com'}), []);
  for (const hostname of NOT_PRODUCTION) {
    assert.deepEqual((await submitForm({hostname})).filter(([, name]) => name === 'generate_lead'), [], hostname);
  }
});
