export const PUBLIC_ORIGIN = 'https://klem.co.il';
export const PAGES = new Set(['/', '/index', '/index.html', '/about', '/about.html', '/services', '/services.html', '/faq', '/faq.html', '/privacy', '/privacy.html', '/accessibility', '/accessibility.html', '/project-hadar', '/project-hadar.html', '/project-ariel-sharon', '/project-ariel-sharon.html', '/project-aloni-borochov', '/project-aloni-borochov.html']);
export const ACTIONS = new Set(['page_view', 'form_start', 'form_error', 'lead_submitted', 'whatsapp_click', 'phone_click', 'email_click', 'recording_stopped']);
export function pagePath(value) {
  try { const p = new URL(value, PUBLIC_ORIGIN).pathname.replace(/\/$/, '') || '/'; return PAGES.has(p) ? p : '/'; } catch { return '/'; }
}
export function label(value) { return typeof value === 'string' && /^[\p{L}\p{N}_. -]{1,100}$/u.test(value) ? value : ''; }
export function attribution(href, referrer = '') {
  const u = new URL(href, PUBLIC_ORIGIN);
  let host = ''; try { host = new URL(referrer).hostname; } catch {}
  const source = label(u.searchParams.get('utm_source')) || (u.searchParams.has('oppref') || u.searchParams.has('openai_click_id') ? 'openai' : host && !['klem.co.il', 'www.klem.co.il'].includes(host) ? host : 'direct / unknown');
  return { source, medium: label(u.searchParams.get('utm_medium')), campaign: label(u.searchParams.get('utm_campaign')), referrer: host, landing: pagePath(u.href) };
}
// URL query strings, fragments and opaque ad click references never enter replays.
export function safeURL(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const u = new URL(value, PUBLIC_ORIGIN);
    if (!['https:', 'http:'].includes(u.protocol)) return '';
    if (!['klem.co.il', 'www.klem.co.il', 'localhost', '127.0.0.1'].includes(u.hostname)) return '';
    if (PAGES.has(u.pathname.replace(/\/$/, '') || '/')) return PUBLIC_ORIGIN + pagePath(u.href);
    if (/^\/(images\/[^?#]+\.(png|jpe?g|svg|webp|gif)|style\.css|videos\/[^?#]+\.mp4)$/i.test(u.pathname)) return PUBLIC_ORIGIN + u.pathname;
  } catch {}
  return '';
}
export function sanitizeEvents(events) {
  let nodes = 0;
  function walk(v, depth = 0, parent = '') {
    if (++nodes > 160000 || depth > 100) throw new Error('Recording is too complex');
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(x => walk(x, depth + 1, parent));
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) continue;
      if (['href', 'src', 'action', 'poster'].includes(k)) { o[k] = safeURL(x); continue; }
      if (k === 'attributes' && !Array.isArray(x)) {
        o[k] = {};
        for (const [a, b] of Object.entries(x || {})) {
          if (/^on/i.test(a) || /^(srcdoc|srcset|value|data-.*)$/i.test(a)) continue;
          if (['href', 'src', 'action', 'poster'].includes(a)) o[k][a] = safeURL(b);
          else o[k][a] = b;
        }
      } else if (k === 'text' && v.source === 5) o[k] = '***';
      else if (k === 'textContent' && parent === 'textarea') o[k] = '***';
      else o[k] = walk(x, depth + 1, v.tagName || parent);
    }
    return o;
  }
  return events.filter(e => [0, 1, 2, 3, 4].includes(e?.type) && Number.isFinite(e.timestamp)).map(e => walk(e));
}
