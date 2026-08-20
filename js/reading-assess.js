// reading-assess.js — מעקב קריאה מובנה (הוספה 2026-08-17, בקשת עמנואל).
// קטגוריות/עמודות ניתנות-לעריכה (reading_categories) + הערכות ציון 1–100 (reading_assessments).
// 2026-08-19 (בקשת עמנואל במייל): הציון נכתב חופשי 1–100 במקום בחירה מרשימה 1–10,
// ועריכת שמות העמודות/הוספתן זמינה גם ממסך "הגדרות והרשאות".
// ציונים ישנים (1–10) נשארים תקפים ומוצגים כמו שהם — אין המרה רטרואקטיבית.
// לא נוגע בסקשן "קידום קריאה" (reading) הקיים.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isAdmin = () => !!(window.currentUser && window.currentUser.role === 'מנהל');

  async function cats() {
    const list = await window.store.list('reading_categories');
    return (list || []).filter(c => c.active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
  }
  async function forStudent(sid) {
    const list = await window.store.byStudent('reading_assessments', sid);
    return (list || []).slice().sort((a, b) => String(b.assessed_on || '').localeCompare(String(a.assessed_on || '')) || b.id - a.id);
  }

  // ── טופס הערכה חדשה (ציון חופשי 1–100 לכל קטגוריה) ──
  async function openAssessment(student, onSaved) {
    const cs = await cats();
    if (!cs.length) { window.UI.toast('אין קטגוריות קריאה. הוסף במסך "מעקב קריאה".', 'err'); return; }
    const last = (await forStudent(student.id))[0];
    const prev = (last && last.scores) || {};
    const rows = cs.map(c =>
      '<tr><td>' + esc(c.name) + '</td><td>' +
        '<input type="number" class="inp mb0 ra-score" data-cid="' + c.id + '" min="1" max="100" step="1" ' +
        'inputmode="numeric" placeholder="1–100" style="width:100%" value="' + esc(prev[c.id] != null ? prev[c.id] : '') + '"></td></tr>').join('');
    const body = '<div class="ra-form">' +
      // min-width:0 — ל-.tbl יש min-width:560px גלובלי, והמודאל צר ממנו (520px) → עמודת הציון נחתכה
      '<table class="tbl" style="min-width:0"><thead><tr><th>קטגוריה</th><th style="width:110px">ציון 1–100</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<label class="fld fld-wide" style="margin-top:10px"><span>הערה</span><textarea class="inp mb0" id="ra_note" rows="2"></textarea></label>' +
      (last ? '<div class="tl-note" style="font-size:.82rem;margin-top:6px">הערכה קודמת: ' + esc(last.assessed_on || '') + '</div>' : '') +
      '</div>';
    window.UI.modal({
      title: 'מעקב קריאה — ' + esc(window.UI.fullName(student)),
      bodyHTML: body, saveLabel: 'אישור',
      onSave: async (m) => {
        const sc = {};
        let bad = false;
        m.querySelectorAll('.ra-score').forEach(s => {
          const raw = String(s.value || '').trim();
          if (!raw) return;
          const n = Number(raw);
          // ולידציה בצד-לקוח: מספר שלם 1–100 בלבד (input=number לא חוסם הקלדה חופשית בכל דפדפן)
          if (!isFinite(n) || !Number.isInteger(n) || n < 1 || n > 100) { bad = true; return; }
          sc[s.dataset.cid] = n;
        });
        if (bad) { window.UI.toast('ציון חייב להיות מספר שלם בין 1 ל-100', 'err'); return false; }
        if (!Object.keys(sc).length) { window.UI.toast('נא למלא לפחות ציון אחד', 'err'); return false; }
        const note = (m.querySelector('#ra_note').value || '').trim();
        const r = await window.store.add('reading_assessments', { student_id: student.id, scores: sc, note: note || null });
        if (!r.ok) { window.UI.toast('שגיאה: ' + (r.error || ''), 'err'); return false; }
        window.UI.toast('נשמר מעקב קריאה'); if (onSaved) onSaved(); return true;
      },
    });
  }

  // ── סקשן לכרטיס התלמיד (מקבל קטגוריות + הערכות שכבר נטענו) ──
  function cardSection(catsList, assessments) {
    if (!assessments || !assessments.length) return '';
    const last = assessments[0];
    const sc = last.scores || {};
    const items = (catsList || []).map(c => sc[c.id] != null
      ? '<div class="det-row"><span class="det-lbl">' + esc(c.name) + '</span><span class="det-val">' + esc(sc[c.id]) + '</span></div>' : '').join('');
    if (!items) return '';
    return '<div class="det-sec"><h4><i class="bi bi-book-half"></i> מעקב קריאה <span class="det-badge">' + esc(last.assessed_on || '') + '</span></h4>' +
      items + (last.note ? '<div class="tl-note" style="font-size:.82rem;padding:4px 2px">' + esc(last.note) + '</div>' : '') + '</div>';
  }

  // ── מסך פר-כיתה: טבלת תלמידים × קטגוריות (ציון אחרון) ──
  async function renderPage(target) {
    target.innerHTML = '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>מעקב קריאה</h2>' +
      '<div class="head-actions">' + (isAdmin() ? '<button class="btn-ghost sm" id="raCats"><i class="bi bi-gear"></i> קטגוריות</button>' : '') + '</div></div>' +
      '<div class="toolbar"><select class="inp mb0" id="raClass"><option value="">בחר כיתה…</option></select></div>' +
      '<div id="raGrid" class="table-wrap"></div>';
    const [classes, cs, students] = await Promise.all([
      window.store.list('classes'), cats(),
      (window.cv3Students ? window.cv3Students.getStudents() : window.store.list('students')),
    ]);
    const sel = target.querySelector('#raClass');
    sel.innerHTML = '<option value="">בחר כיתה…</option>' + classes.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
    const cg = target.querySelector('#raCats'); if (cg) cg.addEventListener('click', () => editCategories());

    async function drawGrid(classId) {
      const grid = target.querySelector('#raGrid');
      if (!classId) { grid.innerHTML = '<div class="empty-state"><i class="bi bi-book"></i><div>בחר כיתה להצגת מעקב הקריאה</div></div>'; return; }
      const kids = students.filter(s => String(s.class_id) === String(classId));
      const all = await Promise.all(kids.map(async k => ({ s: k, a: (await forStudent(k.id))[0] })));
      const head = '<tr><th>תלמיד</th>' + cs.map(c => '<th>' + esc(c.name) + '</th>').join('') + '<th></th></tr>';
      const rows = all.map(({ s, a }) => {
        const sc = (a && a.scores) || {};
        return '<tr><td>' + esc(window.UI.fullName(s)) + '</td>' +
          cs.map(c => '<td>' + (sc[c.id] != null ? '<b>' + esc(sc[c.id]) + '</b>' : '<span style="color:var(--muted)">—</span>') + '</td>').join('') +
          '<td class="row-act"><button class="mini" data-add="' + s.id + '" title="הערכה חדשה"><i class="bi bi-plus-lg"></i></button></td></tr>';
      }).join('');
      grid.innerHTML = '<table class="tbl"><thead>' + head + '</thead><tbody>' + (rows || '<tr><td colspan="' + (cs.length + 2) + '">אין תלמידים בכיתה</td></tr>') + '</tbody></table>';
      grid.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
        const st = kids.find(k => String(k.id) === b.dataset.add);
        if (st) openAssessment(st, () => drawGrid(classId));
      }));
    }
    sel.addEventListener('change', () => drawGrid(sel.value));
    drawGrid('');
  }

  // ── עורך עמודות/קטגוריות מעקב הקריאה (מנהל) ──
  // נגיש גם מהמסך "מעקב קריאה" וגם מ"הגדרות והרשאות" (בקשת עמנואל 2026-08-19).
  // הוספה / שינוי שם / סדר עמודות / כיבוי עמודה בלי לאבד ציונים היסטוריים.
  async function editCategories(onSaved) {
    const cs = (await window.store.list('reading_categories')).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
    const ROW_CSS = 'display:flex;flex-direction:row;align-items:center;gap:6px;margin-bottom:8px';
    const rowHtml = (c) => '<div class="rc-row" data-id="' + esc(c.id) + '" style="' + ROW_CSS + '">' +
      '<button type="button" class="mini rc-up" title="הזז למעלה"><i class="bi bi-arrow-up"></i></button>' +
      '<button type="button" class="mini rc-down" title="הזז למטה"><i class="bi bi-arrow-down"></i></button>' +
      '<input class="inp mb0 rc-name" value="' + esc(c.name || '') + '" placeholder="שם העמודה" style="flex:1">' +
      '<label style="font-size:.8rem;white-space:nowrap;display:flex;align-items:center;gap:4px;font-weight:600"><input type="checkbox" class="rc-active"' + (c.active !== false ? ' checked' : '') + '> פעיל</label>' +
      '<button type="button" class="mini danger rc-del" title="מחיקה"><i class="bi bi-trash"></i></button></div>';
    const body = '<p class="login-hint" style="margin:0 0 8px">אלו העמודות במסך "מעקב קריאה". אפשר להוסיף עמודות, לשנות שמות ולסדר. ' +
      'עמודה שאינה "פעילה" נעלמת מהטבלה אך הציונים שכבר נרשמו נשמרים.</p>' +
      '<div id="rcList">' + cs.map(rowHtml).join('') + '</div>' +
      '<button type="button" class="btn-ghost sm" id="rcAdd" style="margin-top:6px"><i class="bi bi-plus-lg"></i> עמודה חדשה</button>';

    const removed = [];      // מזהים קיימים שסומנו למחיקה — נמחקים רק בשמירה
    let newSeq = 0;
    const m = window.UI.modal({
      title: 'עמודות מעקב קריאה', bodyHTML: body, saveLabel: 'שמירה',
      onSave: async (mel) => {
        const rows = [...mel.querySelectorAll('#rcList .rc-row')];
        const names = rows.map(el => (el.querySelector('.rc-name').value || '').trim()).filter(Boolean);
        if (!names.length) { window.UI.toast('צריכה להישאר לפחות עמודה אחת', 'err'); return false; }
        if (new Set(names).size !== names.length) { window.UI.toast('יש שמות עמודות כפולים', 'err'); return false; }
        let order = 1, failed = 0;
        for (const el of rows) {
          const id = el.dataset.id;
          const name = (el.querySelector('.rc-name').value || '').trim();
          const active = el.querySelector('.rc-active').checked;
          if (!name) continue;
          const r = String(id).indexOf('new') === 0
            ? await window.store.add('reading_categories', { name, active, sort_order: order })
            : await window.store.update('reading_categories', Number(id), { name, active, sort_order: order });
          // RLS חוסם בשקט: אין error אבל גם לא חוזרת שורה. בלי הבדיקה הזו "נשמר" היה שקר.
          if (!r || r.ok === false || (Array.isArray(r.data) && !r.data.length && !r.demo)) failed++;
          order++;
        }
        for (const id of removed) { const r = await window.store.remove('reading_categories', Number(id)); if (r && r.ok === false) failed++; }
        // כשל שמירה שקט הוא בדיוק מה שגרם ל"לא עודכן" בעבר — מדווחים אותו
        if (failed) { window.UI.toast('חלק מהעמודות לא נשמרו (' + failed + ') — ייתכן שאין הרשאת מנהל', 'err'); return false; }
        window.UI.toast('העמודות עודכנו');
        if (onSaved) onSaved();
        return true;
      },
    });

    // חיווט בתוך אלמנט המודאל עצמו (לא document) — מונע התנגשות עם מודאל אחר פתוח
    const el = m.el, list = el.querySelector('#rcList');
    function wireRow(row) {
      row.querySelector('.rc-del').addEventListener('click', async () => {
        const id = row.dataset.id;
        if (String(id).indexOf('new') !== 0) {
          if (!await window.UI.confirm('למחוק את העמודה "' + esc((row.querySelector('.rc-name').value || '').trim()) + '"? ציונים שכבר נרשמו בעמודה זו לא יוצגו יותר.')) return;
          removed.push(id);
        }
        row.remove();
      });
      row.querySelector('.rc-up').addEventListener('click', () => { const p = row.previousElementSibling; if (p) list.insertBefore(row, p); });
      row.querySelector('.rc-down').addEventListener('click', () => { const n = row.nextElementSibling; if (n) list.insertBefore(n, row); });
    }
    list.querySelectorAll('.rc-row').forEach(wireRow);
    el.querySelector('#rcAdd').addEventListener('click', () => {
      const wrap = document.createElement('div');
      wrap.className = 'rc-row';
      wrap.dataset.id = 'new' + (++newSeq);      // מונה רץ — Date.now() נתן מזהים כפולים בהוספה מהירה
      wrap.style.cssText = ROW_CSS;
      wrap.innerHTML = '<button type="button" class="mini rc-up" title="הזז למעלה"><i class="bi bi-arrow-up"></i></button>' +
        '<button type="button" class="mini rc-down" title="הזז למטה"><i class="bi bi-arrow-down"></i></button>' +
        '<input class="inp mb0 rc-name" placeholder="שם העמודה" style="flex:1">' +
        '<label style="font-size:.8rem;white-space:nowrap;display:flex;align-items:center;gap:4px;font-weight:600"><input type="checkbox" class="rc-active" checked> פעיל</label>' +
        '<button type="button" class="mini danger rc-del" title="הסר"><i class="bi bi-trash"></i></button>';
      list.appendChild(wrap);
      wireRow(wrap);
      wrap.querySelector('.rc-name').focus();
    });
  }

  window.cv3ReadAssess = { openAssessment, cats, forStudent, cardSection, editCategories };
  window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  window.PAGE_RENDERERS.readassess = renderPage;
})();
