import { record } from 'rrweb';
import { attribution, pagePath, sanitizeEvents } from './shared.mjs';
const SESSION = 'klem_replay_session', VISITOR = 'klem_replay_visitor';
export async function startRecording({ testMode = false, permitted, consentReceipt }) {
  if (!permitted()) return;
  let visitor, previous;
  try { visitor = JSON.parse(localStorage.getItem(VISITOR)); previous = JSON.parse(sessionStorage.getItem(SESSION)); } catch {}
  if (!visitor || visitor.expires <= Date.now()) visitor = { id: crypto.randomUUID(), expires: Date.now() + 30 * 86400000 };
  if (!previous || previous.last < Date.now() - 30 * 60000) previous = null;
  const source = attribution(location.href, document.referrer);
  const test = testMode || source.source === 'qa' || source.medium === 'test' || /test|validation/i.test(source.campaign);
  const response = await fetch('/api/replay/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...source, visitorId: visitor.id, consent: true, consentReceipt, token: previous?.token, test, device: /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop' }) });
  if (!response.ok || !permitted()) return;
  const session = await response.json();
  if (!permitted()) return;
  try { localStorage.setItem(VISITOR, JSON.stringify(visitor)); sessionStorage.setItem(SESSION, JSON.stringify({ ...session, last: Date.now() })); } catch {}
  const reference = document.querySelector('[name="replay-session"]'); if (reference) reference.value = session.id;
  const pageId = crypto.randomUUID(), path = pagePath(location.href), started = Date.now();
  let queue = [], size = 0, sequence = 0, actions = [{ name: 'page_view', at: started }], stopped = false, busy = false, stopRecord, failures = 0;
  const pending = [];
  const listeners = [];
  const on = (el, name, fn) => { el.addEventListener(name, fn); listeners.push(() => el.removeEventListener(name, fn)); };
  const action = name => { if (!stopped && permitted()) actions.push({ name, at: Date.now() }); };
  function batch() {
    if ((!queue.length && !actions.length) || sequence >= 240) return;
    pending.push(JSON.stringify({ token: session.token, pageId, path, sequence: sequence++, events: queue, actions }));
    queue = []; size = 0; actions = [];
    if (pending.length > 8) shutdown();
  }
  async function flush() {
    if (stopped || !permitted() || busy) return;
    batch(); if (!pending.length) return;
    busy = true;
    try {
      const res = await fetch('/api/replay/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending[0] });
      if (res.ok) { pending.shift(); failures = 0; }
      else if ([400, 403, 410, 503].includes(res.status)) shutdown();
      else failures++;
    } catch { failures++; }
    finally { busy = false; }
    if (failures >= 5) shutdown();
  }
  function shutdown() {
    if (stopped) return;
    stopped = true; stopRecord?.(); clearInterval(timer); clearTimeout(expiry); listeners.forEach(off => off()); queue = []; actions = []; pending.length = 0;
    if (reference) reference.value = '';
  }
  const timer = setInterval(() => { if (!permitted()) return shutdown(); flush(); }, 10000);
  const expiry = setTimeout(() => { action('recording_stopped'); flush().finally(shutdown); }, 15 * 60000);
  try {
    stopRecord = record({
      emit(event) {
        if (stopped || !permitted()) return;
        try {
          const clean = sanitizeEvents([event])[0]; if (!clean) return;
          const bytes = new TextEncoder().encode(JSON.stringify(clean)).length;
          if (bytes > 220000) return shutdown();
          if (size + bytes > 42000) batch();
          queue.push(clean); size += bytes;
          if (size > 42000) flush();
          if (sequence >= 240) shutdown();
          try { sessionStorage.setItem(SESSION, JSON.stringify({ ...session, last: Date.now() })); } catch {}
        } catch { shutdown(); }
      },
      maskAllInputs: true,
      maskTextSelector: '[contenteditable], [data-private], .form-status',
      blockSelector: 'iframe, video, canvas, .rr-block, [data-replay-block]',
      inlineStylesheet: false,
      collectFonts: false,
      recordCanvas: false,
      recordCrossOriginIframes: false,
      sampling: { mousemove: 150, scroll: 200, input: 'last' },
    });
  } catch { shutdown(); return; }
  let formStarted = false;
  on(document, 'input', e => { if (!formStarted && e.target.closest?.('.contact-form')) { formStarted = true; action('form_start'); } });
  on(document, 'submit', e => { if (e.target.matches?.('.contact-form')) queueMicrotask(() => { if (e.target.querySelector('[aria-invalid="true"]')) action('form_error'); }); });
  on(document, 'klem:lead-submitted', () => { action('lead_submitted'); flush(); });
  on(document, 'click', e => {
    const link = e.target.closest?.('a[href]'); if (!link) return;
    try { const u = new URL(link.href); if (u.protocol === 'tel:') action('phone_click'); else if (u.protocol === 'mailto:') action('email_click'); else if (['wa.me', 'api.whatsapp.com'].includes(u.hostname)) action('whatsapp_click'); } catch {}
  });
  function leave() {
    if (stopped || !permitted()) return;
    batch();
    // Retry the same immutable batch if an in-flight fetch was interrupted.
    for (const payload of pending) if (new Blob([payload]).size < 60000) navigator.sendBeacon('/api/replay/collect', new Blob([payload], { type: 'application/json' }));
  }
  on(document, 'visibilitychange', () => { if (document.hidden) leave(); });
  on(window, 'pagehide', leave);
  flush();
  return shutdown;
}
