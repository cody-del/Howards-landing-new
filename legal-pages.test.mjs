import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PAGES, legalContent} from './legal-pages.mjs';

// The copies of howardsdraperies.com's Privacy Policy and Terms that the
// consultation form links to. A2P reviewers read both, so the clauses the SMS
// opt-ins rely on are pinned here.
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const BUSINESS = 'VVD Ventures LLC DBA Howard&#x27;s Draperies';
const page = {};
for (const {path} of PAGES) page[path] = await read(`./dist/${path}/index.html`);
const main = html => html.slice(html.indexOf('<main'), html.indexOf('</main>'));

test('both pages are on this domain, out of search, and script-free', () => {
  for (const [path, html] of Object.entries(page)) {
    assert.ok(html.includes('<meta name="robots" content="noindex"/>'), path);
    assert.doesNotMatch(html, /<script/i, path);
    assert.ok(main(html).includes(BUSINESS), path);
    assert.ok(html.includes('<a href="/privacy-policy/">Privacy Policy</a><a href="/terms-of-service/">Terms of Service</a>'), path);
  }
  assert.ok(page['privacy-policy'].includes('<title>Privacy Policy | Howard’s Draperies</title>'));
  assert.ok(page['terms-of-service'].includes('<title>Terms &amp; Conditions | Howard’s Draperies</title>'));
});

test('the Privacy Policy keeps its SMS opt-in and no-sharing clauses', () => {
  const policy = main(page['privacy-policy']);
  assert.ok(policy.includes('3. SMS Messaging &amp; Opt-In Consent'));
  assert.ok(policy.includes('Providing your phone number alone does not grant'));
  assert.ok(policy.includes('No mobile information (including SMS opt-in consent) will be shared with third parties or affiliates for marketing or promotional purposes.'));
});

test('the Terms keep their SMS program, STOP, HELP and rates sections', () => {
  const terms = main(page['terms-of-service']);
  for (const heading of ['4. SMS Messaging Terms', '4.2 How to Opt Out (STOP)', '4.3 Support (HELP)', '4.4 Message and Data Rates']) {
    assert.ok(terms.includes(`<h3>${heading}</h3>`) || terms.includes(`<h2>${heading}</h2>`), heading);
  }
  assert.ok(terms.includes('<a href="/privacy-policy/">Privacy Policy</a>'));
});

test('the consultation form links to these pages, not the main site', async () => {
  const index = await read('./dist/index.html');
  assert.ok(index.includes('<a href="/privacy-policy/" target="_blank">Privacy Policy</a>'));
  assert.ok(index.includes('<a href="/terms-of-service/" target="_blank">Terms of Service</a>'));
  assert.doesNotMatch(index, /howardsdraperies\.com\/(privacy-policy|terms-of-service)/);
});

test('the landing page footer links to both pages', async () => {
  const index = await read('./dist/index.html');
  const footer = index.slice(index.indexOf('<footer'), index.indexOf('</footer>'));
  assert.ok(footer.includes('<nav class="site-footer-links" aria-label="Legal"><a href="/privacy-policy/">Privacy Policy</a><a href="/terms-of-service/">Terms of Service</a></nav>'));
});

test('the rebuild strips the main site\'s markup and refuses anything unexpected', () => {
  assert.equal(
    legalContent('<main id="m"><div class="x"><p class="a">Hi<!-- --> <strong>there</strong> <a href="/privacy-policy/" class="b">P</a> <a href="https://example.com" class="c">E</a><span>·</span></p></div></main>'),
    '<p>Hi <strong>there</strong> <a href="/privacy-policy/">P</a> <a href="https://example.com" target="_blank" rel="noopener">E</a> · </p>',
  );
  assert.throws(() => legalContent('<main><script>alert(1)</script></main>'), /Unexpected <script>/);
  assert.throws(() => legalContent('<main><img src="x"></main>'), /Unexpected <img>/);
  assert.throws(() => legalContent('<p>no main</p>'), /No <main>/);
});
