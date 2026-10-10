import { ready, json, sameOrigin, stores, start } from '../../replay/server.mjs';
export const createHandler = (database = stores) => async (req, context) => {
  if (req.method === 'GET') return json({ enabled: ready() });
  if (req.method !== 'POST' || !sameOrigin(req)) return json({ error: 'Forbidden' }, 403);
  if (!ready()) return json({ error: 'Recording is not configured' }, 503);
  try { return await start(req, database(context)); } catch { return json({ error: 'Unable to start recording' }, 400); }
};
export default createHandler();
export const config = { path: '/api/replay/start', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 30 } };
