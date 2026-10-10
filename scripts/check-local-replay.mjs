import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8888';
const login = await fetch(origin + '/api/replay/auth', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'local-preview-only' }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
const list = await (await fetch(origin + '/api/replay/admin?date=' + date, { headers: { cookie } })).json();
assert.ok(list.sessions.length);
let pages = 0, events = 0, leads = 0;
for (const s of list.sessions) {
  const detail = await (await fetch(origin + '/api/replay/admin?key=' + encodeURIComponent(s.key), { headers: { cookie } })).json();
  const text = JSON.stringify(detail);
  for (const value of ['PRIVATE-TEXT-MUST-NOT-APPEAR', 'replay-test@example.com', 'Replay privacy check', '0000000000']) assert.equal(text.includes(value), false, 'Leaked test field: ' + value);
  pages += detail.pages.length; events += detail.pages.reduce((n,p) => n + p.events.length, 0); leads += detail.pages.flatMap(p => p.actions).filter(a => a.name === 'lead_submitted').length;
}
console.log(JSON.stringify({ visits: list.sessions.length, pages, events, leads, formTextMasked: true }));
