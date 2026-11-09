import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {verifyHuman, SITEVERIFY_URL, TOKEN_FIELD} from './turnstile.mjs';
import {createConsultationHandler} from './consultation-http.mjs';

const clientSource = readFileSync(new URL('./dist/form.js', import.meta.url), 'utf8');
const LIVE_HOSTS = ['go.howardsdraperies.com'];
const LIVE_SITE_KEY = '0x4AAAAAAF2pk6Gwsff3y1Q9';

// The secret is passed explicitly, so a build's real TURNSTILE_SECRET_KEY is never read.
const env = {TURNSTILE_SECRET_KEY: 'test-secret-not-real'};
// Answers siteverify with `answer` and records what was asked.
function cloudflare(answer) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({url, body: new URLSearchParams(init.body)});
    if (answer instanceof Error) throw answer;
    if (answer instanceof Response) return answer;
    return Response.json(answer);
  };
  return {calls, fetcher};
}

test('without a secret the check is off and Cloudflare is not called', async () => {
  const {calls, fetcher} = cloudflare({success: false});
  assert.equal(await verifyHuman(undefined, '1.2.3.4', {fetcher, env: {}}), true);
  assert.equal(await verifyHuman(undefined, '1.2.3.4', {fetcher, env: {TURNSTILE_SECRET_KEY: ' '}}), true);
  assert.equal(calls.length, 0);
});

test('a token Cloudflare accepts passes, sent with the secret and the visitor IP', async () => {
  const {calls, fetcher} = cloudflare({success: true});
  assert.equal(await verifyHuman('token-1', '1.2.3.4', {fetcher, env}), true);
  assert.equal(calls[0].url, SITEVERIFY_URL);
  assert.deepEqual(Object.fromEntries(calls[0].body), {secret: 'test-secret-not-real', response: 'token-1', remoteip: '1.2.3.4'});
  await verifyHuman('token-1', 'unknown', {fetcher, env});
  assert.equal(calls[1].body.has('remoteip'), false);
});

test('missing, oversized or refused tokens fail', async () => {
  const {calls, fetcher} = cloudflare({success: false, 'error-codes': ['invalid-input-response']});
  for (const token of [undefined, '', 42, 'x'.repeat(2049)]) assert.equal(await verifyHuman(token, 'ip', {fetcher, env}), false);
  assert.equal(calls.length, 0);
  assert.equal(await verifyHuman('forged', 'ip', {fetcher, env}), false);
});

test('Cloudflare unreachable, timing out, failing or not answering JSON lets the lead through', async () => {
  for (const answer of [new Error('down'), new DOMException('timed out', 'TimeoutError'), new Response('busy', {status: 503}), new Response('<html>')]) {
    const {fetcher} = cloudflare(answer);
    assert.equal(await verifyHuman('token-1', 'ip', {fetcher, env}), true);
  }
});

const origin = 'https://go.howardsdraperies.com';
const lead = {website: '', firstName: 'Jane', lastName: 'Doe', phone: '(303) 555-0100', email: 'jane@example.com', elapsedMs: 20000, smsTransactional: false, smsMarketing: false};
const post = handle => handle(new Request(`${origin}/api/consultation`, {
  method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'},
  body: JSON.stringify({...lead, [TOKEN_FIELD]: 'token-1'}),
}), {ip: '203.0.113.7'});

test('a refused check never reaches GHL and tells the visitor to call', async () => {
  const seen = [];
  const response = await post(createConsultationHandler(async data => { seen.push(data); return {status: 200, body: {success: true}}; }, () => false, async () => false));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.error, /call \(303\) 449-4337/);
  assert.equal(seen.length, 0);
});

test('an accepted check passes the lead on without the token', async () => {
  const seen = [];
  const checked = [];
  const handle = createConsultationHandler(async data => { seen.push(data); return {status: 200, body: {success: true}}; }, () => false,
    async (token, ip) => { checked.push([token, ip]); return true; });
  assert.equal((await post(handle)).status, 200);
  assert.deepEqual(checked, [['token-1', '203.0.113.7']]);
  assert.deepEqual(seen, [lead]);
});

