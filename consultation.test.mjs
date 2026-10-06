import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitConsultation, LEADS_URL, MIN_FILL_MS} from './consultation.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const valid = {firstName: 'Test', lastName: 'Person', phone: '(303) 555-0123', email: 'test@example.com', website: '', elapsedMs: 20000};
const mustNotCall = () => {throw Error('must not call');};
const confirmed = async () => ({ok: true, status: 200, json: async () => ({success: true, contactId: 'contact-1'})});

test('incomplete, invalid and spam requests never reach Howard’s', async () => {
  for (const data of [
    null, [], {},
    {...valid, phone: '123'}, {...valid, email: 'invalid'}, {...valid, email: 'a@b.c'},
    {...valid, lastName: ' '}, {...valid, firstName: 'x'.repeat(101)},
    {...valid, website: 'https://spam.example'},
    {...valid, elapsedMs: undefined}, {...valid, elapsedMs: MIN_FILL_MS - 1},
    {...valid, elapsedMs: '20000'}, {...valid, elapsedMs: 20000.5},
  ]) {
    const result = await submitConsultation(data, {fetcher: mustNotCall, rateLimited: mustNotCall});
    assert.equal(result.status, 400);
    assert.equal(result.body.success, false);
  }
});

test('sends the lead to Howard’s route with its tags and a start time on the server clock', async () => {
  let sent;
  const result = await submitConsultation({...valid, firstName: ' Test ', email: ' test@example.com '}, {
    now: () => 1_800_000_000_000,
    fetcher: async (url, request) => {
      sent = {url, method: request.method, body: JSON.parse(request.body)};
      return confirmed();
    },
  });
  assert.deepEqual(result, {status: 200, body: {success: true}});
  assert.equal(sent.url, LEADS_URL);
  assert.equal(sent.method, 'POST');
  assert.deepEqual(sent.body, {
    firstName: 'Test', lastName: 'Person', phone: '(303) 555-0123', email: 'test@example.com',
    product: 'motorized', type: 'google_landing_page',
    message: 'Motorized shades consultation request from go.howardsdraperies.com.',
    formStartedAt: 1_800_000_000_000 - 20000,
  });
});

test('a page left open for days still sends a usable start time', async () => {
  let body;
  await submitConsultation({...valid, elapsedMs: 10 * DAY_MS}, {
    now: () => 1_800_000_000_000,
    fetcher: async (url, request) => {
      body = JSON.parse(request.body);
      return confirmed();
    },
  });
  assert.equal(body.formStartedAt, 1_800_000_000_000 - DAY_MS);
});

test('exactly the minimum fill time is accepted', async () => {
  const result = await submitConsultation({...valid, elapsedMs: MIN_FILL_MS}, {fetcher: confirmed});
  assert.equal(result.status, 200);
});

test('never reports success unless Howard’s returns a contact id', async t => {
  t.mock.method(console, 'error', () => {});
  for (const fetcher of [
    async () => ({ok: false, status: 502, json: async () => ({success: false, error: 'Lead delivery is temporarily unavailable.'})}),
    async () => ({ok: false, status: 429, json: async () => ({success: false})}),
    // Howard's answer when it discards a submission as spam.
    async () => ({ok: true, status: 200, json: async () => ({success: true, contactId: null})}),
    async () => ({ok: true, status: 200, json: async () => ({})}),
    async () => ({ok: true, status: 200, json: async () => {throw new SyntaxError('Unexpected token <');}}),
    async () => {throw new TypeError('fetch failed');},
  ]) {
    const result = await submitConsultation(valid, {fetcher});
    assert.equal(result.status, 502);
    assert.equal(result.body.success, false);
    assert.match(result.body.error, /\(303\) 449-4337/);
  }
});

test('rate-limited visitors are told to wait, and only valid leads count toward the limit', async () => {
  const limited = await submitConsultation(valid, {fetcher: mustNotCall, rateLimited: () => true});
  assert.equal(limited.status, 429);
  assert.equal(limited.body.success, false);
  let checks = 0;
  await submitConsultation({...valid, phone: '1'}, {fetcher: mustNotCall, rateLimited: () => {checks++; return false;}});
  assert.equal(checks, 0);
});
