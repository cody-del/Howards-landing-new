import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// ClickCease (CHEQ) issues the script host and hash per domain from its
// dashboard; they cannot be derived. These are Howard's.
const HOST = 'ob.sornavellon.com';
const HASH = 'f55b4de59e892a78c4939af00208d7e7';
const SCRIPT = `<script async src="https://${HOST}/i/${HASH}.js" class="ct_clicktrue"></script>`;

const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>'));

test('the script opens <head>, right after the charset, with its ct_clicktrue class', () => {
  // The bundle finds its own element by the ct_clicktrue class and reads its
  // configuration from that element's src. Without the class it loads and does nothing.
  assert.ok(head.includes(SCRIPT));
  const before = head.slice(0, head.indexOf(SCRIPT)).replace(/<!--[\s\S]*?-->/g, '');
  assert.equal(before, '<head><meta charSet="utf-8"/>');
});

test('the no-JavaScript fallback opens <body> and uses the same hash', () => {
  assert.ok(body.startsWith(`<body><noscript><iframe src="https://${HOST}/ns/${HASH}.html?ch=" width="0" height="0" style="display:none"></iframe></noscript>`));
});

test('only this domain’s tag is present, never the generic snippet', () => {
  // ob.buzzfighter.com and ob.buzzfufighter.com belong to other sites in the
  // portfolio, and the public stat.js reports nothing on this account.
  assert.doesNotMatch(html, /clickcease\.com\/monitor\/stat\.js/);
  assert.deepEqual([...new Set([...html.matchAll(/https:\/\/(ob\.[a-z]+\.com)\//g)].map(match => match[1]))], [HOST]);
  assert.deepEqual([...new Set([...html.matchAll(/\/(?:i|ns)\/([0-9a-f]{32})\./g)].map(match => match[1]))], [HASH]);
});
