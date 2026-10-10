let privacy;
const allowed = ['klem.co.il', 'www.klem.co.il'].includes(location.hostname);
let testMode = new URLSearchParams(location.search).get('klem_replay_test') === '1';
try { if (testMode) sessionStorage.setItem('klem_replay_test', '1'); else testMode = sessionStorage.getItem('klem_replay_test') === '1'; } catch {}
let stop, starting = false, generation = 0, enabled = false;
async function start() {
  if (!enabled || stop || starting || !privacy.allows('replay')) return;
  starting = true; const current = ++generation;
  try {
    const { startRecording } = await import('./recorder.js');
    const permitted = () => privacy.allows('replay') && current === generation;
    if (!permitted()) return;
    const cleanup = await startRecording({ testMode, permitted, consentReceipt: privacy.current() });
    if (permitted()) stop = cleanup; else cleanup?.();
  } catch { /* Optional measurement must never interrupt the website. */ }
  finally { starting = false; }
}
function withdraw() {
  generation++; stop?.(); stop = undefined;
  try { sessionStorage.removeItem('klem_replay_session'); localStorage.removeItem('klem_replay_visitor'); } catch {}
  const reference = document.querySelector('[name="replay-session"]'); if (reference) reference.value = '';
}
function boot() {
  privacy = window.klemPrivacy;
  if (!privacy || (!allowed && !testMode)) return;
  const panel = document.createElement('section'); panel.className = 'klem-replay-consent rr-block'; panel.dir = 'rtl'; panel.setAttribute('aria-label', 'העדפות פרטיות');
  panel.innerHTML = `<strong>הפרטיות שלכם, הבחירה שלכם</strong>
    <p>באישורכם נשתמש במדידת שימוש, בהקלטת פעולות באתר (לחיצות, גלילה וניווט, ללא תוכן שדות הטופס) ובמדידת פרסום. אפשר לבחור בנפרד או לסרב, ולהמשיך להשתמש באתר כרגיל.</p>
    <a href="/privacy#privacy-choices">מידע על השימוש בנתונים</a>
    <fieldset hidden><legend>בחירת כלים אופציונליים</legend>
      <label><input type="checkbox" name="analytics"> מדידת שימוש — Google Analytics, למדידת ביקורים ומקורות הגעה.</label>
      <label><input type="checkbox" name="replay"> הקלטת ביקור — שחזור פעולות לשיפור האתר. ללא מצלמה או מיקרופון; עד 30 יום.</label>
      <label><input type="checkbox" name="advertising"> מדידת פרסום — שיוך פניות לפרסום ב-OpenAI. אינה מפעילה הקלטת ביקור.</label>
    </fieldset><div class="privacy-actions">
      <button type="button" data-action="accept">אישור הכול</button>
      <button type="button" data-action="reject">דחיית כלים אופציונליים</button>
      <button type="button" data-action="settings">בחירת הגדרות</button>
      <button type="button" data-action="save" hidden>שמירת הבחירה</button>
    </div>`;
  const preferences = document.createElement('button'); preferences.type = 'button'; preferences.className = 'klem-replay-preferences rr-block'; preferences.textContent = 'הגדרות פרטיות';
  const fields = panel.querySelector('fieldset'), inputs = [...fields.querySelectorAll('input')];
  const settings = panel.querySelector('[data-action="settings"]'), save = panel.querySelector('[data-action="save"]');
  function sync() { inputs.forEach(input => { input.checked = privacy.allows(input.name); }); }
  function expand() { sync(); fields.hidden = false; settings.hidden = true; save.hidden = false; inputs[0].focus(); }
  function choose(choices) { privacy.choose(choices); panel.hidden = true; preferences.focus(); }
  panel.querySelector('[data-action="accept"]').onclick = () => choose({ analytics: true, replay: true, advertising: true });
  panel.querySelector('[data-action="reject"]').onclick = () => choose({});
  settings.onclick = expand;
  save.onclick = () => choose(Object.fromEntries(inputs.map(input => [input.name, input.checked])));
  preferences.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) expand(); };
  document.body.append(panel, preferences);
  panel.hidden = !!privacy.current(); sync();
  document.addEventListener('klem:privacy-change', () => {
    if (privacy.allows('replay')) start(); else withdraw();
    sync(); panel.hidden = !!privacy.current();
  });
  // No interaction data is included in the first-party availability check.
  fetch('/api/replay/start').then(r => r.json()).then(data => { enabled = data.enabled === true; start(); }).catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
