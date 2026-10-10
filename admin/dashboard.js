import Player from 'rrweb-player';
const $ = id => document.getElementById(id);
const time = n => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(n);
const labels = { page_view: 'Page opened', form_start: 'Started enquiry form', form_error: 'Form needs correction', lead_submitted: 'Enquiry submitted successfully', whatsapp_click: 'Clicked WhatsApp', phone_click: 'Clicked phone number', email_click: 'Clicked email', recording_stopped: 'Recording reached its time limit' };
let visits = [], selected, player, requestID = 0, playbackWidth = 0;
$('date').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function api(path, payload) {
  const res = await fetch('/api/replay/' + path, payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {});
  const data = await res.json();
  if (!res.ok) { if (res.status === 401 && !path.startsWith('auth')) showLogin(); throw new Error(data.error || 'Something went wrong'); }
  return data;
}
function status(message = '') { $('status').textContent = message; }
function showLogin() { $('login').hidden = false; $('workspace').hidden = true; $('logout').hidden = true; close(); visits = []; $('rows').replaceChildren(); }
async function showWorkspace() { $('login').hidden = true; $('workspace').hidden = false; $('logout').hidden = false; await load(); }
function node(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
function duration(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? s + ' sec' : Math.floor(s / 60) + 'm ' + s % 60 + 's'; }
function draw() {
  const filtered = visits.filter(v => ($('tests').checked || !v.test) && (!$('source').value || v.source === $('source').value));
  $('count').textContent = filtered.length;
  $('contacts').textContent = filtered.filter(v => v.actions.some(a => a.name.endsWith('_click'))).length;
  $('leads').textContent = filtered.filter(v => v.actions.some(a => a.name === 'lead_submitted')).length;
  $('rows').replaceChildren(); $('empty').hidden = filtered.length > 0; $('table').hidden = !filtered.length;
  for (const v of filtered) {
    const tr = document.createElement('tr'), first = document.createElement('td');
    first.append(node('strong', time(v.started)), node('small', `Visitor ${v.visitorId} · ${v.device}`)); if (v.test) first.append(node('span', 'Test visit', 'pill test'));
    const source = document.createElement('td'); source.append(node('strong', v.source), node('small', [v.medium, v.campaign].filter(Boolean).join(' · ') || 'No campaign reported'));
    const journey = document.createElement('td'); journey.append(node('span', `${v.pages} page${v.pages === 1 ? '' : 's'} · ${duration(v.last - v.started)}`), node('small', v.landing));
    const contact = document.createElement('td'), names = [...new Set(v.actions.filter(a => a.name !== 'page_view').map(a => labels[a.name]))]; contact.append(node('span', names.join(' · ') || 'No contact action recorded'));
    const open = document.createElement('td'), button = node('button', 'Watch visit →'); button.addEventListener('click', () => watch(v.key)); open.append(button); tr.append(first, source, journey, contact, open); $('rows').append(tr);
  }
}
async function load() {
  const id = ++requestID; status(); $('refresh').disabled = true; close();
  try {
    const data = await api('admin?date=' + encodeURIComponent($('date').value)); if (id !== requestID) return;
    visits = data.sessions;
    const old = $('source').value; $('source').replaceChildren(new Option('All sources', ''));
    for (const source of [...new Set(visits.map(v => v.source))].sort()) $('source').add(new Option(source, source));
    if ([...$('source').options].some(o => o.value === old)) $('source').value = old;
    draw(); if (data.truncated) status('This date contains more than 200 visits. The list is partial.');
  } catch (e) { status(e.message); } finally { $('refresh').disabled = false; }
}
function close() { player?.$destroy(); player = null; selected = null; $('player').replaceChildren(); $('detail').hidden = true; }
async function watch(key) {
  status(); close();
  try {
    selected = await api('admin?key=' + encodeURIComponent(key));
    const s = selected.session; $('detail').hidden = false;
    $('detail-title').textContent = `${time(s.started)} · ${s.source}`;
    $('detail-meta').textContent = `${s.device} · ${s.campaign || 'No campaign'} · Enquiry reference: ${s.id}`;
    $('pages').replaceChildren(); selected.pages.forEach((p,i) => $('pages').add(new Option(`${i + 1}. ${p.path}`, String(i))));
    $('timeline').replaceChildren();
    const actions = selected.pages.flatMap(p => p.actions.map(a => ({ ...a, path: p.path }))).sort((a,b) => a.at - b.at);
    for (const a of actions) { const li = node('li', `${labels[a.name] || a.name} · ${a.path}`); li.prepend(node('time', time(a.at))); $('timeline').append(li); }
    if (!actions.length) $('timeline').append(node('li', 'No actions uploaded yet.'));
    play(); $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { status(e.message); }
}
function play() {
  player?.$destroy(); player = null; $('player').replaceChildren();
  const page = selected?.pages[Number($('pages').value)];
  if (!page || !page.events.some(e => e.type === 2)) { $('replay-note').textContent = 'The page snapshot has not arrived. Refresh later; this visit may be incomplete.'; return; }
  $('replay-note').textContent = page.incomplete || selected.incomplete ? 'Some recording batches are missing. Playback may have gaps.' : 'Personal form contents are masked. Playback shows activity within this page.';
  const width = Math.max(240, $('player').clientWidth - 2); playbackWidth = width;
  try { player = new Player({ target: $('player'), props: { events: page.events, width, height: Math.round(width * .66), autoPlay: false, skipInactive: true, showController: true, speedOption: [1, 2, 4, 8] } });
    const controls = $('player').querySelectorAll('.rr-controller__btns > button');
    controls[0]?.setAttribute('aria-label', 'Play or pause recording');
    controls[controls.length - 1]?.setAttribute('aria-label', 'Toggle full screen');
  } catch { $('replay-note').textContent = 'This recording could not be played. Its contact timeline is still available.'; }
}
$('login-form').addEventListener('submit', async e => { e.preventDefault(); status(); const btn = e.target.querySelector('button'); btn.disabled = true; try { await api('auth', { password: $('password').value }); $('password').value = ''; await showWorkspace(); } catch (e) { status(e.message); } finally { btn.disabled = false; } });
$('logout').addEventListener('click', async () => { try { await api('auth', { logout: true }); showLogin(); status(); } catch (e) { status(e.message); } });
$('refresh').addEventListener('click', load); $('date').addEventListener('change', load); $('source').addEventListener('change', draw); $('tests').addEventListener('change', draw); $('close').addEventListener('click', close); $('pages').addEventListener('change', play);
$('delete').addEventListener('click', async () => { if (!selected || !confirm('Permanently delete this visit and its recordings?')) return; try { await api('admin', { action: 'delete', key: selected.session.key }); await load(); } catch (e) { status(e.message); } });
try { const auth = await api('auth'); if (auth.authenticated) await showWorkspace(); } catch (e) { status(e.message); }

new ResizeObserver(() => { const width = Math.max(240, $('player').clientWidth - 2); if (player && width !== playbackWidth) { playbackWidth = width; player.$set({ width, height: Math.round(width * .66) }); } }).observe($('player'));
