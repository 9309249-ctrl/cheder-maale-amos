// students.js — חלק 3: תלמידים וכיתות. רשימה + חיפוש/סינון + הוספה/עריכה/מחיקה + CSV.
// נתונים דרך window.db (Supabase) או דמו מקומי במצב DEMO.
(function () {
  'use strict';
  const DEMO = !window.sb;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // כל הנתונים דרך המאגר המרכזי (store.js) — משותף עם שאר המודולים.
  async function getClasses() { return window.store.list('classes'); }
  async function getStudents() {
    // מודל עמנואל (2026-08-17): כל צוות רואה את כל התלמידים (שמות+פרטים).
    // אין סינון כיתה בצד-לקוח — היקף הנתונים (דיווחים) נאכף ב-RLS בשרת.
    return window.store.list('students');
  }
  async function saveStudent(row) { return row.id ? window.store.update('students', row.id, row) : window.store.add('students', row); }
  async function removeStudent(id) { return window.store.remove('students', id); }

  const classNameOf = (classes, id) => { const c = classes.find(x => x.id === id); return c ? c.name : ''; };
  // שם מלא בלי כפילות: אם name כבר מכיל את המשפחה (רשומות מיובאות) — מציגים name כמו שהוא;
  // אחרת (רשומה חדשה: name=פרטי, family בנפרד) — מחברים "פרטי משפחה".
  const fullName = s => { const f = (s.family || '').trim(), n = (s.name || '').trim(); if (!f) return n; if (!n) return f; return n.split(/\s+/).includes(f) ? n : (n + ' ' + f); };

  async function render(page) {
    const [students, classes] = await Promise.all([getStudents(), getClasses()]);
    // מצב גישה: full=כרטיס מלא+עריכה; limited=מורה עם גישה מוגבלת (רשימת שמות/כרטיס-שלי בלבד)
    const full = !window.Auth || window.Auth.fullStudents();
    const canOwn = !full && window.Auth && window.Auth.cap('card_own');   // רשאי לפתוח כרטיס מצומצם (רק הדיווחים שלו)
    const limited = !full;
    page.innerHTML =
      '<div class="page-head">' +
        '<button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button>' +
        '<h2>תלמידים</h2>' +
        (limited ? '' :
        '<div class="head-actions">' +
          '<button class="btn-primary sm" id="stuAdd"><i class="bi bi-plus-lg"></i> תלמיד חדש</button>' +
          '<button class="btn-ghost sm" id="stuCsv"><i class="bi bi-download"></i> ייצוא CSV</button>' +
        '</div>') +
      '</div>' +
      '<div class="toolbar' + (limited ? ' entry-ui' : '') + '">' +
        '<input type="search" class="inp mb0" id="stuSearch" placeholder="' + (limited ? 'חיפוש תלמיד…' : 'חיפוש תלמיד / הורה / טלפון…') + '">' +
        '<select class="inp mb0" id="stuClass"><option value="">כל הכיתות</option>' +
          classes.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select>' +
        '<select class="inp mb0" id="stuStatus"><option value="">כל הסטטוסים</option><option value="פעיל">פעיל</option><option value="לא פעיל">לא פעיל</option></select>' +
      '</div>' +
      '<div class="count-line' + (limited ? ' entry-ui' : '') + '" id="stuCount"></div>' +
      '<div class="table-wrap' + (limited ? ' entry-ui' : '') + '"><table class="tbl"><thead><tr>' +
        (limited ? '<th>שם</th><th>כיתה</th><th>סטטוס</th>' : '<th>שם</th><th>ת״ז</th><th>כיתה</th><th>הורה</th><th>טלפון</th><th>סטטוס</th><th></th>') +
      '</tr></thead><tbody id="stuBody"></tbody></table></div>' +
      '<div id="stuEmpty" class="empty-state" hidden><i class="bi bi-people"></i><div>אין תלמידים להצגה</div></div>';

    function draw() {
      const q = (page.querySelector('#stuSearch').value || '').trim();
      const cf = page.querySelector('#stuClass').value;
      const sf = page.querySelector('#stuStatus').value;
      let rows = students;
      if (q) rows = limited
        ? rows.filter(s => [s.name, s.family].join(' ').includes(q))
        : rows.filter(s => [s.name, s.family, s.tz, s.parent_name, s.parent_phone, s.mother_name, s.mother_phone, s.mother_email].join(' ').includes(q));
      if (cf) rows = rows.filter(s => String(s.class_id) === cf);
      if (sf) rows = rows.filter(s => (s.status || '') === sf);
      const body = page.querySelector('#stuBody');
      // רשומת שם: לחיצה פותחת כרטיס רק אם יש הרשאת כרטיס (full או card_own); אחרת רק שם ללא קישור
      const nameCell = s => (full || canOwn)
        ? '<td data-view="' + s.id + '" style="cursor:pointer" title="פתיחת כרטיס"><span class="ava">' + esc((s.name || '?').slice(0, 2)) + '</span> <span class="stu-name-link">' + esc(fullName(s)) + '</span></td>'
        : '<td><span class="ava">' + esc((s.name || '?').slice(0, 2)) + '</span> ' + esc(fullName(s)) + '</td>';
      body.innerHTML = rows.map(s => limited
        ? '<tr>' + nameCell(s) +
          '<td>' + esc(classNameOf(classes, s.class_id)) + '</td>' +
          '<td><span class="chip ' + (s.status === 'פעיל' ? 'ok' : 'off') + '">' + esc(s.status || '') + '</span></td></tr>'
        : '<tr>' + nameCell(s) +
          '<td>' + esc(s.tz) + '</td>' +
          '<td>' + esc(classNameOf(classes, s.class_id)) + '</td>' +
          '<td>' + esc(s.parent_name) + '</td>' +
          '<td>' + (s.parent_phone ? '<a href="tel:' + esc(s.parent_phone) + '">' + esc(s.parent_phone) + '</a>' : '') + '</td>' +
          '<td><span class="chip ' + (s.status === 'פעיל' ? 'ok' : 'off') + '">' + esc(s.status || '') + '</span></td>' +
          '<td class="row-act"><button class="mini" data-view="' + s.id + '" title="פרטים"><i class="bi bi-eye"></i></button>' +
          '<button class="mini" data-edit="' + s.id + '" title="עריכה"><i class="bi bi-pencil"></i></button>' +
          ((window.currentUser || {}).role === 'מנהל' ? '<button class="mini danger" data-del="' + s.id + '" title="מחיקה"><i class="bi bi-trash"></i></button>' : '') + '</td>' +
          '</tr>').join('');
      page.querySelector('#stuCount').textContent = rows.length + ' מתוך ' + students.length + ' תלמידים';
      page.querySelector('#stuEmpty').hidden = rows.length > 0;
      body.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => openDetail(students.find(s => s.id == b.dataset.view))));
      body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(students.find(s => s.id == b.dataset.edit))));
      body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => del(students.find(s => s.id == b.dataset.del))));
    }

    // כרטיס מצומצם: פרטי התלמיד + רק הדיווחים שהמורה המחובר עצמו רשם (בלי שאר המעקבים).
    async function openOwnCard(s) {
      const m = window.UI.modal({ title: 'כרטיס תלמיד', bodyHTML: '<div style="padding:26px;text-align:center;color:var(--muted)"><i class="bi bi-hourglass-split"></i> טוען…</div>' });
      const [cats, beh] = await Promise.all([
        window.store.list('categories'),
        window.store.byStudent('behavior_events', s.id),
      ]);
      const uid = (window.currentUser || {}).id;
      const mine = (beh || []).filter(e => e.created_by != null && String(e.created_by) === String(uid))
        .slice().sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')));
      const catName = id => { const c = cats.find(x => x.id == id); return c ? c.name : ''; };
      const sevc = x => x === 'גבוהה' ? 'hi' : x === 'נמוכה' ? 'lo' : 'mid';
      const row = (lbl, val) => val ? '<div class="det-row"><span class="det-lbl">' + lbl + '</span><span class="det-val">' + esc(val) + '</span></div>' : '';
      const li = (main, meta, dot) => '<div class="det-item">' + (dot ? '<span class="sev-dot ' + dot + '"></span>' : '') + '<span class="di-main">' + main + '</span><span class="di-meta">' + esc(meta || '') + '</span></div>';
      m.el.querySelector('.modal-body').innerHTML =
        '<div class="det-head"><span class="ava lg">' + esc((s.name || '?').slice(0, 2)) + '</span>' +
        '<div><div class="det-name">' + esc(fullName(s)) + '</div><span class="chip ' + (s.status === 'פעיל' ? 'ok' : 'off') + '">' + esc(s.status || '') + '</span></div></div>' +
        '<div class="det-grid">' + row('שם משפחה', s.family) + row('כיתה', classNameOf(classes, s.class_id)) +
          row('ת. לידה עברי', s.birthdate_heb) + row('שם אבא', s.parent_name) +
          (s.parent_phone ? '<div class="det-row"><span class="det-lbl">טלפון אבא</span><span class="det-val"><a href="tel:' + esc(s.parent_phone) + '">' + esc(s.parent_phone) + '</a></span></div>' : '') +
          row('שם אמא', s.mother_name) +
          (s.mother_phone ? '<div class="det-row"><span class="det-lbl">טלפון אמא</span><span class="det-val"><a href="tel:' + esc(s.mother_phone) + '">' + esc(s.mother_phone) + '</a></span></div>' : '') + '</div>' +
        '<div class="det-sec"><h4><i class="bi bi-clipboard-check"></i> הדיווחים שלי <span class="det-badge">' + mine.length + '</span></h4>' +
          (mine.length ? mine.slice(0, 30).map(e => li('<strong>' + esc(catName(e.category_id)) + '</strong>' + (e.note ? ' — ' + esc(e.note) : ''), e.event_date, sevc(e.severity))).join('')
            : '<div class="tl-note" style="padding:6px 2px;font-size:.84rem">עדיין לא רשמת דיווחים לתלמיד זה</div>') + '</div>';
    }

    async function openDetail(s) {
      if (!s) return;
      // כרטיס מצומצם למורה עם הרשאת card_own: פרטי התלמיד בלבד + רק הדיווחים שהמורה עצמו רשם.
      if (!full && canOwn) { await openOwnCard(s); return; }
      if (!full) return;   // אין הרשאת כרטיס — לא נפתח (השם אינו לחיץ ממילא)
      const m = window.UI.modal({ title: 'כרטיס תלמיד', bodyHTML: '<div style="padding:26px;text-align:center;color:var(--muted)"><i class="bi bi-hourglass-split"></i> טוען…</div>' });
      const [cats, beh, att, tst, fnc, med, cnv, mtg, rdg, wrt, tui, tsk, raCats, raAssess] = await Promise.all([
        window.store.list('categories'),
        window.store.byStudent('behavior_events', s.id), window.store.byStudent('attendance', s.id),
        window.store.byStudent('tests', s.id), window.store.byStudent('functioning', s.id),
        window.store.byStudent('medications', s.id), window.store.byStudent('conversations', s.id),
        window.store.byStudent('meetings', s.id), window.store.byStudent('reading', s.id), window.store.byStudent('writing', s.id),
        window.store.byStudent('tuition', s.id), window.store.byStudent('tasks', s.id),
        (window.cv3ReadAssess ? window.cv3ReadAssess.cats() : Promise.resolve([])),
        (window.cv3ReadAssess ? window.cv3ReadAssess.forStudent(s.id) : Promise.resolve([])),
      ]);
      const catName = id => { const c = cats.find(x => x.id == id); return c ? c.name : ''; };
      // כרטיס "מסייע חכם" אחיד — אותו רכיב גרפי כמו במגירה הצדדית, מוטמע בראש הכרטיס
      let aiHtml = '';
      if (window.cv3AI) { try { aiHtml = window.cv3AI.cardHtml(await window.cv3AI.summaryFor(s.id)); } catch (_) { aiHtml = ''; } }
      const row = (lbl, val) => val ? '<div class="det-row"><span class="det-lbl">' + lbl + '</span><span class="det-val">' + esc(val) + '</span></div>' : '';
      const sevc = x => x === 'גבוהה' ? 'hi' : x === 'נמוכה' ? 'lo' : 'mid';
      const li = (main, meta, dot) => '<div class="det-item">' + (dot ? '<span class="sev-dot ' + dot + '"></span>' : '') + '<span class="di-main">' + main + '</span><span class="di-meta">' + esc(meta || '') + '</span></div>';
      const sec = (title, icon, items, fmt) => items.length ? ('<div class="det-sec"><h4><i class="bi ' + icon + '"></i> ' + title + ' <span class="det-badge">' + items.length + '</span></h4>' + items.slice(-4).reverse().map(fmt).join('') + '</div>') : '';
      const attC = { present: 0, late: 0, absent: 0 }; att.forEach(a => attC[a.status] != null && attC[a.status]++);
      // משימות הקשורות לתלמיד — תאריך יעד בעברית + צ'יפ סטטוס (מראה זהה לסקשנים קריאה/כתיבה/מבחנים)
      const hebDate = iso => { if (!iso) return ''; try { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? String(iso) : new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' }).format(d); } catch (_) { return String(iso); } };
      const taskLbl = st => st === 'done' ? 'הושלם' : st === 'in_progress' ? 'בתהליך' : 'לביצוע';
      const taskChip = st => '<span class="chip ' + (st === 'done' ? 'ok' : 'off') + '">' + taskLbl(st) + '</span>';
      const tasksSec = '<div class="det-sec"><h4><i class="bi bi-kanban"></i> משימות הקשורות <span class="det-badge">' + tsk.length + '</span></h4>' +
        (tsk.length ? tsk.slice(-4).reverse().map(t => li('<strong>' + esc(t.title) + '</strong> ' + taskChip(t.status), hebDate(t.due_date))).join('')
          : '<div class="tl-note" style="padding:6px 2px;font-size:.84rem">אין משימות משויכות</div>') + '</div>';
      m.el.querySelector('.modal-body').innerHTML =
        '<div class="det-head"><span class="ava lg">' + esc((s.name || '?').slice(0, 2)) + '</span>' +
        '<div><div class="det-name">' + esc(fullName(s)) + '</div><span class="chip ' + (s.status === 'פעיל' ? 'ok' : 'off') + '">' + esc(s.status || '') + '</span></div></div>' +
        aiHtml +
        '<div class="det-grid">' + row('שם משפחה', s.family) + row('תעודת זהות', s.tz) + row('כיתה', classNameOf(classes, s.class_id)) +
          row('ת. לידה עברי', s.birthdate_heb) + row('ת. לידה לועזי', s.birthdate) + row('שם אבא', s.parent_name) +
          (s.parent_phone ? '<div class="det-row"><span class="det-lbl">טלפון אבא</span><span class="det-val"><a href="tel:' + esc(s.parent_phone) + '">' + esc(s.parent_phone) + '</a></span></div>' : '') +
          row('שם אמא', s.mother_name) +
          (s.mother_phone ? '<div class="det-row"><span class="det-lbl">טלפון אמא</span><span class="det-val"><a href="tel:' + esc(s.mother_phone) + '">' + esc(s.mother_phone) + '</a></span></div>' : '') +
          (s.mother_email ? '<div class="det-row"><span class="det-lbl">מייל אמא</span><span class="det-val"><a href="mailto:' + esc(s.mother_email) + '">' + esc(s.mother_email) + '</a></span></div>' : '') +
          row('הערות', s.notes) + '</div>' +
        '<div class="det-stats">' +
          '<div class="ds"><b>' + beh.length + '</b><span>דיווחים</span></div>' +
          '<div class="ds"><b>' + attC.present + '</b><span>נוכחות</span></div>' +
          '<div class="ds"><b>' + tst.length + '</b><span>מבחנים</span></div>' +
          '<div class="ds"><b>' + (med.length ? '⚠' : '—') + '</b><span>רפואי</span></div>' +
        '</div>' +
        sec('התנהגות', 'bi-clipboard-check', beh, e => li('<strong>' + esc(catName(e.category_id)) + '</strong>' + (e.note ? ' — ' + esc(e.note) : ''), e.event_date, sevc(e.severity))) +
        sec('מבחנים', 'bi-card-checklist', tst, t => li(esc(t.subject) + ' · <strong>' + esc(t.grade) + '</strong>', t.date)) +
        sec('ציוני תפקוד', 'bi-bar-chart-line', fnc, f => li(esc(f.area) + ' · <strong>' + esc(f.score) + '</strong>', f.date)) +
        sec('רפואי', 'bi-capsule', med, x => li('<strong>' + esc(x.name) + '</strong>' + (x.details ? ' — ' + esc(x.details) : ''), x.kind === 'allergy' ? 'אלרגיה' : 'תרופה', 'hi')) +
        sec('שיחות', 'bi-chat-dots', cnv, c => li(esc(c.summary), c.date)) +
        sec('אסיפות הורים', 'bi-people', mtg, x => li(esc(x.summary), x.date)) +
        sec('קריאה', 'bi-book', rdg, x => li('רמה: ' + esc(x.level) + (x.note ? ' — ' + esc(x.note) : ''), x.date)) +
        sec('כתיבה', 'bi-pencil-square', wrt, x => li('רמה: ' + esc(x.level), x.date)) +
        (window.cv3ReadAssess ? window.cv3ReadAssess.cardSection(raCats, raAssess) : '') +
        (att.length ? '<div class="det-sec"><h4><i class="bi bi-calendar-check"></i> נוכחות <span class="det-badge">' + att.length + '</span></h4><div class="det-item"><span class="di-main">נוכח ' + att.filter(a => a.status === 'present').length + ' · איחורים ' + att.filter(a => a.status === 'late').length + ' · נעדר ' + att.filter(a => a.status === 'absent').length + '</span></div></div>' : '') +
        sec('שכר לימוד', 'bi-cash-coin', tui, t => li((esc(t.month) || '') + (t.amount ? ' · ₪' + esc(t.amount) : ''), t.status === 'paid' ? 'שולם' : 'חוב', t.status === 'paid' ? 'lo' : 'hi')) +
        tasksSec +
        '<div class="det-actions" style="margin-top:14px">' +
          '<button class="btn-primary sm" data-edit2><i class="bi bi-pencil"></i> עריכת פרטים</button>' +
          '<button class="btn-ghost sm" data-reading><i class="bi bi-book-half"></i> מעקב קריאה</button>' +
          '<button class="btn-ghost sm" data-cert><i class="bi bi-award"></i> אישור לימודים</button>' +
          '<button class="btn-ghost sm" data-print2><i class="bi bi-printer"></i> הדפסה</button>' +
          '<button class="btn-ghost sm" data-go="behavior"><i class="bi bi-plus-lg"></i> דיווח חדש</button>' +
        '</div>';
      m.el.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => { m.close(); showPage(btn.dataset.go); }));
      const eb = m.el.querySelector('[data-edit2]'); if (eb) eb.addEventListener('click', () => { m.close(); openForm(s); });
      const pb = m.el.querySelector('[data-print2]'); if (pb) pb.addEventListener('click', () => window.print());
      const rab = m.el.querySelector('[data-reading]'); if (rab && window.cv3ReadAssess) rab.addEventListener('click', () => window.cv3ReadAssess.openAssessment(s, () => { m.close(); openDetail(s); }));
      const ctb = m.el.querySelector('[data-cert]'); if (ctb && window.cv3Cert) ctb.addEventListener('click', () => window.cv3Cert.openCertificate(s));
    }

    function openForm(existing) {
      const s = existing || {};
      const classOpts = classes.map(c => '<option value="' + c.id + '"' + (s.class_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
      const body =
        '<div class="form-grid">' +
        '<label class="fld"><span>שם משפחה</span><input class="inp mb0" id="f_family" value="' + esc(s.family) + '"></label>' +
        '<label class="fld"><span>שם התלמיד/ה *</span><input class="inp mb0" id="f_name" value="' + esc(s.name) + '"></label>' +
        '<label class="fld"><span>תעודת זהות</span><input class="inp mb0" id="f_tz" inputmode="numeric" value="' + esc(s.tz) + '"></label>' +
        '<label class="fld"><span>כיתה</span><select class="inp mb0" id="f_class"><option value="">—</option>' + classOpts + '</select></label>' +
        '<label class="fld"><span>ת. לידה עברי</span><input class="inp mb0" id="f_bheb" placeholder="למשל: כ״ג אדר תשפ״ד" value="' + esc(s.birthdate_heb) + '"></label>' +
        '<label class="fld"><span>ת. לידה לועזי</span><input class="inp mb0" id="f_bdate" type="date" value="' + esc(s.birthdate) + '"></label>' +
        '<label class="fld"><span>שם אבא</span><input class="inp mb0" id="f_pname" value="' + esc(s.parent_name) + '"></label>' +
        '<label class="fld"><span>טלפון אבא</span><input class="inp mb0" id="f_phone" value="' + esc(s.parent_phone) + '"></label>' +
        '<label class="fld"><span>שם אמא</span><input class="inp mb0" id="f_mname" value="' + esc(s.mother_name) + '"></label>' +
        '<label class="fld"><span>טלפון אמא</span><input class="inp mb0" id="f_mphone" value="' + esc(s.mother_phone) + '"></label>' +
        '<label class="fld"><span>מייל אמא</span><input class="inp mb0" id="f_memail" value="' + esc(s.mother_email) + '"></label>' +
        '<label class="fld"><span>סטטוס</span><select class="inp mb0" id="f_status"><option' + (s.status !== 'לא פעיל' ? ' selected' : '') + '>פעיל</option><option' + (s.status === 'לא פעיל' ? ' selected' : '') + '>לא פעיל</option></select></label>' +
        '<label class="fld fld-wide"><span>הערות</span><textarea class="inp mb0" id="f_notes" rows="2">' + esc(s.notes) + '</textarea></label>' +
        '</div>';
      window.UI.modal({
        title: existing ? 'עריכת תלמיד' : 'תלמיד חדש', bodyHTML: body, saveLabel: 'שמירה',
        onSave: async (m) => {
          const val = id => (m.querySelector(id).value || '').trim();
          const name = val('#f_name');
          if (!name) { window.UI.toast('נא להזין שם', 'err'); return false; }
          const row = {
            name,
            family: val('#f_family') || null,
            tz: val('#f_tz') || null,
            class_id: m.querySelector('#f_class').value ? Number(m.querySelector('#f_class').value) : null,
            birthdate: val('#f_bdate') || null,
            birthdate_heb: val('#f_bheb') || null,
            parent_name: val('#f_pname'),
            parent_phone: val('#f_phone'),
            mother_name: val('#f_mname'),
            mother_phone: val('#f_mphone'),
            mother_email: val('#f_memail'),
            status: m.querySelector('#f_status').value,
            notes: val('#f_notes'),
          };
          if (existing) row.id = existing.id;
          let r = await saveStudent(row);
          // עמידות: אם עמודות משפחה/ת״ז/ת.לידה-עברי טרם קיימות ב-DB — נשמור בלי השדות המורחבים ולא ניפול
          if (!r.ok && /family|tz|birthdate_heb|schema cache|does not exist|Could not find/i.test(r.error || '')) {
            const fb = Object.assign({}, row); delete fb.family; delete fb.tz; delete fb.birthdate_heb;
            r = await saveStudent(fb);
            if (r.ok) window.UI.toast('נשמר — שדות משפחה/ת״ז/ת.לידה עברי יופעלו לאחר עדכון בסיס הנתונים', 'err');
          } else if (r.ok) { window.UI.toast(existing ? 'עודכן' : 'נוסף תלמיד'); }
          if (!r.ok) { window.UI.toast('שגיאה: ' + (r.error || ''), 'err'); return false; }
          if (existing) Object.assign(existing, row); else students.push((r.data && r.data[0]) || row);
          draw();
          return true;
        },
      });
    }

    async function del(s) {
      if (!s) return;
      const ok = await window.UI.confirm('למחוק את "' + esc(s.name) + '"? הפעולה אינה הפיכה.');
      if (!ok) return;
      const r = await removeStudent(s.id);
      if (!r.ok) { window.UI.toast('שגיאה במחיקה', 'err'); return; }
      const i = students.indexOf(s); if (i >= 0) students.splice(i, 1);
      window.UI.toast('נמחק'); draw();
    }

    function exportCsv() {
      const head = ['משפחה', 'שם', 'ת״ז', 'כיתה', 'ת. לידה עברי', 'ת. לידה לועזי', 'שם אבא', 'טלפון אבא', 'שם אמא', 'טלפון אמא', 'מייל אמא', 'סטטוס'];
      const lines = [head.join(',')].concat(students.map(s =>
        [s.family, s.name, s.tz, classNameOf(classes, s.class_id), s.birthdate_heb, s.birthdate, s.parent_name, s.parent_phone, s.mother_name, s.mother_phone, s.mother_email, s.status].map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'students.csv'; a.click();
    }

    const addBtn = page.querySelector('#stuAdd'); if (addBtn) addBtn.addEventListener('click', () => openForm(null));
    const csvBtn = page.querySelector('#stuCsv'); if (csvBtn) csvBtn.addEventListener('click', exportCsv);
    ['#stuSearch', '#stuClass', '#stuStatus'].forEach(sel => page.querySelector(sel).addEventListener('input', draw));
    draw();
  }

  async function addClass(name) { const r = await window.store.add('classes', { name }); return { ok: r.ok, id: r.data && r.data[0] && r.data[0].id, error: r.error }; }
  async function updateClass(id, name) { const r = await window.store.update('classes', id, { name }); return { ok: r.ok, error: r.error }; }
  // מחיקת כיתה: ב-DB שיוכי-המשתמשים נמחקים ב-CASCADE, ותלמידים/נוכחות מתנתקים ב-SET NULL (לא נמחקים).
  async function removeClass(id) { const r = await window.store.remove('classes', id); return { ok: r.ok, error: r.error }; }
  // מודל עמנואל: כל צוות רואה את כל התלמידים ומדווח על כולם; היקף הנתונים נאכף ב-RLS בשרת.
  // null = "הכל" (כל המודולים כבר מתייחסים לכך). אין סינון תלמידים בצד-לקוח.
  async function accessibleIds() { return null; }
  window.cv3Students = { getStudents: getStudents, getClasses: getClasses, addClass: addClass, updateClass: updateClass, removeClass: removeClass, accessibleIds: accessibleIds };
  window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  window.PAGE_RENDERERS.students = render;
})();
