import { createHmac, timingSafeEqual, scryptSync, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { ACTIONS, label, pagePath, sanitizeEvents } from './shared.mjs';
export const DAY = 86400000;
export const RETENTION = 30 * DAY;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const validID = x => typeof x === 'string' && UUID.test(x);
export function env(key) { return process.env[key] || ''; }
export function ready() { return env('REPLAY_SECRET').length >= 32 && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(env('REPLAY_ADMIN_HASH')); }
export function storeNamespace(context) {
  if (!context?.deploy?.context) throw new Error('Missing trusted deployment context');
  return context.deploy.context === 'production' ? 'production' : 'preview';
}
export function stores(context) {
  const suffix = storeNamespace(context);
  return { production: suffix === 'production', sessions: getStore({ name: `replay-sessions-${suffix}`, consistency: 'strong' }), chunks: getStore({ name: `replay-chunks-${suffix}`, consistency: 'strong' }) };
}
export function json(data, status = 200, extra = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } }); }
export function sameOrigin(req) { return req.headers.get('origin') === new URL(req.url).origin; }
export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + createHmac('sha256', env('REPLAY_SECRET')).update(body).digest('base64url');
}
export function verify(token, kind, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048 || !ready()) return null;
  const [body, mac, extra] = token.split('.'); if (!body || !mac || extra || !/^[A-Za-z0-9_-]{43}$/.test(mac)) return null;
  const expected = createHmac('sha256', env('REPLAY_SECRET')).update(body).digest('base64url');
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try { const data = JSON.parse(Buffer.from(body, 'base64url')); return data.kind === kind && data.exp > now ? data : null; } catch { return null; }
}
export function admin(req) {
  const token = (req.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('klem_replay_admin='))?.slice(18);
  return verify(token, 'admin');
}
export function passwordOK(password) {
  if (!ready() || typeof password !== 'string' || password.length > 256) return false;
  const [salt, hash] = env('REPLAY_ADMIN_HASH').split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
export async function body(req, limit = 256000) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new Error('Expected JSON');
  if (Number(req.headers.get('content-length') || 0) > limit) throw new Error('Request too large');
  const reader = req.body?.getReader(); if (!reader) throw new Error('Missing body');
  let size = 0; const parts = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new Error('Request too large'); } parts.push(Buffer.from(value)); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export function sessionKey(id, started) { return new Date(started).toISOString().slice(0, 10) + '/' + id; }
