// yemot.js — פאנל ניהול קו ימות המשיח של המוסד (מנהל בלבד).
// מאפשר: התחברות לקו, העלאת הקלטה לשלוחה, צפייה בנרשמים לצינתוק, והפעלת צינתוק.
//
// CORS: נבדק בפועל — API של ימות (call2all.co.il/ym/api) מאפשר קריאות דפדפן
// ישירות, ולכן אין צורך בפרוקסי. ה-token נשמר ב-sessionStorage בלבד (לא הסיסמה,
// ולא נשמר בין דפדפנים), ופג אוטומטית אחרי ~45 דקות אצל ימות.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const API = 'https://www.call2all.co.il/ym/api';
  const SS_KEY = 'cv3_yemot_token';
  const DEFAULT_LINE = '033060570';   // קו המוסד (סופק ע"י יוסף 21/07)

  const token = () => { try { return sessionStorage.getItem(SS_KEY) || ''; } catch (_) { return ''; } };
  const setToken = t => { try { t ? sessionStorage.setItem(SS_KEY, t) : sessionStorage.removeItem(SS_KEY); } catch (_) {} };

  // קריאת GET ל-API. ימות מחזיר JSON עם responseStatus.
  async function call(method, params) {
    const qs = new URLSearchParams(Object.assign({ token: token() }, params || {}));
    const res = await fetch(`${API}/${method}?${qs}`, { method: 'GET' });
    let data; try { data = await res.json(); } catch (_) { data = { responseStatus: 'EXCEPTION', message: 'תשובה לא תקינה מהשרת' }; }
    return data;
  }

  async function login(line, pass) {
    // Login מחזיר token ב-JSON; אין צורך ב-token קודם
    const qs = new URLSearchParams({ username: line, password: pass });
    const res = await fetch(`${API}/Login?${qs}`, { method: 'GET' });
    const data = await res.json();
    if (data.responseStatus === 'OK' && data.token) { setToken(data.token); return { ok: true }; }
    return { ok: false, msg: data.message || 'שם משתמש או סיסמה שגויים' };
  }

  // ---------- תצוגה ----------
  async function render(page) {
    if (!token()) return renderLogin(page);
    return renderPanel(page);
  }

  function renderLogin(page) {
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>קו ימות המשיח</h2></div>' +
      '<div class="qr-card" style="max-width:460px;margin:0 auto">' +
        '<h3><i class="bi bi-telephone-inbound"></i> התחברות לקו המוסד</h3>' +
        '<p class="login-hint" style="margin:6px 0 14px">ההתחברות מול שרת ימות. הסיסמה אינה נשמרת — רק אסימון זמני לסשן הנוכחי.</p>' +
        '<label class="lbl">מספר הקו</label>' +
        '<input class="inp" id="ymLine" value="' + DEFAULT_LINE + '" inputmode="numeric">' +
        '<label class="lbl">סיסמת הקו</label>' +
        '<input class="inp" id="ymPass" type="password" autocomplete="off" placeholder="סיסמת ניהול הקו">' +
        '<button class="btn-primary" id="ymLoginBtn" style="margin-top:6px"><i class="bi bi-box-arrow-in-left"></i> התחברות</button>' +
        '<div id="ymMsg" class="login-msg"></div>' +
      '</div>';
    const btn = page.querySelector('#ymLoginBtn');
    const go = async () => {
      const line = page.querySelector('#ymLine').value.trim();
      const pass = page.querySelector('#ymPass').value;
      const msg = page.querySelector('#ymMsg');
      if (!line || !pass) { msg.textContent = 'נא להזין מספר קו וסיסמה.'; return; }
      msg.textContent = 'מתחבר…'; btn.disabled = true;
      try {
        const r = await login(line, pass);
        if (r.ok) { render(page); } else { msg.textContent = r.msg; btn.disabled = false; }
      } catch (e) { msg.textContent = 'שגיאת רשת — בדוק חיבור לאינטרנט.'; btn.disabled = false; }
    };
    btn.addEventListener('click', go);
    page.querySelector('#ymPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  function renderPanel(page) {
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>קו ימות המשיח</h2>' +
        '<div class="head-actions"><span class="chip ok" style="margin-inline-end:8px"><i class="bi bi-check-circle"></i> מחובר</span>' +
        '<button class="btn-ghost sm" id="ymLogout"><i class="bi bi-box-arrow-right"></i> ניתוק</button></div></div>' +

      // העלאת הקלטה
      '<div class="qr-card"><h3><i class="bi bi-cloud-upload"></i> העלאת הקלטה לשלוחה</h3>' +
        '<p class="login-hint" style="margin:0 0 10px">בוחרים קובץ אודיו (wav/mp3) ומספר שלוחה. הקובץ יוחלף בשלוחה שנבחרה.</p>' +
        '<div class="qr-grid" style="grid-template-columns:auto 1fr auto">' +
          '<input class="inp mb0" id="ymExt" value="1" style="width:90px" title="מספר שלוחה" inputmode="numeric">' +
          '<input class="inp mb0" id="ymFile" type="file" accept="audio/*">' +
          '<button class="btn-primary sm" id="ymUpload"><i class="bi bi-upload"></i> העלה</button>' +
        '</div><div id="ymUpMsg" class="count-line" style="margin-top:8px;min-height:1.2em"></div></div>' +

      // צינתוק
      '<div class="qr-card"><h3><i class="bi bi-bell"></i> צינתוק לנרשמים</h3>' +
        '<p class="login-hint" style="margin:0 0 10px">רשימת הנרשמים לצינתוק החינמי. <b>הרשמה מתבצעת רק ע"י מי שמתקשר ומוסיף את עצמו</b> — לא ניתן להוסיף מספרים ידנית לצינתוק חינמי.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
          '<input class="inp mb0" id="ymTzExt" placeholder="שלוחת צינתוק" style="width:150px" inputmode="numeric">' +
          '<button class="btn-ghost sm" id="ymTzLoad"><i class="bi bi-arrow-clockwise"></i> טען נרשמים</button>' +
          '<button class="btn-primary sm" id="ymTzRun"><i class="bi bi-send"></i> הפעל צינתוק</button>' +
        '</div>' +
        '<div id="ymTzList"><div class="empty-state" style="padding:14px">בחר שלוחת צינתוק וטען את רשימת הנרשמים.</div></div>' +
        '<div id="ymTzMsg" class="count-line" style="margin-top:8px;min-height:1.2em"></div></div>' +

      // מצב הקו
      '<div class="qr-card"><h3><i class="bi bi-info-circle"></i> מצב הקו</h3><div id="ymState" class="about-list">טוען…</div></div>';

    page.querySelector('#ymLogout').addEventListener('click', () => { setToken(''); render(page); });
    wireUpload(page);
    wireTzintuk(page);
    loadState(page);
  }

  function wireUpload(page) {
    page.querySelector('#ymUpload').addEventListener('click', async () => {
      const ext = page.querySelector('#ymExt').value.trim();
      const f = page.querySelector('#ymFile').files[0];
      const msg = page.querySelector('#ymUpMsg');
      if (!ext) { msg.textContent = 'הזן מספר שלוחה.'; return; }
      if (!f) { msg.textContent = 'בחר קובץ אודיו.'; return; }
      msg.textContent = 'מעלה…';
      try {
        const fd = new FormData();
        fd.append('token', token());
        fd.append('path', 'ivr2:/' + ext + '/000.wav');
        fd.append('convertAudio', '1');
        fd.append('file', f, f.name);
        const res = await fetch(`${API}/UploadFile`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.responseStatus === 'OK') { msg.textContent = '✓ ההקלטה הועלתה לשלוחה ' + esc(ext); page.querySelector('#ymFile').value = ''; }
        else { msg.textContent = 'שגיאה: ' + esc(data.message || 'ההעלאה נכשלה'); }
      } catch (e) { msg.textContent = 'שגיאת רשת בהעלאה.'; }
    });
  }

  function wireTzintuk(page) {
    const listBox = page.querySelector('#ymTzList');
    const msg = page.querySelector('#ymTzMsg');

    page.querySelector('#ymTzLoad').addEventListener('click', async () => {
      const ext = page.querySelector('#ymTzExt').value.trim();
      if (!ext) { msg.textContent = 'הזן מספר שלוחת צינתוק.'; return; }
      listBox.innerHTML = '<div class="empty-state" style="padding:14px">טוען…</div>';
      try {
        // הנרשמים נשמרים בקובץ tzintuk של השלוחה
        const data = await call('GetTextFile', { what: 'ivr2:/' + ext + '/tzintuk.ini' });
        const raw = (data && data.contents) || '';
        const nums = raw.split(/[\r\n,]+/).map(s => s.trim()).filter(s => /^0\d{6,}/.test(s));
        if (!nums.length) { listBox.innerHTML = '<div class="empty-state" style="padding:14px">אין נרשמים בשלוחה זו (או שהשלוחה אינה שלוחת צינתוק).</div>'; msg.textContent = ''; return; }
        listBox.innerHTML =
          '<div class="count-line" style="margin-bottom:6px">' + nums.length + ' נרשמים</div>' +
          nums.map(n => '<div class="tl-item"><span class="sev-dot lo"></span><div class="tl-main" style="direction:ltr;text-align:right">' + esc(n) + '</div></div>').join('');
        msg.textContent = '';
      } catch (e) { listBox.innerHTML = '<div class="empty-state" style="padding:14px">שגיאה בטעינת הרשימה.</div>'; }
    });

    page.querySelector('#ymTzRun').addEventListener('click', async () => {
      const ext = page.querySelector('#ymTzExt').value.trim();
      if (!ext) { msg.textContent = 'הזן מספר שלוחת צינתוק.'; return; }
      if (!(await window.UI.confirm('להפעיל צינתוק לכל הנרשמים בשלוחה ' + esc(ext) + '? צינתוק שהמנהל יוזם עלול לצרוך יחידות (אלא אם השלוחה מוגדרת כצינתוק חינמי אוטומטי).'))) return;
      msg.textContent = 'מפעיל…';
      try {
        const data = await call('RunTzintuk', { path: 'ivr2:/' + ext });
        if (data.responseStatus === 'OK') { msg.textContent = '✓ הצינתוק הופעל.'; }
        else { msg.textContent = 'הצינתוק לא הופעל: ' + esc(data.message || '') + (/balance/i.test(data.message || '') ? ' — נראה שאין יתרת יחידות; צינתוק חינמי עובד רק דרך הרשמה עצמית של המשתמש.' : ''); }
      } catch (e) { msg.textContent = 'שגיאת רשת.'; }
    });
  }

  async function loadState(page) {
    const box = page.querySelector('#ymState');
    try {
      const s = await call('GetSession');
      if (s.responseStatus === 'OK') {
        box.innerHTML =
          '<li>מספר הקו: <b>' + esc(s.ownerId || s.username || '—') + '</b></li>' +
          (s.creditRemains != null ? '<li>יתרת יחידות: <b>' + esc(s.creditRemains) + '</b></li>' : '') +
          '<li>אסימון פעיל לסשן זה בלבד</li>';
      } else if (/token/i.test(s.message || '')) {
        box.innerHTML = '<li>האסימון פג. יש להתחבר מחדש.</li>';
        setToken('');
      } else { box.innerHTML = '<li>' + esc(s.message || 'לא ניתן לטעון מצב') + '</li>'; }
    } catch (e) { box.innerHTML = '<li>שגיאה בטעינת מצב הקו.</li>'; }
  }

  window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  window.PAGE_RENDERERS.yemot = render;
})();
