import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, scryptSync } from 'node:crypto';
import { memoryDatabase } from '../scripts/memory-store.mjs';
import { sign, verify, admin, passwordOK, start, collect, detail, summaries, cleanup, erase, RETENTION } from '../replay/server.mjs';
import { sanitizeEvents, attribution } from '../replay/shared.mjs';
import auth from '../netlify/functions/replay-auth.mjs';
import { createHandler as adminHandler } from '../netlify/functions/replay-admin.mjs';
import { createHandler as startHandler } from '../netlify/functions/replay-start.mjs';
const salt = 'abcd'.repeat(8), password = 'a-test-password-only';
process.env.REPLAY_ADMIN_HASH = salt + ':' + scryptSync(password, salt, 64).toString('hex');
process.env.REPLAY_SECRET = 'test-secret'.repeat(8);
process.env.CONTEXT = 'production';
const origin = 'https://klem.co.il';
const request = (path, data, headers = {}) => new Request(origin + path, { method: data ? 'POST' : 'GET', headers: { origin, 'content-type': 'application/json', ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
async function fixture(now = Date.now()) {
  const db = memoryDatabase();
  const res = await start(request('/api/replay/start', { visitorId: randomUUID(), consent: true, consentReceipt: { version: 2, decidedAt: now, expires: now + RETENTION, choices: { replay: true } }, source: 'openai', campaign: 'buildings', landing: '/services?email=secret@example.com', device: 'mobile' }), db, now);
  return { db, session: await res.json(), now };
}
const batch = (f, overrides = {}) => ({ token: f.session.token, pageId: randomUUID(), sequence: 0, path: '/services?secret=123', events: [{ type: 4, timestamp: f.now, data: { href: origin + '/services?oppref=secret', width: 390, height: 800 } }, { type: 2, timestamp: f.now + 1, data: { node: { type: 0, id: 1, childNodes: [] }, initialOffset: { top: 0, left: 0 } } }], actions: [{ name: 'page_view', at: f.now }], ...overrides });
test('admin password, signed cookies and authentication boundaries', async () => {
  assert.equal(passwordOK('wrong'), false); assert.equal(passwordOK(password), true);
  assert.equal(verify(sign({ kind: 'record', exp: Date.now() + 1000 }), 'admin'), null);
  const token = sign({ kind: 'admin', exp: Date.now() + 10000 });
  assert.equal(verify(token + 'bad', 'admin'), null);
  assert.equal(verify(sign({ kind: 'admin', exp: 1 }), 'admin'), null);
  const db = memoryDatabase(); assert.equal((await adminHandler(() => db)(request('/api/replay/admin?date=2026-10-10'))).status, 401);
  assert.equal((await auth(request('/api/replay/auth', { password }, { origin: 'https://attacker.example' }))).status, 403);
  const login = await auth(request('/api/replay/auth', { password }));
  assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
  assert.ok(admin(request('/api/replay/admin', null, { cookie })));
});
test('no start without consent; wrong origins and unconfigured server fail closed', async () => {
  const db = memoryDatabase();
  assert.equal((await start(request('/api/replay/start', { visitorId: randomUUID() }), db)).status, 400);
  assert.equal((await startHandler(() => db)(request('/api/replay/start', { consent: true }, { origin: 'https://other.example' }))).status, 403);
  const secret = process.env.REPLAY_SECRET; delete process.env.REPLAY_SECRET;
  assert.equal((await startHandler(() => db)(request('/api/replay/start', {}))).status, 503);
  process.env.REPLAY_SECRET = secret;
  assert.equal(db.sessions.data.size, 0);
});
test('attribution keeps campaign names but removes full referrers and click references', () => {
  assert.deepEqual(attribution(origin + '/services?utm_source=openai&utm_medium=cpc&utm_campaign=buildings&oppref=secret', 'https://example.com/private?email=user'), { source: 'openai', medium: 'cpc', campaign: 'buildings', referrer: 'example.com', landing: '/services' });
  assert.equal(attribution(origin + '/?utm_source=someone@example.com').source, 'direct / unknown');
});
test('recordings redact URLs and form fields at server boundary', () => {
  const input = [{ type: 4, timestamp: 1, data: { href: origin + '/?oppref=secret#private' } }, { type: 3, timestamp: 2, data: { source: 5, text: 'my private message' } }, { type: 2, timestamp: 3, data: { node: { tagName: 'input', attributes: { value: 'secret name', 'data-email': 'private@example.com', onclick: 'steal()', src: 'https://evil.example/collect', class: 'input' } } } }, { type: 6, timestamp: 4, data: { payload: 'plugin secret' } }];
  const output = JSON.stringify(sanitizeEvents(input));
  for (const secret of ['oppref', 'private', 'secret name', 'steal()', 'evil.example', 'plugin secret']) assert.equal(output.includes(secret), false, secret);
  assert.match(output, /\*\*\*/);
});
test('retries are idempotent; separate pages survive out-of-order uploads', async () => {
  const f = await fixture(); const b = batch(f);
  assert.equal((await collect(request('/api/replay/collect', b), f.db, f.now + 100)).status, 200);
  await collect(request('/api/replay/collect', b), f.db, f.now + 100);
  await collect(request('/api/replay/collect', batch(f, { actions: [{ name: 'lead_submitted', at: f.now + 5 }] })), f.db, f.now + 100);
  assert.equal(f.db.chunks.data.size, 2);
  const d = await detail(f.db, f.session.key, f.now + 100);
  assert.equal(d.pages.length, 2); assert.ok(d.pages.some(p => p.actions.some(a => a.name === 'lead_submitted')));
  assert.equal(JSON.stringify(d).includes('secret='), false);
});
test('tampered, expired, oversized and malformed uploads are rejected', async () => {
  const f = await fixture();
  assert.equal((await collect(request('/api/replay/collect', batch(f, { token: f.session.token + 'x' })), f.db)).status, 400);
  assert.equal((await collect(request('/api/replay/collect', batch(f, { sequence: 999 })), f.db)).status, 400);
  assert.equal((await collect(request('/api/replay/collect', batch(f)), f.db, f.now + 3 * 3600000)).status, 400);
  await assert.rejects(collect(request('/api/replay/collect', { ...batch(f), padding: 'x'.repeat(256001) }), f.db));
  assert.equal(f.db.chunks.data.size, 0);
});
test('deletion blocks old upload tokens; expired sessions cannot be viewed and are purged', async () => {
  const f = await fixture(); await collect(request('/api/replay/collect', batch(f)), f.db, f.now + 100);
  await erase(f.db, f.session.key);
  assert.equal(await detail(f.db, f.session.key), null);
  assert.equal((await collect(request('/api/replay/collect', batch(f)), f.db)).status, 410);
  assert.equal(f.db.chunks.data.size, 0);
  const older = await fixture(Date.now() - RETENTION - 1000);
  assert.equal(await detail(older.db, older.session.key), null);
  await cleanup(older.db); assert.equal(older.db.sessions.data.size, 0);
});
test('Israel date includes visits before UTC midnight and excludes next-day visits', async () => {
  const now = Date.parse('2026-10-09T22:30:00Z'); const f = await fixture(now);
  await collect(request('/api/replay/collect', batch(f)), f.db, now + 100);
  const day = await summaries(f.db, '2026-10-10', now + 100);
  assert.equal(day.sessions.length, 1); assert.equal(day.sessions[0].pages, 1);
  assert.equal((await summaries(f.db, '2026-10-09', now + 100)).sessions.length, 0);
});
test('preview data is isolated using trusted Netlify deployment context', async () => {
  const { storeNamespace } = await import('../replay/server.mjs');
  assert.equal(storeNamespace({ deploy: { context: 'production' } }), 'production');
  assert.equal(storeNamespace({ deploy: { context: 'deploy-preview' } }), 'preview');
  assert.throws(() => storeNamespace());
  const db = memoryDatabase(); db.production = false;
  const response = await start(request('/api/replay/start', { consent: true, consentReceipt: { version: 2, decidedAt: Date.now(), expires: Date.now() + RETENTION - 1000, choices: { replay: true } }, visitorId: randomUUID(), test: false }), db);
  const s = await response.json(); assert.equal((await db.sessions.get(s.key)).test, true);
});
test('privacy filtering preserves rrweb mutation arrays and safe visual updates', () => {
  const events = [{ type: 3, timestamp: 10, data: { source: 0, texts: [], removes: [], adds: [], attributes: [{ id: 12, attributes: { class: 'visible', style: 'opacity: 1', value: 'PRIVATE', href: origin + '/faq?email=PRIVATE' } }] } }];
  const twice = sanitizeEvents(sanitizeEvents(events));
  assert.ok(Array.isArray(twice[0].data.attributes));
  assert.equal(twice[0].data.attributes[0].attributes.class, 'visible');
  assert.equal(twice[0].data.attributes[0].attributes.style, 'opacity: 1');
  assert.equal(twice[0].data.attributes[0].attributes.href, origin + '/faq');
  assert.equal(JSON.stringify(twice).includes('PRIVATE'), false);
});

test('replay requires an unexpired versioned consent receipt and stores evidence', async () => {
  const db = memoryDatabase(), now = Date.now();
  for (const consentReceipt of [undefined, {version:2,decidedAt:now,expires:now-1,choices:{replay:true}}, {version:2,decidedAt:now,expires:now+1000,choices:{replay:false}}]) {
    assert.equal((await start(request('/api/replay/start', {visitorId:randomUUID(),consent:true,consentReceipt}),db,now)).status,400);
  }
  const f = await fixture(now);
  const saved = await f.db.sessions.get(f.session.key,{type:'json'});
  assert.equal(saved.consentReceipt.version,2);
  assert.equal(saved.consentReceipt.replay,true);
  assert.equal(saved.consentReceipt.receivedAt,now);
});
