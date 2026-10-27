import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// The A2P 10DLC opt-in howardsdraperies.com's forms use (client/src/components/
// SmsConsentFields.tsx): two separate, optional, unticked boxes naming the
// registered business, each with frequency, rates, HELP and STOP. Carriers
// reject a campaign whose opt-in is pre-ticked, required, or mixes service and
// marketing consent.
const BUSINESS = "VVD Ventures LLC DBA Howard's Draperies";
const DISCLOSURE = ' at the phone number provided. Message frequency may vary. Message &amp; Data rates may apply. Reply <strong>HELP</strong> for help or <strong>STOP</strong> to opt out.';

const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
const formJs = await readFile(new URL('./dist/form.js', import.meta.url), 'utf8');
const form = html.slice(html.indexOf('<form id="consultation-form"'), html.indexOf('</form>'));

test('the form has two separate, optional, unticked SMS opt-ins', () => {
  const boxes = form.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.deepEqual(boxes, [
    '<input id="smsTransactional" name="smsTransactional" type="checkbox"/>',
    '<input id="smsMarketing" name="smsMarketing" type="checkbox"/>',
  ]);
  assert.ok(form.includes('<legend>Text messages (optional)</legend>'));
});

test('each opt-in names the registered business and carries the full disclosure', () => {
  for (const kind of ['transactional messages', 'marketing and promotional messages']) {
    assert.ok(form.includes(`I consent to receive ${kind} from <strong>${BUSINESS}</strong>${DISCLOSURE}`), kind);
  }
});

test('the opt-ins sit above the submit button, and the policy links and no-sharing line below', () => {
  assert.ok(form.indexOf('smsMarketing') < form.indexOf('type="submit"'));
  const note = form.slice(form.indexOf('<p class="hardwood-form-note hardwood-consent">'));
  assert.ok(note.includes('href="/privacy-policy/"'));
  assert.ok(note.includes('href="/terms-of-service/"'));
  assert.ok(note.includes('SMS consent is not shared with third parties.'));
});

test('without JavaScript the opt-ins are hidden with the rest of the form', () => {
  assert.ok(form.includes('<fieldset class="hardwood-sms hardwood-consent">'));
  assert.ok(html.includes('<noscript><style>.hardwood-form-fields,.hardwood-submit,.hardwood-consent{display:none}</style></noscript>'));
});

// Runs form.js against a stub page, submits once and returns the JSON it posted.
async function posted({smsTransactional, smsMarketing}) {
  const values = {firstName: 'Jane', lastName: 'Doe', phone: '(303) 555-0100', email: 'jane@example.com'};
  const node = () => ({hidden: true, textContent: '', disabled: false, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, addEventListener() {}, focus() {}});
  const elements = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, {...node(), value}]));
  elements.smsTransactional = {...node(), checked: smsTransactional};
  elements.smsMarketing = {...node(), checked: smsMarketing};
  // Like a browser, FormData carries only the ticked boxes, as "on".
  const entries = {...values, ...(smsTransactional ? {smsTransactional: 'on'} : {}), ...(smsMarketing ? {smsMarketing: 'on'} : {})};
  let listener, body;
  vm.runInNewContext(formJs, {
    window: {},
    document: {querySelector: selector => selector === '#consultation-form'
      ? {...node(), elements, querySelector: node, addEventListener: (name, callback) => { listener = callback; }, reset() {}}
      : node()},
    performance: {now: () => 10_000},
    FormData: class { *[Symbol.iterator]() { yield* Object.entries(entries); } },
    fetch: async (url, request) => { body = JSON.parse(request.body); return {ok: true, json: async () => ({success: true, contactId: 'abc123'})}; },
    AbortSignal: {timeout: () => undefined},
    setTimeout,
  });
  await listener({preventDefault() {}});
  return body;
}

test('form.js sends both opt-ins as booleans', async () => {
  for (const smsTransactional of [false, true]) {
    for (const smsMarketing of [false, true]) {
      const body = await posted({smsTransactional, smsMarketing});
      assert.equal(body.smsTransactional, smsTransactional);
      assert.equal(body.smsMarketing, smsMarketing);
    }
  }
});
