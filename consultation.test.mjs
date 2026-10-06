import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitConsultation, GHL_UPSERT_URL, LEAD_TAG, LEAD_SOURCE, MIN_FILL_MS} from './consultation.mjs';

const env = {GHL_PRIVATE_TOKEN: 'pit-test', GHL_LOCATION_ID: 'location-1'};
const valid = {firstName: 'Test', lastName: 'Person', phone: '(303) 555-0123', email: 'test@example.com', website: '', elapsedMs: 20000};
const mustNotCall = () => {throw Error('must not call');};
const created = async () => ({ok: true, status: 201, json: async () => ({new: true, contact: {id: 'contact-1'}})});

test('incomplete, invalid and spam requests never reach GHL', async () => {
  for (const data of [
    null, [], {},
    {...valid, phone: '123'}, {...valid, email: 'invalid'}, {...valid, email: 'a@b.c'},
    {...valid, lastName: ' '}, {...valid, firstName: 'x'.repeat(101)},
    {...valid, website: 'https://spam.example'},
    {...valid, elapsedMs: undefined}, {...valid, elapsedMs: MIN_FILL_MS - 1},
    {...valid, elapsedMs: '20000'}, {...valid, elapsedMs: 20000.5},
  ]) {
    const result = await submitConsultation(data, {env, fetcher: mustNotCall, rateLimited: mustNotCall});
    assert.equal(result.status, 400);
    assert.equal(result.body.success, false);
  }
});

test('upserts the contact into GHL tagged google_landing_page and returns its id', async () => {
  let sent;
  const result = await submitConsultation({...valid, firstName: ' Test ', email: ' Test@Example.com '}, {
    env,
    fetcher: async (url, request) => {
      sent = {url, method: request.method, headers: request.headers, body: JSON.parse(request.body)};
      return created();
    },
  });
  assert.deepEqual(result, {status: 200, body: {success: true, contactId: 'contact-1'}});
  assert.equal(sent.url, GHL_UPSERT_URL);
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers.Authorization, 'Bearer pit-test');
  assert.equal(sent.headers.Version, '2021-07-28');
  assert.deepEqual(sent.body, {
    locationId: 'location-1', firstName: 'Test', lastName: 'Person', phone: '(303) 555-0123', email: 'test@example.com',
    source: 'Motorized Shades Page', tags: ['google_landing_page'],
  });
  assert.equal(LEAD_TAG, 'google_landing_page');
  assert.equal(LEAD_SOURCE, 'Motorized Shades Page');
});

test('falls back to GHL_API_KEY, and refuses to send without credentials', async t => {
  t.mock.method(console, 'error', () => {});
  let auth;
  await submitConsultation(valid, {env: {GHL_API_KEY: 'pit-legacy', GHL_LOCATION_ID: 'location-1'}, fetcher: async (url, request) => {
    auth = request.headers.Authorization;
    return created();
  }});
  assert.equal(auth, 'Bearer pit-legacy');
  for (const missing of [{}, {GHL_PRIVATE_TOKEN: 'pit-test'}, {GHL_LOCATION_ID: 'location-1'}]) {
    const result = await submitConsultation(valid, {env: missing, fetcher: mustNotCall});
    assert.equal(result.status, 500);
    assert.match(result.body.error, /\(303\) 449-4337/);
  }
});

test('exactly the minimum fill time is accepted', async () => {
  const result = await submitConsultation({...valid, elapsedMs: MIN_FILL_MS}, {env, fetcher: created});
  assert.equal(result.status, 200);
});

test('never reports success unless GHL returns a contact id', async t => {
  t.mock.method(console, 'error', () => {});
  for (const fetcher of [
    async () => ({ok: false, status: 401, json: async () => ({message: 'Invalid JWT'})}),
    async () => ({ok: false, status: 422, json: async () => ({message: 'Unprocessable'})}),
    async () => ({ok: true, status: 200, json: async () => ({contact: {}})}),
    async () => ({ok: true, status: 200, json: async () => ({})}),
    async () => ({ok: true, status: 200, json: async () => {throw new SyntaxError('Unexpected token <');}}),
    async () => {throw new TypeError('fetch failed');},
  ]) {
    const result = await submitConsultation(valid, {env, fetcher});
    assert.equal(result.status, 502);
    assert.equal(result.body.success, false);
    assert.match(result.body.error, /\(303\) 449-4337/);
  }
});

test('rate-limited visitors are told to wait, and only valid leads count toward the limit', async () => {
  const limited = await submitConsultation(valid, {env, fetcher: mustNotCall, rateLimited: () => true});
  assert.equal(limited.status, 429);
  assert.equal(limited.body.success, false);
  let checks = 0;
  await submitConsultation({...valid, phone: '1'}, {env, fetcher: mustNotCall, rateLimited: () => {checks++; return false;}});
  assert.equal(checks, 0);
});