export async function list(store, prefix, limit = 1000) {
  const all = []; let truncated = false;
  for await (const page of store.list({ prefix, paginate: true })) {
    for (const blob of page.blobs) { if (all.length === limit) { truncated = true; break; } all.push(blob); }
    if (truncated) break;
  }
  return { blobs: all, truncated };
}
export async function start(req, db, now = Date.now()) {
  const b = await body(req, 6000);
  if (b.consent !== true || !validID(b.visitorId)) return json({ error: 'Consent and anonymous ID required' }, 400);
  const receipt = b.consentReceipt;
  if (!receipt || receipt.version !== 2 || receipt.choices?.replay !== true ||
      !Number.isFinite(receipt.decidedAt) || receipt.decidedAt > now ||
      receipt.expires <= now || !Number.isFinite(receipt.expires) || receipt.expires > receipt.decidedAt + RETENTION) return json({ error: 'Invalid consent receipt' }, 400);
  const existing = verify(b.token, 'record', now);
  if (existing) { const saved = await db.sessions.get(existing.key, { type: 'json' }); if (saved && !saved.deleted && saved.expires > now) return json({ token: b.token, id: saved.id, key: existing.key }); }
  const today = new Date(now).toISOString().slice(0, 10);
  if ((await list(db.sessions, today + '/', 300)).blobs.length >= 300) return json({ error: 'Daily recording limit reached' }, 429);
  const id = randomUUID(), key = sessionKey(id, now);
  const metadata = { id, key, visitorId: b.visitorId, started: now, expires: now + RETENTION, source: label(b.source) || 'direct / unknown', medium: label(b.medium), campaign: label(b.campaign), referrer: typeof b.referrer === 'string' && /^[a-z0-9.-]{1,253}$/i.test(b.referrer) ? b.referrer : '', landing: pagePath(b.landing), device: ['mobile', 'tablet', 'desktop'].includes(b.device) ? b.device : 'unknown', test: b.test === true || db.production !== true, consentVersion: receipt?.version || 1, consentReceipt: receipt ? { version: 2, decidedAt: receipt.decidedAt, expires: receipt.expires, replay: true, receivedAt: now } : null };
  await db.sessions.setJSON(key, metadata, { metadata });
  return json({ id, key, token: sign({ kind: 'record', key, exp: now + 2 * 60 * 60000 }) }, 201);
}
export async function collect(req, db, now = Date.now()) {
  const b = await body(req);
  const token = verify(b.token, 'record', now);
  if (!token || !validID(b.pageId) || !Number.isInteger(b.sequence) || b.sequence < 0 || b.sequence >= 240 || !Array.isArray(b.events) || b.events.length > 1500 || !Array.isArray(b.actions) || b.actions.length > 40) return json({ error: 'Invalid recording batch' }, 400);
  const session = await db.sessions.get(token.key, { type: 'json' });
  if (!session || session.deleted || session.expires <= now) return json({ error: 'Session unavailable' }, 410);
  const existingChunks = await list(db.chunks, token.key + '/', 500);
  const incomingKey = `${token.key}/${b.pageId}/${String(b.sequence).padStart(3, '0')}`;
  if (existingChunks.blobs.length >= 500 && !existingChunks.blobs.some(x => x.key === incomingKey)) return json({ error: 'Recording limit reached' }, 410);
  const events = sanitizeEvents(b.events).filter(e => e.timestamp >= session.started - 60000 && e.timestamp <= now + 60000);
  const actions = b.actions.filter(a => ACTIONS.has(a.name) && Number.isFinite(a.at) && a.at >= session.started - 60000 && a.at <= now + 60000).map(a => ({ name: a.name, at: a.at }));
  const path = pagePath(b.path);
  const chunk = { pageId: b.pageId, sequence: b.sequence, path, events, actions };
  const key = `${token.key}/${b.pageId}/${String(b.sequence).padStart(3, '0')}`;
  // Immutable numbered batches make retries idempotent and avoid last-write-wins races.
  await db.chunks.setJSON(key, chunk, { onlyIfNew: true, metadata: { pageId: b.pageId, sequence: b.sequence, path, first: Math.min(now, ...events.map(e => e.timestamp), ...actions.map(a => a.at)), last: Math.max(session.started, ...events.map(e => e.timestamp), ...actions.map(a => a.at)), actions } });
  // Handle a deletion that raced an in-flight upload.
  const current = await db.sessions.get(token.key, { type: 'json' });
  if (!current || current.deleted) await db.chunks.delete(key);
  return json({ ok: true });
}
export async function summaries(db, date, now = Date.now()) {
  const previousDate = new Date(Date.parse(date + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
  const sessionLists = await Promise.all([list(db.sessions, previousDate + '/', 200), list(db.sessions, date + '/', 200)]);
  const sessions = { blobs: sessionLists.flatMap(x => x.blobs), truncated: sessionLists.some(x => x.truncated) };
  const result = [];
  const israelDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const item of sessions.blobs) {
    const s = await db.sessions.get(item.key, { type: 'json' });
    if (!s || s.deleted || s.expires <= now || israelDate.format(s.started) !== date) continue;
    if (result.length >= 200) { sessions.truncated = true; break; }
    const chunks = await list(db.chunks, s.key + '/', 1000);
    const batches = [];
    for (let i = 0; i < chunks.blobs.length; i += 20) {
      batches.push(...await Promise.all(chunks.blobs.slice(i, i + 20).map(c => db.chunks.getMetadata(c.key).then(r => r?.metadata))));
    }
    const actions = batches.filter(Boolean).flatMap(b => b.actions || []);
    result.push({ ...s, visitorId: s.visitorId.slice(0, 8), pages: new Set(batches.filter(Boolean).map(b => b.pageId)).size, last: batches.filter(Boolean).reduce((last,b) => Math.max(last,b.last || 0), s.started), actions: actions.sort((a, b) => a.at - b.at), incomplete: chunks.truncated });
  }
  return { sessions: result.sort((a, b) => b.started - a.started), truncated: sessions.truncated };
}
export async function detail(db, key, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}$/.test(key)) return null;
  const s = await db.sessions.get(key, { type: 'json' });
  if (!s || s.deleted || s.expires <= now) return null;
  const rows = await list(db.chunks, key + '/', 1000);
  const chunks = (await Promise.all(rows.blobs.map(c => db.chunks.get(c.key, { type: 'json' })))).filter(Boolean);
  const pages = new Map();
  for (const c of chunks) { if (!pages.has(c.pageId)) pages.set(c.pageId, { id: c.pageId, path: c.path, chunks: [] }); pages.get(c.pageId).chunks.push(c); }
  return { session: s, incomplete: rows.truncated, pages: [...pages.values()].map(p => {
    p.chunks.sort((a,b) => a.sequence - b.sequence);
    return { id: p.id, path: p.path, incomplete: p.chunks.some((c,i) => c.sequence !== i), events: p.chunks.flatMap(c => c.events).sort((a,b) => a.timestamp - b.timestamp), actions: p.chunks.flatMap(c => c.actions).sort((a,b) => a.at - b.at) };
  }).sort((a,b) => (a.events[0]?.timestamp || a.actions[0]?.at || 0) - (b.events[0]?.timestamp || b.actions[0]?.at || 0)) };
}
export async function erase(db, key) {
  const s = await db.sessions.get(key, { type: 'json' }); if (!s) return;
  // Tombstone first prevents active upload tokens from recreating a deleted visit.
  await db.sessions.setJSON(key, { ...s, deleted: true });
  const chunks = await list(db.chunks, key + '/', 2000);
  await Promise.all(chunks.blobs.map(b => db.chunks.delete(b.key)));
}
export async function cleanup(db, now = Date.now()) {
  let removed = 0;
  for await (const page of db.sessions.list({ paginate: true })) {
    for (const b of page.blobs) {
      const s = await db.sessions.get(b.key, { type: 'json' });
      if (s && (s.expires <= now || s.deleted)) { await erase(db, b.key); await db.sessions.delete(b.key); removed++; }
      if (removed >= 100) return { removed, more: true };
    }
  }
  return { removed, more: false };
}
