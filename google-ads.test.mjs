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
async function submitForm({ok = true, body = {success: true, contactId: 'abc123'}, email = ' Jane.Doe@Example.COM '} = {}) {
  const values = {firstName: 'Jane', lastName: 'Doe', phone: '(303) 555-0100', email};
  const node = () => ({hidden: true, textContent: '', disabled: false, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, addEventListener() {}, focus() {}});
  const elements = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, {...node(), value}]));
  const listeners = {};
  const form = {...node(), elements, querySelector: node, addEventListener: (name, callback) => { listeners[name] = callback; }, reset() {}};
  const gtag = [];
  vm.runInNewContext(formJs, {
    window: {gtag: (...args) => gtag.push(args)},
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
