import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

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

test('the lead conversion fires only after GHL confirms the lead, without user data', () => {
  assert.ok(formJs.includes(`const LEAD_CONVERSION = '${ADS_ID}/EwciCLOgwJMdEPC_4qgq';`));
  const confirmed = formJs.indexOf('if (!response.ok || result.success !== true) throw');
  const reported = formJs.indexOf('reportLeadConversion(result.contactId);');
  assert.ok(confirmed > 0 && reported > confirmed);
  assert.match(formJs, /transaction_id: `lead_\$\{contactId\}`/);
  assert.doesNotMatch(formJs, /user_data|sha256/);
});
