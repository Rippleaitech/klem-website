import { ready, json, sameOrigin, body, passwordOK, sign, admin } from '../../replay/server.mjs';
export default async req => {
  if (!ready()) return json({ error: 'Dashboard setup is not complete. Configure the two private hosting settings.' }, 503);
  if (req.method === 'GET') return json({ authenticated: !!admin(req) });
  if (req.method !== 'POST' || !sameOrigin(req)) return json({ error: 'Forbidden' }, 403);
  try {
    const b = await body(req, 2000);
    const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
    if (b.logout) return json({ ok: true }, 200, { 'Set-Cookie': `klem_replay_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}` });
    if (!passwordOK(b.password)) return json({ error: 'Incorrect password' }, 401);
    const token = sign({ kind: 'admin', exp: Date.now() + 8 * 3600000 });
    return json({ ok: true }, 200, { 'Set-Cookie': `klem_replay_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}` });
  } catch { return json({ error: 'Unable to sign in' }, 400); }
};
export const config = { path: '/api/replay/auth', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 10 } };
