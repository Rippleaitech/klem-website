// Local-only preview. Data is held in memory and disappears when this process exits.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { memoryDatabase } from './memory-store.mjs';
import { createHandler as makeStart } from '../netlify/functions/replay-start.mjs';
import { createHandler as makeCollect } from '../netlify/functions/replay-collect.mjs';
import { createHandler as makeAdmin } from '../netlify/functions/replay-admin.mjs';
import auth from '../netlify/functions/replay-auth.mjs';
const salt = randomBytes(16).toString('hex');
process.env.REPLAY_SECRET = randomBytes(32).toString('hex');
process.env.REPLAY_ADMIN_HASH = salt + ':' + scryptSync('local-preview-only', salt, 64).toString('hex');
process.env.CONTEXT = 'dev';
const db = memoryDatabase(), root = resolve('dist');
db.production = false;
const configText = await readFile('netlify.toml', 'utf8');
const csp = configText.match(/Content-Security-Policy = "([^"]+)"/)[1];
const handlers = { '/api/replay/start': makeStart(() => db), '/api/replay/collect': makeCollect(() => db), '/api/replay/admin': makeAdmin(() => db), '/api/replay/auth': auth };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8888');
    if (handlers[url.pathname]) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Buffer.concat(chunks) } : {}) });
      const response = await handlers[url.pathname](request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (req.method === 'POST' && url.pathname === '/') { res.writeHead(200); res.end('Local test accepted (not a real enquiry)'); return; }
    let filename = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!filename.startsWith(root + '/') && filename !== root) throw Error();
    try { if ((await stat(filename)).isDirectory()) filename += '/index.html'; } catch { if (!extname(filename)) filename += '.html'; }
    res.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...(url.pathname.startsWith('/visitors') ? { 'Content-Security-Policy': csp } : {}) }); res.end(await readFile(filename));
  } catch { if (!res.headersSent) res.writeHead(404); res.end('Not found'); }
}).listen(8888, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:8888/?klem_replay_test=1\nDashboard: http://127.0.0.1:8888/visitors/\nLocal-only password: local-preview-only'));