test('form.js sends the token with the lead, asks for a tick when needed, and resets after a send', () => {
  assert.match(clientSource, /const human = humanCheck\(form\);/);
  assert.match(clientSource, /payload\['cf-turnstile-response'\] = token;/);
  assert.match(clientSource, /if \(token === null\) throw new Error\('Please tick the box/);
  assert.match(clientSource, /if \(attempted\) human\.reset\(\);/);
});

// Runs the page script's humanCheck() on its own, against a stub page and a stub Turnstile.
function loadHumanCheck({hostname = 'example.netlify.app', turnstile, scriptFails = false} = {}) {
  const start = clientSource.indexOf('const TURNSTILE_LIVE_HOSTS');
  const end = clientSource.indexOf('\n}\n', clientSource.indexOf('function humanCheck(')) + 3;
  const clock = {now: 1000};
  const scripts = [];
  const window = {location: {hostname}};
  const context = {
    window, location: window.location,
    document: {
      createElement: () => ({}),
      head: {append: script => {
        scripts.push(script.src);
        queueMicrotask(() => { if (scriptFails) script.onerror(); else { window.turnstile = turnstile; window.onTurnstileLoad(); } });
      }},
    },
    form: {querySelector: () => ({before() {}})},
    // humanCheck's own waits (the 8-second wait for a token) run instantly here.
    setTimeout: callback => setImmediate(callback),
    Date: {now: () => clock.now},
  };
  vm.runInNewContext(`${clientSource.slice(start, end)}\nthis.siteKey = TURNSTILE_SITE_KEY; this.check = humanCheck(form);`, context);
  return {check: context.check, siteKey: context.siteKey, scripts, clock};
}

// A stub widget that issues token-1, token-2, ... and counts resets; each reset issues the next token.
function stubWidget({expired = false, token = 'token-1', tick = false} = {}) {
  const state = {resets: 0, options: null, token, expired};
  state.turnstile = {
    render: (container, options) => {
      state.options = options;
      if (tick) options['before-interactive-callback']();
      else options.callback(state.token);
      return 'w1';
    },
    getResponse: () => state.token,
    isExpired: () => state.expired,
    reset: () => { state.resets++; state.expired = false; state.token = `token-${state.resets + 1}`; state.options.callback(state.token); },
  };
  return state;
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('the widget uses the live key only on the live hosts, invisible unless Cloudflare wants a tick', async () => {
  for (const hostname of LIVE_HOSTS) assert.equal(loadHumanCheck({hostname, turnstile: stubWidget().turnstile}).siteKey, LIVE_SITE_KEY, hostname);
  for (const hostname of ['localhost', '127.0.0.1', 'deploy-preview-9--example.netlify.app', `${LIVE_HOSTS[0]}.evil.example`]) {
    assert.equal(loadHumanCheck({hostname, turnstile: stubWidget().turnstile}).siteKey, '1x00000000000000000000AA', hostname);
  }
  const widget = stubWidget();
  const {check, scripts} = loadHumanCheck({hostname: LIVE_HOSTS[0], turnstile: widget.turnstile});
  await settle();
  assert.deepEqual(scripts, ['https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad']);
  assert.equal(widget.options.size, 'flexible');
  assert.equal(widget.options.appearance, 'interaction-only');
  assert.equal(widget.options['refresh-expired'], 'auto');
  assert.equal(await check.token(), 'token-1');
  check.reset();
  assert.equal(widget.resets, 1);
});

test('a script that fails to load gives an empty token, so the lead still goes to the server', async () => {
  const {check} = loadHumanCheck({scriptFails: true});
  await settle();
  assert.equal(await check.token(), '');
});

test('while Cloudflare is asking for a tick there is no token to send', async () => {
  const widget = stubWidget({tick: true, token: ''});
  const {check} = loadHumanCheck({turnstile: widget.turnstile});
  await settle();
  assert.equal(await check.token(), null);
});

test('an expired token, or one older than 270 s, is swapped for a fresh one; a newer one is kept', async () => {
  const expired = stubWidget({expired: true});
  let loaded = loadHumanCheck({turnstile: expired.turnstile});
  await settle();
  assert.equal(await loaded.check.token(), 'token-2');
  assert.equal(expired.resets, 1);
  for (const [age, expected] of [[271000, 'token-2'], [200000, 'token-1']]) {
    const widget = stubWidget();
    loaded = loadHumanCheck({turnstile: widget.turnstile});
    await settle();
    loaded.clock.now += age;
    assert.equal(await loaded.check.token(), expected, `age ${age}`);
  }
});
