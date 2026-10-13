import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// An indexed ad page can take the brand's own searches from howardsdraperies.com
// (Shenandoah's did, 2026-10-08), so this page stays out of organic results.
test('the page says noindex', () => {
  assert.ok(read('dist/index.html').includes('<meta name="robots" content="noindex"/>'));
});

test('every route sends X-Robots-Tag: noindex', () => {
  assert.match(read('netlify.toml'), /X-Robots-Tag = "noindex"/);
});
