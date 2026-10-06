import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConsultationHandler, createRateLimiter} from './consultation-http.mjs';

const origin = 'https://go.howardsdraperies.com';
const request = (body = '{}', headers = {}) => new Request(`${origin}/api/consultation`, {
  method: 'POST', headers: {'Origin': origin, 'Content-Type': 'application/json', ...headers}, body,
});

test('HTTP guards reject invalid requests before forwarding', async () => {
  const handle = createConsultationHandler(() => {throw Error('Must not forward');});
  for (const [input, status] of [
    [new Request(`${origin}/api/consultation`), 405],
    [request('{}', {Origin: 'https://example.com'}), 403],
    [request('firstName=Jane', {'Content-Type': 'application/x-www-form-urlencoded'}), 415],
    [request('invalid json'), 400],
    [request('x'.repeat(8193)), 413],
    [request('{}', {'Content-Length': '8193'}), 413],
  ]) assert.equal((await handle(input)).status, status);
});

test('HTTP adapter preserves submission results and disables caching', async () => {
  const data = {firstName: 'Test', elapsedMs: 20000};
  for (const status of [200, 400, 429, 502]) {
    const body = {success: status === 200};
    const handle = createConsultationHandler(async received => {
      assert.deepEqual(received, data);
      return {status, body};
    });
    const response = await handle(request(JSON.stringify(data)));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), body);
  }
});

test('the rate limit is keyed by the visitor’s address', async () => {
  const seen = [];
  const handle = createConsultationHandler(
    async (data, {rateLimited}) => ({status: rateLimited() ? 429 : 200, body: {}}),
    ip => {seen.push(ip); return false;},
  );
  await handle(request(), {ip: '203.0.113.7'});
  await handle(request('{}', {'x-nf-client-connection-ip': '198.51.100.2'}));
  assert.deepEqual(seen, ['203.0.113.7', '198.51.100.2']);
});

test('rate limiter allows 5 leads per visitor per window', () => {
  const limited = createRateLimiter({windowMs: 1000, max: 2});
  assert.equal(limited('a', 0), false);
  assert.equal(limited('a', 1), false);
  assert.equal(limited('a', 2), true);
  assert.equal(limited('b', 2), false);
  assert.equal(limited('a', 1001), false);
  const defaults = createRateLimiter();
  for (let i = 0; i < 5; i++) assert.equal(defaults('c', i), false);
  assert.equal(defaults('c', 5), true);
});

test('deployed function rejects an empty lead without calling Howard’s', async () => {
  const {default: handle, config} = await import('./netlify/functions/consultation.mjs');
  assert.equal(config.path, '/api/consultation');
  assert.equal((await handle(request(), {ip: '203.0.113.9'})).status, 400);
});
