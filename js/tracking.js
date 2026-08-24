// tracking.js — חלק 5: נוכחות, מבחנים, תפקוד, רפואי (מוגבל), שיחות, אסיפות, לוח עברי.
// מחולל גנרי לרשומות-תלמיד + מודולים ייעודיים. נתונים דרך window.db או דמו מקומי.
(function () {
  'use strict';
  const DEMO = !window.sb;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  async function students() { return (window.cv3Students ? await window.cv3Students.getStudents() : []); }
  // כל הנתונים דרך המאגר המרכזי (store.js) — עם סינון הרשאות לרשומות תלמיד
  async function list(table) {
    let rows = await window.store.list(table);
    const ids = window.cv3Students ? await window.cv3Students.accessibleIds() : null;
    if (ids && rows.length && 'student_id' in rows[0]) rows = rows.filter(r => ids.includes(r.student_id));
    // רב/מלמד רואה רק את הרשומות שרשם בעצמו (נוכחות/מבחנים) — תואם ל-RLS בשרת
    if (window.Auth && window.Auth.ownReportsOnly && window.Auth.ownReportsOnly() && rows.length && 'created_by' in rows[0]) {
      const uid = window.Auth.userId; rows = rows.filter(r => String(r.created_by) === String(uid));
    }
    return rows;
  }
  async function add(table, row) { const r = await window.store.add(table, row); return { ok: r.ok, data: r.data }; }
  async function del(table, id) { return window.store.remove(table, id); }

  // ----- מחולל דף רשומות גנרי -----
  function makeRecord(cfg) {
    return async function (page) {
      const studs = await students();
      const nameOf = id => { const s = studs.find(x => x.id == id); return s ? s.name : '—'; };
      const rows = await list(cfg.table);
      const pickHtml = await window.cv3Picker.html(cfg.table);
      // מחולל הרשומות משמש כמה מודולים (מבחנים, רפואי, שיחות, אסיפות, תפקוד),
      // וכולם קיימים ב-DOM במקביל. מזהים קבועים יצרו כפילות ב-HTML, כך ש-
      // document.querySelector('#recSave') החזיר את הכפתור של מסך אחר.
      const uid = cfg.table;
      const fieldsHtml = cfg.fields.map(f =>
        '<input class="inp mb0' + (f.wide ? ' fld-wide' : '') + '" data-f="' + f.k + '" placeholder="' + esc(f.label) + '"' + (f.type === 'number' ? ' type="number"' : '') + '>').join('');
      page.innerHTML =
        '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>' + cfg.title + '</h2>' +
        '<div class="head-actions">' +
          (cfg.batch ? '<button class="btn-ghost sm always-on" id="recMode-' + uid + '"><i class="bi bi-table"></i> טבלת כיתה</button>' : '') +
          '<button class="btn-ghost sm" id="recCsv-' + uid + '"><i class="bi bi-download"></i> ייצוא CSV</button></div></div>' +
        (cfg.restricted ? '<div class="demo-note" style="margin:0 2px 12px"><i class="bi bi-shield-lock"></i> מידע רגיש — הגישה מוגבלת לתפקידים מורשים (נאכף ע"י ה-RLS בצד-שרת).</div>' : '') +
        // entry-card: במצב "צפייה בלבד" כרטיס ההזנה היה נשאר על המסך אבל מת לגמרי —
        // ה-CSS נותן pointer-events:none לשדות ומסתיר את כפתור ההוספה, כך שבורר התלמידים
        // לא נפתח ו"לא מופיעים שמות". זה נראה כמו תקלה במערכת ולא כמו חוסר הרשאה (23/08/2026).
        // עכשיו הכרטיס מוסתר לגמרי ובמקומו הודעה שמסבירה מה קורה ומה לעשות.
        '<div class="qr-card entry-card"><h3><i class="bi ' + cfg.icon + '"></i> רישום חדש</h3><div class="qr-grid" style="grid-template-columns:repeat(' + cfg.fields.length + ',1fr) auto">' +
          pickHtml +
          fieldsHtml +
          '<button class="btn-primary sm" id="recSave-' + uid + '"><i class="bi bi-plus-lg"></i> הוסף</button>' +
        '</div></div>' +
        '<div class="entry-note"><i class="bi bi-eye"></i> ההרשאה שלך במערכת היא <b>צפייה בלבד</b>, ולכן אי אפשר להוסיף כאן רישום חדש. ' +
        'הרישומים הקיימים מוצגים למטה. כדי לקבל הרשאת הזנה — פנה למנהל המערכת.</div>' +
        (cfg.batch ?
          '<div class="qr-card entry-card" id="recBatch-' + uid + '" hidden>' +
            '<h3><i class="bi bi-table"></i> טבלת כיתה — מזינים ציונים בלבד</h3>' +
            '<p class="login-hint" style="margin:0 0 8px">בחר כיתה, תאריך ומקצוע — ואז מלא רק את הציונים. ' +
            'תלמיד שיישאר ריק לא יירשם. אם כבר הזנת ציון לאותה כיתה+תאריך+מקצוע, הוא ייטען לעריכה במקום להיכפל.</p>' +
            '<div class="qr-grid" style="grid-template-columns:repeat(4,1fr)">' +
              '<select class="inp mb0" id="bCls-' + uid + '"></select>' +
              '<input type="date" class="inp mb0" id="bDate-' + uid + '" value="' + today() + '">' +
              '<input class="inp mb0" id="bSubj-' + uid + '" placeholder="מקצוע / נושא">' +
              '<input class="inp mb0" id="bExam-' + uid + '" placeholder="שם הבוחן">' +
            '</div>' +
            '<div class="table-wrap entry-ui" style="margin-top:10px"><table class="tbl">' +
              '<thead><tr><th>תלמיד</th><th style="width:130px">ציון</th></tr></thead><tbody id="bBody-' + uid + '"></tbody></table></div>' +
            '<div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
              '<button class="btn-primary sm" id="bSave-' + uid + '"><i class="bi bi-check-lg"></i> שמירת הציונים</button>' +
              '<span class="tl-note" id="bHint-' + uid + '" style="font-size:.82rem"></span></div>' +
          '</div>' : '') +
        '<div id="recList-' + uid + '"></div>' +
        '<div id="recEmpty-' + uid + '" class="empty-state" hidden><i class="bi ' + cfg.icon + '"></i><div>אין רישומים עדיין</div></div>';
      const pick = window.cv3Picker.wire(page, cfg.table);
      let data = rows;
      function draw() {
        page.querySelector('#recList-' + uid).innerHTML = data.slice().reverse().map(x =>
          '<div class="tl-item"><span class="sev-dot mid"></span><div class="tl-main"><strong>' + esc(nameOf(x.student_id)) + '</strong> · ' +
          cfg.fields.map(f => esc(x[f.k])).filter(Boolean).join(' · ') + '</div><div class="tl-meta">' + esc(x[cfg.dateField || 'date'] || x.date || x.event_date || '') + '</div>' +
          '<button class="mini danger" data-del="' + x.id + '"><i class="bi bi-trash"></i></button></div>').join('');
        page.querySelector('#recEmpty-' + uid).hidden = data.length > 0;
        page.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
          const ok = await window.UI.confirm('למחוק?'); if (!ok) return;
          await del(cfg.table, Number(b.dataset.del)); data = data.filter(x => x.id != b.dataset.del); draw(); window.UI.toast('נמחק');
        }));
      }
      page.querySelector('#recCsv-' + uid).addEventListener('click', () => {
        const head = ['תלמיד'].concat(cfg.fields.map(f => f.label)).concat(['תאריך']);
        const lines = [head.join(',')].concat(data.map(x =>
          [nameOf(x.student_id)].concat(cfg.fields.map(f => x[f.k])).concat([x[cfg.dateField || 'date'] || x.date || x.event_date || ''])
            .map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')));
        const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = cfg.table + '.csv'; a.click();
      });
      page.querySelector('#recSave-' + uid).addEventListener('click', async () => {
        const sid = pick.value();
        if (!sid) { window.UI.toast('בחר תלמיד', 'err'); return; }
        const row = { student_id: Number(sid) };
        // שם עמודת התאריך משתנה בין טבלאות (test_date/report_date/date); null = אין עמודת תאריך
        if (cfg.dateField !== null) row[cfg.dateField || 'date'] = today();
        cfg.fields.forEach(f => { row[f.k] = page.querySelector('[data-f="' + f.k + '"]').value.trim(); });
        const r = await add(cfg.table, row); if (!r.ok) { window.UI.toast('שגיאה בשמירה', 'err'); return; }
        data = data.concat([row]); cfg.fields.forEach(f => page.querySelector('[data-f="' + f.k + '"]').value = '');
        draw(); window.UI.toast('נוסף');
      });
      draw();

      // ── מצב "טבלת כיתה" (בקשת עמנואל 23/08/2026) ──
      // הרב רמי בוחן כיתה שלמה באותו מקצוע ובאותו יום; במסלול הרגיל הוא נאלץ להקליד
      // תלמיד+מקצוע+בוחן מחדש לכל ילד. כאן הכותרות נבחרות פעם אחת ומזינים רק ציונים.
      // המסלול הבודד נשאר כפי שהוא — מחנכים ממשיכים לעבוד בדיוק כמו קודם.
      if (cfg.batch) {
        const $b = id => page.querySelector('#' + id + '-' + uid);
        const single = page.querySelector('.entry-card:not([id^="recBatch"])');
        const batch = $b('recBatch'), modeBtn = $b('recMode');
        const clsSel = $b('bCls'), dEl = $b('bDate'), sEl = $b('bSubj'), xEl = $b('bExam');
        let batchOn = false;
        const classes = (window.cv3Students ? await window.cv3Students.getClasses() : []) || [];
        clsSel.innerHTML = '<option value="">בחר כיתה…</option>' +
          classes.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
        if (window.currentUser && window.currentUser.name) xEl.value = window.currentUser.name;

        modeBtn.addEventListener('click', () => {
          batchOn = !batchOn;
          batch.hidden = !batchOn;
          if (single) single.hidden = batchOn;
          modeBtn.innerHTML = batchOn ? '<i class="bi bi-person-plus"></i> רישום בודד' : '<i class="bi bi-table"></i> טבלת כיתה';
          if (batchOn) drawBatch(true);
        });

        // רשומה קיימת לאותו תלמיד+תאריך+מקצוע — כדי לערוך במקום לשכפל
        const existing = (sid) => {
          const d = dEl.value, sub = (sEl.value || '').trim();
          if (!d || !sub) return null;
          return data.find(r => r.student_id == sid && r[cfg.dateField] === d && String(r.subject || '').trim() === sub) || null;
        };
        // full=true → בנייה מאפס (החלפת כיתה). full=false → שמירה על ציונים שהמשתמש כבר הקליד.
        // ⚠️ קריטי: שינוי תאריך/מקצוע — וגם *יציאה מהשדה* — מפעיל redraw. בלי שמירת מה שהוקלד,
        //    מורה שמילא ציונים ואז תיקן את שם המקצוע היה מאבד את כולם בלי שום אזהרה.
        //    לכן שדה שהמשתמש נגע בו מסומן data-dirty ומועתק לבנייה מחדש.
        function drawBatch(full) {
          const kids = studs.filter(s => String(s.class_id) === String(clsSel.value));
          const body = $b('bBody');
          const typed = {};
          if (!full) page.querySelectorAll('.b-grade').forEach(el => { if (el.dataset.dirty === '1' && el.value !== '') typed[el.dataset.sid] = el.value; });
          if (!clsSel.value) { body.innerHTML = '<tr><td colspan="2">בחר כיתה כדי להציג את התלמידים</td></tr>'; $b('bHint').textContent = ''; return; }
          if (!kids.length) { body.innerHTML = '<tr><td colspan="2">אין תלמידים בכיתה</td></tr>'; $b('bHint').textContent = ''; return; }
          body.innerHTML = kids.map(s => {
            const ex = existing(s.id);
            const mine = typed[s.id];
            const val = mine != null ? mine : (ex && ex.grade != null ? ex.grade : '');
            return '<tr><td>' + esc(window.UI.fullName ? window.UI.fullName(s) : s.name) + '</td>' +
              '<td><input type="number" class="inp mb0 b-grade" data-sid="' + s.id + '"' + (mine != null ? ' data-dirty="1"' : '') +
              ' min="0" max="100" step="1" inputmode="numeric" placeholder="—" style="width:100%" value="' + esc(val) + '"></td></tr>';
          }).join('');
          body.querySelectorAll('.b-grade').forEach(el => el.addEventListener('input', () => { el.dataset.dirty = '1'; }));
          const filled = kids.filter(s => existing(s.id)).length;
          $b('bHint').textContent = filled ? filled + ' מתוך ' + kids.length + ' כבר הוזנו למקצוע ולתאריך האלה — עריכה תעדכן אותם' : '';
        }
        clsSel.addEventListener('change', () => drawBatch(true));      // כיתה אחרת = תלמידים אחרים
        [dEl, sEl].forEach(el => el.addEventListener('change', () => drawBatch(false)));

        $b('bSave').addEventListener('click', async () => {
          const sub = (sEl.value || '').trim(), d = dEl.value, exm = (xEl.value || '').trim();
          if (!clsSel.value) { window.UI.toast('בחר כיתה', 'err'); return; }
          if (!d) { window.UI.toast('בחר תאריך', 'err'); return; }
          if (!sub) { window.UI.toast('רשום מקצוע / נושא', 'err'); return; }
          const inputs = [...page.querySelectorAll('.b-grade')];
          const items = [];
          for (const el of inputs) {
            const raw = String(el.value || '').trim();
            if (!raw) continue;                       // ריק = לא נבחן / לא מזינים. לא נשמר כאפס.
            const g = Number(raw);
            if (!isFinite(g) || g < 0 || g > 100) { window.UI.toast('ציון חייב להיות מספר בין 0 ל-100', 'err'); el.focus(); return; }
            items.push({ sid: Number(el.dataset.sid), grade: g });
          }
          if (!items.length) { window.UI.toast('לא מולא אף ציון', 'err'); return; }
          let added = 0, updated = 0, failed = 0;
          for (const it of items) {
            const ex = existing(it.sid);
            if (ex) {
              const r = await window.store.update(cfg.table, ex.id, { grade: it.grade, examiner: exm || null });
              // RLS חוסם בשקט: ok:true בלי שורה. בלי הבדיקה הזו "נשמר" היה שקר.
              if (!r || r.ok === false || (Array.isArray(r.data) && !r.data.length && !r.demo)) failed++;
              else { ex.grade = it.grade; ex.examiner = exm || null; updated++; }
            } else {
              const row = { student_id: it.sid, subject: sub, grade: it.grade, examiner: exm || null };
              row[cfg.dateField] = d;
              const r = await add(cfg.table, row);
              if (!r.ok) failed++;
              else { data = data.concat([(r.data && r.data[0]) || row]); added++; }
            }
          }
          draw(); drawBatch(true);
          const parts = [];
          if (added) parts.push('נוספו ' + added);
          if (updated) parts.push('עודכנו ' + updated);
          if (failed) parts.push('נכשלו ' + failed);
          window.UI.toast(parts.join(' · '), failed ? 'err' : 'ok');
        });
      }
    };
  }

  // ----- נוכחות (P/A/L לכל תלמיד ליום) -----
  async function renderAttendance(page) {
    const studs = await students();
    const classes = window.cv3Students ? await window.cv3Students.getClasses() : [];
    const has = new Set(studs.map(s => s.class_id));
    const clsOpts = classes.filter(c => has.has(c.id)).map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
    const state = {};
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>נוכחות</h2></div>' +
      // entry-ui: במסך הנוכחות הטבלה והסרגל *הם* טופס ההזנה, ולא תצוגת נתונים.
      // בלי הסימון הזה מצב "הזנה בלבד" (מלמד) הסתיר אותם ומנע ממנו לרשום נוכחות כלל.
      '<div class="toolbar entry-ui" style="grid-template-columns:auto auto 1fr auto">' +
        '<input type="date" class="inp mb0" id="attDate" value="' + today() + '">' +
        '<select class="inp mb0" id="attClass"><option value="">כל הכיתות</option>' + clsOpts + '</select>' +
        '<input type="search" class="inp mb0" id="attSearch" placeholder="🔍 חיפוש תלמיד…">' +
        '<span class="count-line" id="attSum" style="align-self:center"></span></div>' +
      '<div class="table-wrap entry-ui"><table class="tbl"><thead><tr><th>תלמיד</th><th>נוכחות</th></tr></thead><tbody id="attBody"></tbody></table></div>';
    function visible() {
      const cid = page.querySelector('#attClass').value, q = (page.querySelector('#attSearch').value || '').trim();
      return studs.filter(s => (!cid || String(s.class_id) === cid) && (!q || (s.name || '').includes(q)));
    }
    function draw() {
      page.querySelector('#attBody').innerHTML = visible().map(s => {
        const v = state[s.id] || '';
        const btn = (val, lbl, cls) => '<button class="att-btn ' + cls + (v === val ? ' on' : '') + '" data-sid="' + s.id + '" data-v="' + val + '">' + lbl + '</button>';
        return '<tr><td><span class="ava">' + esc((s.name || '?').slice(0, 2)) + '</span> ' + esc(s.name) + '</td>' +
          '<td class="att-cell">' + btn('present', 'נוכח', 'p') + btn('late', 'איחור', 'l') + btn('absent', 'נעדר', 'a') + '</td></tr>';
      }).join('');
      const c = { present: 0, late: 0, absent: 0 };
      Object.values(state).forEach(v => c[v] != null && c[v]++);
      page.querySelector('#attSum').textContent = 'נוכחים ' + c.present + ' · איחורים ' + c.late + ' · נעדרים ' + c.absent;
      page.querySelectorAll('.att-btn').forEach(b => b.addEventListener('click', async () => {
        const sid = Number(b.dataset.sid), v = b.dataset.v, d = page.querySelector('#attDate').value;
        state[sid] = v; draw();
        const all = await list('attendance');
        for (const a of all) if (a.student_id == sid && a.date === d) await del('attendance', a.id);
        await add('attendance', { student_id: sid, date: d, status: v });
        window.UI.toast('נשמר');
      }));
    }
    async function loadDate() {
      Object.keys(state).forEach(k => delete state[k]);
      const d = page.querySelector('#attDate').value;
      (await list('attendance')).filter(a => a.date === d).forEach(a => { state[a.student_id] = a.status; });
      draw();
    }
    page.querySelector('#attDate').addEventListener('change', loadDate);
    page.querySelector('#attClass').addEventListener('change', draw);
    page.querySelector('#attSearch').addEventListener('input', draw);
    loadDate();
  }

  // ----- לוח שנה עברי (תאריך היום) -----
  async function renderCalendar(page) {
    let heb = '';
    try { heb = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch (_) {}
    const greg = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>לוח שנה</h2></div>' +
      '<div class="qr-card" style="text-align:center"><h3 style="justify-content:center"><i class="bi bi-calendar3"></i> היום</h3>' +
      '<div style="font-size:1.6rem;font-weight:800;color:var(--primary-dark);margin:6px 0">' + esc(heb) + '</div>' +
      '<div style="color:var(--muted)">' + esc(greg) + '</div>' +
      '<p class="login-hint" style="margin-top:14px">תצוגת חודש מלאה ואירועים יתווספו בהמשך.</p></div>';
  }

  const R = window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  R.tests = makeRecord({ table: 'tests', title: 'מבחנים', icon: 'bi-card-checklist', dateField: 'test_date', batch: true, fields: [{ k: 'subject', label: 'מקצוע / נושא' }, { k: 'grade', label: 'ציון', type: 'number' }, { k: 'examiner', label: 'שם הבוחן' }] });
  R.functioning = makeRecord({ table: 'functioning', title: 'ציוני תפקוד', icon: 'bi-bar-chart-line', fields: [{ k: 'area', label: 'תחום' }, { k: 'score', label: 'ציון', type: 'number' }] });
  R.conversations = makeRecord({ table: 'conversations', title: 'שיחות עם תלמידים', icon: 'bi-chat-dots', fields: [{ k: 'summary', label: 'סיכום השיחה', wide: true }] });
  R.meetings = makeRecord({ table: 'meetings', title: 'אסיפות הורים', icon: 'bi-people', fields: [{ k: 'attendees', label: 'משתתפים' }, { k: 'summary', label: 'סיכום', wide: true }] });
  R.medical = makeRecord({ table: 'medications', title: 'רפואי — אלרגיות ותרופות', icon: 'bi-capsule', restricted: true, dateField: null, fields: [{ k: 'kind', label: 'סוג (אלרגיה/תרופה)' }, { k: 'name', label: 'שם' }, { k: 'details', label: 'פרטים', wide: true }] });
  R.attendance = renderAttendance;
  R.calendar = renderCalendar;
})();
