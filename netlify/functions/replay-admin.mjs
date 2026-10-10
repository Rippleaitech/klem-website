import { admin, json, sameOrigin, stores, summaries, detail, erase, body } from '../../replay/server.mjs';
export const createHandler = (database = stores) => async (req, context) => {
  if (!admin(req)) return json({ error: 'Please sign in' }, 401);
  const url = new URL(req.url), db = database(context);
  try {
    if (req.method === 'GET') {
      const key = url.searchParams.get('key');
      if (key) { const data = await detail(db, key); return data ? json(data) : json({ error: 'Visit expired or was deleted' }, 404); }
      const date = url.searchParams.get('date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return json({ error: 'Choose a date' }, 400);
      return json(await summaries(db, date));
    }
    if (req.method === 'POST' && sameOrigin(req)) {
      const b = await body(req, 2000);
      if (b.action !== 'delete' || !/^\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}$/.test(b.key)) return json({ error: 'Invalid request' }, 400);
      await erase(db, b.key); return json({ ok: true });
    }
    return json({ error: 'Forbidden' }, 403);
  } catch { return json({ error: 'Unable to load recordings. Please try again.' }, 500); }
};
export default createHandler();
export const config = { path: '/api/replay/admin', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 60 } };
