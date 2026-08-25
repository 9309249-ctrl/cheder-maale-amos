// reading-assess.js — מעקב קריאה מובנה (הוספה 2026-08-17, בקשת עמנואל).
// 2026-08-19: הציון נכתב חופשי 1–100 במקום בחירה 1–10; עריכת עמודות גם מ"הגדרות והרשאות".
// 2026-08-20: שורת "ממוצע כיתתי" בתחתית טבלת הכיתה.
// 2026-08-21 — מבנה הרבנית חרלפ (READING_ASSESS_SPEC.md):
//   * הקטגוריות הן **עץ** בן 3 רמות (כותרת ראשית → כותרת משנה → פריט) דרך `parent_id`.
//   * שתי שכבות גיל (`band`: low = א-ב, high = ג ומעלה); הכיתה נושאת `reading_band`.
//   * לכל פריט: **תאריך העברה + תקין/לא תקין**, ו**לצידם** ציון 1–100 אופציונלי (החלטת יוסף 21/08).
//   * ערך פריט נשמר כאובייקט {ok,d,v}. מספר חשוף = פורמט ישן (ציון בלבד) וממשיך לעבוד.
//   * מצב התלמיד מחושב ע"י **מיזוג כל ההערכות** לפי פריט (הערכה חדשה מעדכנת רק את מה שנבדק בה),
//     כי חרלפ ביקשה תאריך נפרד לכל פריט — פריטים נבדקים בתאריכים שונים.
// לא נוגע בסקשן "קידום קריאה" (reading) הקיים.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isAdmin = () => !!(window.currentUser && window.currentUser.role === 'מנהל');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // ── ערך פריט: {ok:true|false|null, d:'YYYY-MM-DD'|null, v:1..100|null} ──
  // תאימות לאחור: ערך מספרי חשוף = ציון ישן בלי תקין/תאריך.
  function normVal(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'object') {
      const v = raw.v == null || raw.v === '' ? null : Number(raw.v);
      return { ok: raw.ok === true ? true : raw.ok === false ? false : null, d: raw.d || null, v: isFinite(v) ? v : null };
    }
    const n = Number(raw);
    return isFinite(n) ? { ok: null, d: null, v: n } : null;
  }
  const isEmptyVal = v => !v || (v.ok == null && v.v == null);

  // ── קטגוריות ועץ ──
  async function cats() {
    const list = await window.store.list('reading_categories');
    return (list || []).filter(c => c.active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
  }
  // בונה עץ מרשימה שטוחה. band ריק = הכל (תאימות לדמו ולנתונים ישנים בלי band).
  function buildTree(list, band, includeInactive) {
    const inBand = c => !band || !c.band || c.band === 'all' || c.band === band;
    const rows = (list || []).filter(c => (includeInactive || c.active !== false) && inBand(c))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
    const kids = {};
    rows.forEach(c => { const k = c.parent_id || 0; (kids[k] = kids[k] || []).push(c); });
    const seen = {};
    const build = (pid, depth) => (kids[pid] || []).map(c => {
      if (seen[c.id] || depth > 6) return null;            // הגנה מפני מעגל parent_id
      seen[c.id] = 1;
      return { id: c.id, name: c.name, depth: depth, children: build(c.id, depth + 1) };
    }).filter(Boolean);
    return build(0, 0);
  }
  // עלים = פריטים מדידים בפועל (צומת בלי ילדים). כותרת בלי ילדים היא בעצמה פריט (למשל "הכתבה").
  function leavesOf(node, path) {
    path = path || [];
    if (!node.children.length) return [Object.assign({}, node, { path: path })];
    const p = path.concat([node.name]);
    return node.children.reduce((acc, ch) => acc.concat(leavesOf(ch, p)), []);
  }
  const allLeaves = roots => roots.reduce((acc, r) => acc.concat(leavesOf(r)), []);

  async function forStudent(sid) {
    const list = await window.store.byStudent('reading_assessments', sid);
    return (list || []).slice().sort((a, b) => String(b.assessed_on || '').localeCompare(String(a.assessed_on || '')) || b.id - a.id);
  }
  // מיזוג כל ההערכות (מהישנה לחדשה) → המצב העדכני של כל פריט בנפרד.
  function merged(assessments) {
    const out = {};
    (assessments || []).slice().reverse().forEach(a => {
      const sc = a.scores || {};
      Object.keys(sc).forEach(cid => {
        // {x:1} = "נמחק" — המורה ביטל סימון קיים. בלי זה ביטול סימון לא היה משפיע כלום,
        // כי הערך פשוט לא נכתב בהערכה החדשה והערך הישן היה ממשיך לגבור.
        if (sc[cid] && typeof sc[cid] === 'object' && sc[cid].x) { delete out[cid]; return; }
        const v = normVal(sc[cid]);
        if (!isEmptyVal(v)) out[cid] = { ok: v.ok, v: v.v, d: v.d || a.assessed_on || null };
      });
    });
    return out;
  }

  // ── שכבת הגיל של כיתה ──
  function bandOfClass(cls) {
    if (cls && cls.reading_band) return cls.reading_band;
    const n = String((cls && cls.name) || '');
    return (n.indexOf('כיתה א') > -1 || n.indexOf('כיתה ב') > -1) ? 'low' : 'high';
  }

  // ── טופס הערכה: עץ מלא, לכל פריט תקין/לא תקין + תאריך + ציון ──
  async function openAssessment(student, onSaved, bandHint) {
    const list = await window.store.list('reading_categories');
    let band = bandHint;
    if (!band) {
      const classes = await window.store.list('classes');
      band = bandOfClass((classes || []).find(c => String(c.id) === String(student.class_id)));
    }
    const roots = buildTree(list, band);
    if (!roots.length) { window.UI.toast('אין פריטי מעקב קריאה לשכבה הזו. הוסף ב"הגדרות והרשאות".', 'err'); return; }
    const prev = merged(await forStudent(student.id));

    const seg = (cid, cur) =>
      '<span class="ra-seg" data-cid="' + cid + '">' +
        '<button type="button" data-v="1" class="' + (cur === true ? 'on' : '') + '">תקין</button>' +
        '<button type="button" data-v="0" class="' + (cur === false ? 'on' : '') + '">לא תקין</button></span>';

    function rowsHTML(nodes) {
      return nodes.map(n => {
        if (n.children.length) {
          return '<div class="ra-h ra-h' + Math.min(n.depth, 2) + '">' + esc(n.name) + '</div>' + rowsHTML(n.children);
        }
        const v = prev[n.id] || {};
        return '<div class="ra-leaf" data-cid="' + n.id + '" data-ok="' + (v.ok === true ? '1' : v.ok === false ? '0' : '') + '">' +
          '<span class="ra-leaf-name">' + esc(n.name) + '</span>' +
          '<span class="ra-ctl">' + seg(n.id, v.ok) +
            '<input type="date" class="inp mb0 ra-date" value="' + esc(v.d || '') + '" title="תאריך העברה">' +
            '<input type="number" class="inp mb0 ra-score" min="1" max="100" step="1" inputmode="numeric" ' +
              'placeholder="ציון" title="ציון 1–100 (לא חובה)" value="' + esc(v.v != null ? v.v : '') + '">' +
          '</span></div>';
      }).join('');
    }

    const body = '<div class="ra-form">' +
      '<p class="login-hint" style="margin:0 0 8px">לכל פריט: סמן <b>תקין</b> או <b>לא תקין</b>, ורשום את <b>תאריך ההעברה</b>. ' +
      'שדה הציון (1–100) הוא רשות. פריט שלא נגעת בו נשאר כפי שהיה בהערכה קודמת.</p>' +
      '<div class="ra-tree">' + rowsHTML(roots) + '</div>' +
      '<label class="fld fld-wide" style="margin-top:10px"><span>הערה</span><textarea class="inp mb0" id="ra_note" rows="2"></textarea></label>' +
      '</div>';

    const m = window.UI.modal({
      title: 'מעקב קריאה — ' + esc(window.UI.fullName(student)),
      bodyHTML: body, saveLabel: 'אישור',
      onSave: async (el) => {
        const sc = {};
        let bad = false, n = 0;
        el.querySelectorAll('.ra-leaf').forEach(row => {
          const cid = row.dataset.cid;
          const okRaw = row.dataset.ok;
          const dEl = row.querySelector('.ra-date'), sEl = row.querySelector('.ra-score');
          const raw = String(sEl.value || '').trim();
          let v = null;
          if (raw) {
            const num = Number(raw);
            // ולידציה בצד-לקוח: input=number לא חוסם הקלדה חופשית בכל דפדפן
            if (!isFinite(num) || !Number.isInteger(num) || num < 1 || num > 100) { bad = true; return; }
            v = num;
          }
          const ok = okRaw === '1' ? true : okRaw === '0' ? false : null;
          if (ok == null && v == null) {
            // פריט שלא נגעו בו — לא נשמר. אבל אם היה לו ערך קודם והמורה ניקה אותו, רושמים מחיקה מפורשת.
            if (prev[cid]) { sc[cid] = { x: 1 }; n++; }
            return;
          }
          sc[cid] = { ok: ok, d: dEl.value || today(), v: v };
          n++;
        });
        if (bad) { window.UI.toast('ציון חייב להיות מספר שלם בין 1 ל-100', 'err'); return false; }
        if (!n) { window.UI.toast('נא לסמן לפחות פריט אחד', 'err'); return false; }
        const note = (el.querySelector('#ra_note').value || '').trim();
        const r = await window.store.add('reading_assessments', { student_id: student.id, scores: sc, note: note || null });
        if (!r.ok) { window.UI.toast('שגיאה: ' + (r.error || ''), 'err'); return false; }
        window.UI.toast('נשמר מעקב קריאה'); if (onSaved) onSaved(); return true;
      },
    });
    m.el.style.maxWidth = '780px';
    // סימון תקין/לא תקין: לחיצה חוזרת מבטלת. סימון ממלא תאריך היום אם ריק.
    m.el.querySelectorAll('.ra-seg').forEach(sg => sg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const row = sg.closest('.ra-leaf'), want = b.dataset.v;
      const cur = row.dataset.ok;
      row.dataset.ok = cur === want ? '' : want;
      sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === row.dataset.ok));
      const d = row.querySelector('.ra-date');
      if (row.dataset.ok && !d.value) d.value = today();
    }));
  }

  // ── סקשן לכרטיס התלמיד: סיכום לפי כותרת ראשית ──
  function cardSection(catsList, assessments) {
    if (!assessments || !assessments.length) return '';
    const state = merged(assessments);
    const roots = buildTree(catsList, null);
    const items = roots.map(r => {
      const lv = leavesOf(r);
      const marked = lv.filter(l => state[l.id] && state[l.id].ok != null);
      if (!marked.length) return '';
      const ok = marked.filter(l => state[l.id].ok === true).length;
      const last = marked.map(l => state[l.id].d).filter(Boolean).sort().pop();
      return '<div class="det-row"><span class="det-lbl">' + esc(r.name) + '</span><span class="det-val">' +
        ok + '/' + marked.length + ' תקין' + (last ? ' <span style="color:var(--muted);font-weight:400">· ' + esc(last) + '</span>' : '') +
        '</span></div>';
    }).join('');
    if (!items) return '';
    const note = (assessments[0] || {}).note;
    // מי העביר את ההערכות — ההערכות ממוזגות פר-פריט, ולכן מוצגת רשימת המעריכים ולא שם אחד.
    let byLine = '';
    if (window.Author) {
      const uids = [...new Set(assessments.map(a => a.created_by).filter(Boolean))];
      if (uids.length) byLine = '<div class="det-row"><span class="det-lbl">הועבר ע"י</span><span class="det-val">' +
        uids.map(u => window.Author.chip(u)).join(' ') + '</span></div>';
    }
    return '<div class="det-sec"><h4><i class="bi bi-book-half"></i> מעקב קריאה</h4>' + items + byLine +
      (note ? '<div class="tl-note" style="font-size:.82rem;padding:4px 2px">' + esc(note) + '</div>' : '') + '</div>';
  }

  // ── מסך פר-כיתה ──
  async function renderPage(target) {
    target.innerHTML = '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>מעקב קריאה</h2>' +
      '<div class="head-actions">' + (isAdmin() ? '<button class="btn-ghost sm" id="raCats"><i class="bi bi-gear"></i> פריטי המעקב</button>' : '') + '</div></div>' +
      '<div class="toolbar"><select class="inp mb0" id="raClass"><option value="">בחר כיתה…</option></select>' +
      '<label class="ra-toggle"><input type="checkbox" id="raDetail"> תצוגה מפורטת (כל הפריטים)</label></div>' +
      '<div id="raGrid" class="table-wrap"></div>';
    const [classes, catList, students] = await Promise.all([
      window.store.list('classes'), window.store.list('reading_categories'),
      (window.cv3Students ? window.cv3Students.getStudents() : window.store.list('students')),
    ]);
    const sel = target.querySelector('#raClass');
    sel.innerHTML = '<option value="">בחר כיתה…</option>' + classes.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
    const cg = target.querySelector('#raCats'); if (cg) cg.addEventListener('click', () => editCategories(() => drawGrid(sel.value)));
    const detail = target.querySelector('#raDetail');

    // תא ממוצע: אחוז "תקין" מתוך מה שנבדק, + ממוצע ציונים אם נרשמו.
    // תלמיד שלא נבדק אינו נספר (הוא לא "לא תקין"), אחרת כיתה בתחילת הזנה נראית כושלת.
    function aggCell(pairs) {
      const marked = pairs.filter(p => p && p.ok != null);
      const scores = pairs.filter(p => p && p.v != null).map(p => p.v);
      if (!marked.length && !scores.length) return '<td><span style="color:var(--muted)">—</span></td>';
      let html = '';
      if (marked.length) {
        const ok = marked.filter(p => p.ok === true).length;
        const pct = Math.round(ok * 100 / marked.length);
        html += '<b>' + pct + '%</b> <span class="ra-n">(' + marked.length + ')</span>';
      }
      if (scores.length) {
        const avg = Math.round(scores.reduce((t, v) => t + v, 0) / scores.length * 10) / 10;
        const mixed = scores.some(v => v <= 10) && scores.some(v => v > 10);
        html += '<div class="ra-n">ממוצע ציון ' + avg +
          (mixed ? ' <i class="bi bi-exclamation-triangle-fill" title="בעמודה יש גם ציונים בסולם הישן 1–10" style="color:#e0a800"></i>' : '') + '</div>';
      }
      return '<td>' + html + '</td>';
    }

    async function drawGrid(classId) {
      const grid = target.querySelector('#raGrid');
      if (!classId) { grid.innerHTML = '<div class="empty-state"><i class="bi bi-book"></i><div>בחר כיתה להצגת מעקב הקריאה</div></div>'; return; }
      const cls = classes.find(c => String(c.id) === String(classId));
      const band = bandOfClass(cls);
      const roots = buildTree(catList, band);
      const kids = students.filter(s => String(s.class_id) === String(classId));
      const all = await Promise.all(kids.map(async k => ({ s: k, state: merged(await forStudent(k.id)) })));
      if (!roots.length) { grid.innerHTML = '<div class="empty-state"><i class="bi bi-book"></i><div>אין פריטי מעקב מוגדרים לשכבה הזו</div></div>'; return; }

      const detailed = detail.checked;
      const cols = detailed ? allLeaves(roots) : roots;      // עמודות: פריטים או כותרות ראשיות
      let head;
      if (detailed) {
        head = '<tr><th rowspan="2">תלמיד</th>' +
          roots.map(r => '<th colspan="' + leavesOf(r).length + '" class="ra-grp">' + esc(r.name) + '</th>').join('') +
          '<th rowspan="2"></th></tr><tr>' +
          cols.map(l => '<th title="' + esc(l.path.join(' ← ')) + '">' +
            (l.path.length > 1 ? '<span class="ra-n">' + esc(l.path[l.path.length - 1]) + '</span><br>' : '') + esc(l.name) + '</th>').join('') + '</tr>';
      } else {
        head = '<tr><th>תלמיד</th>' + roots.map(r => '<th>' + esc(r.name) + ' <span class="ra-n">(' + leavesOf(r).length + ')</span></th>').join('') + '<th></th></tr>';
      }

      // ערכי התא לכל תלמיד/עמודה
      const cellVals = (state, col) => detailed ? [state[col.id] || null] : leavesOf(col).map(l => state[l.id] || null);
      const rows = all.map(({ s, state }) => {
        return '<tr><td>' + esc(window.UI.fullName(s)) + '</td>' +
          cols.map(col => {
            const vals = cellVals(state, col).filter(v => v && (v.ok != null || v.v != null));
            if (!vals.length) return '<td><span style="color:var(--muted)">—</span></td>';
            if (detailed) {
              const v = vals[0];
              const mark = v.ok === true ? '<span class="ra-ok-i" title="תקין">✓</span>'
                : v.ok === false ? '<span class="ra-bad-i" title="לא תקין">✗</span>' : '';
              return '<td title="' + esc(v.d || '') + '">' + mark + (v.v != null ? ' <b>' + esc(v.v) + '</b>' : '') + '</td>';
            }
            const marked = vals.filter(v => v.ok != null);
            if (!marked.length) return '<td><span style="color:var(--muted)">—</span></td>';
            const ok = marked.filter(v => v.ok === true).length;
            const total = leavesOf(col).length;
            const cl = ok === marked.length ? 'ra-ok-i' : ok === 0 ? 'ra-bad-i' : '';
            return '<td title="' + ok + ' תקין מתוך ' + marked.length + ' שנבדקו, ' + total + ' פריטים בסך הכל">' +
              '<b class="' + cl + '">' + ok + '/' + marked.length + '</b>' +
              (marked.length < total ? ' <span class="ra-n">מתוך ' + total + '</span>' : '') + '</td>';
          }).join('') +
          '<td class="row-act"><button class="mini" data-add="' + s.id + '" title="הערכה חדשה"><i class="bi bi-plus-lg"></i></button></td></tr>';
      }).join('');

      // ── שורת "ממוצע כיתתי" (בקשת עמנואל 20/08) ──
      const footCells = cols.map(col => {
        const pairs = [];
        all.forEach(({ state }) => cellVals(state, col).forEach(v => { if (v) pairs.push(v); }));
        return aggCell(pairs);
      }).join('');
      const anyData = all.some(({ state }) => Object.keys(state).length);
      const foot = anyData ? '<tfoot><tr><td>ממוצע כיתתי</td>' + footCells + '<td></td></tr></tfoot>' : '';

      grid.innerHTML = '<table class="tbl' + (detailed ? ' ra-detailed' : '') + '"><thead>' + head + '</thead><tbody>' +
        (rows || '<tr><td colspan="' + (cols.length + 2) + '">אין תלמידים בכיתה</td></tr>') + '</tbody>' + foot + '</table>';
      grid.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
        const st = kids.find(k => String(k.id) === b.dataset.add);
        if (st) openAssessment(st, () => drawGrid(classId), band);
      }));
    }
    sel.addEventListener('change', () => drawGrid(sel.value));
    detail.addEventListener('change', () => drawGrid(sel.value));
    drawGrid('');
  }

  // ── עורך פריטי המעקב (מנהל) — עץ בן 3 רמות, לשכבה אחת בכל פעם ──
  async function editCategories(onSaved) {
    const list = await window.store.list('reading_categories');
    let band = 'low';

    const rowInner = (c) =>
      '<button type="button" class="mini rc-up" title="הזז למעלה"><i class="bi bi-arrow-up"></i></button>' +
      '<button type="button" class="mini rc-down" title="הזז למטה"><i class="bi bi-arrow-down"></i></button>' +
      '<button type="button" class="mini rc-in" title="הפוך לתת-סעיף"><i class="bi bi-arrow-bar-left"></i></button>' +
      '<button type="button" class="mini rc-out" title="העלה רמה"><i class="bi bi-arrow-bar-right"></i></button>' +
      '<input class="inp mb0 rc-name" value="' + esc(c.name || '') + '" placeholder="שם הפריט" style="flex:1">' +
      '<label class="rc-act"><input type="checkbox" class="rc-active"' + (c.active !== false ? ' checked' : '') + '> פעיל</label>' +
      '<button type="button" class="mini danger rc-del" title="מחיקה"><i class="bi bi-trash"></i></button>';
    const rowHtml = (c, depth) => '<div class="rc-row" data-id="' + esc(c.id) + '" data-depth="' + depth +
      '" style="margin-right:' + (depth * 18) + 'px">' + rowInner(c) + '</div>';

    // שיטוח העץ לרשימה עם עומק — זה מה שהעורך מציג ומה שממנו מחושבים ההורים בשמירה.
    function flatten(bandSel) {
      // התאמת band **מדויקת**: העמודות השטוחות הישנות (band='all', מושבתות) לא שייכות לאף שכבה.
      // בלעדי זה הן הופיעו בשתי השכבות, ושמירה הייתה כותבת להן band='low'/'high' והורסת אותן.
      const own = (list || []).filter(c => (c.band || 'all') === bandSel);
      const roots = buildTree(own, null, true);          // includeInactive — אחרת אי אפשר להחזיר פריט מושבת
      const out = [];
      const walk = (nodes, depth) => nodes.forEach(n => {
        const src = list.find(c => String(c.id) === String(n.id)) || n;
        out.push({ c: src, depth: depth }); walk(n.children, depth + 1);
      });
      walk(roots, 0);
      return out;
    }

    const body = '<p class="login-hint" style="margin:0 0 8px">מבנה המעקב לפי הרבנית חרלפ: <b>כותרת ראשית</b> ← כותרת משנה ← פריט. ' +
      'פריט בלי תת-סעיפים הוא מה שמסמנים עליו תקין/לא תקין. השתמש בחיצי ההזחה כדי לקבוע רמה. ' +
      'פריט לא-"פעיל" נעלם מהמסך אך הנתונים שנרשמו בו נשמרים.</p>' +
      '<div class="fld fld-wide" style="margin-bottom:8px"><span>שכבה</span>' +
      '<select class="inp mb0" id="rcBand"><option value="low">כיתות א׳–ב׳</option><option value="high">כיתות ג׳ ומעלה</option></select></div>' +
      '<div id="rcList"></div>' +
      '<button type="button" class="btn-ghost sm" id="rcAdd" style="margin-top:6px"><i class="bi bi-plus-lg"></i> פריט חדש</button>';

    const removed = [];      // מזהים קיימים שסומנו למחיקה — נמחקים רק בשמירה
    let newSeq = 0;
    const m = window.UI.modal({
      title: 'פריטי מעקב הקריאה', bodyHTML: body, saveLabel: 'שמירה',
      onSave: async (mel) => {
        const rows = [...mel.querySelectorAll('#rcList .rc-row')];
        const names = rows.map(el => (el.querySelector('.rc-name').value || '').trim()).filter(Boolean);
        if (!names.length) { window.UI.toast('צריך להישאר לפחות פריט אחד', 'err'); return false; }
        // שמות כפולים מותרים כאן בכוונה ("מהירות"/"דיוק" חוזרים תחת כותרות שונות) — הייחוד הוא המסלול.
        const stack = [];        // stack[depth] = מזהה אמיתי של ההורה ברמה הזו
        let order = 1, failed = 0;
        for (const el of rows) {
          const name = (el.querySelector('.rc-name').value || '').trim();
          if (!name) continue;
          const depth = Number(el.dataset.depth || 0);
          const active = el.querySelector('.rc-active').checked;
          const parent = depth > 0 ? (stack[depth - 1] || null) : null;
          const id = el.dataset.id;
          const patch = { name: name, active: active, sort_order: order, band: band, parent_id: parent };
          let realId = null;
          if (String(id).indexOf('new') === 0) {
            const r = await window.store.add('reading_categories', patch);
            realId = r && r.data && r.data[0] ? r.data[0].id : (r && r.demo ? id : null);
            if (!r || r.ok === false || (!realId && !r.demo)) failed++;
          } else {
            const r = await window.store.update('reading_categories', Number(id), patch);
            // RLS חוסם בשקט: אין error אבל גם לא חוזרת שורה. בלי הבדיקה הזו "נשמר" היה שקר.
            if (!r || r.ok === false || (Array.isArray(r.data) && !r.data.length && !r.demo)) failed++;
            realId = Number(id);
          }
          stack[depth] = realId;
          stack.length = depth + 1;
          order++;
        }
        for (const id of removed) { const r = await window.store.remove('reading_categories', Number(id)); if (r && r.ok === false) failed++; }
        if (failed) { window.UI.toast('חלק מהפריטים לא נשמרו (' + failed + ') — ייתכן שאין הרשאת מנהל', 'err'); return false; }
        window.UI.toast('פריטי המעקב עודכנו');
        if (onSaved) onSaved();
        return true;
      },
    });
    m.el.style.maxWidth = '720px';

    const el = m.el, listEl = el.querySelector('#rcList');
    function wireRow(row) {
      const setDepth = d => { row.dataset.depth = d; row.style.marginRight = (d * 18) + 'px'; };
      row.querySelector('.rc-del').addEventListener('click', async () => {
        const id = row.dataset.id;
        if (String(id).indexOf('new') !== 0) {
          if (!await window.UI.confirm('למחוק את "' + esc((row.querySelector('.rc-name').value || '').trim()) + '"? גם תתי-הסעיפים שלו והנתונים שנרשמו בהם לא יוצגו יותר.')) return;
          removed.push(id);
        }
        row.remove();
      });
      row.querySelector('.rc-up').addEventListener('click', () => { const p = row.previousElementSibling; if (p) listEl.insertBefore(row, p); });
      row.querySelector('.rc-down').addEventListener('click', () => { const n = row.nextElementSibling; if (n) listEl.insertBefore(n, row); });
      // הזחה: אפשרית רק אם יש שורה מעל ברמה מתאימה, ולא מעבר לעומק 2 (3 רמות סה"כ).
      row.querySelector('.rc-in').addEventListener('click', () => {
        const p = row.previousElementSibling; if (!p) return;
        const d = Number(row.dataset.depth || 0), pd = Number(p.dataset.depth || 0);
        if (d > pd || d >= 2) return;
        setDepth(d + 1);
      });
      row.querySelector('.rc-out').addEventListener('click', () => {
        const d = Number(row.dataset.depth || 0); if (d > 0) setDepth(d - 1);
      });
    }
    function draw() {
      listEl.innerHTML = flatten(band).map(r => rowHtml(r.c, r.depth)).join('');
      listEl.querySelectorAll('.rc-row').forEach(wireRow);
    }
    el.querySelector('#rcBand').addEventListener('change', e => { band = e.target.value; removed.length = 0; draw(); });
    el.querySelector('#rcAdd').addEventListener('click', () => {
      const wrap = document.createElement('div');
      wrap.className = 'rc-row';
      wrap.dataset.id = 'new' + (++newSeq);      // מונה רץ — Date.now() נתן מזהים כפולים בהוספה מהירה
      wrap.dataset.depth = '0';
      wrap.innerHTML = rowInner({ id: '', name: '', active: true });
      listEl.appendChild(wrap);
      wireRow(wrap);
      wrap.querySelector('.rc-name').focus();
    });
    draw();
  }

  window.cv3ReadAssess = { openAssessment, cats, forStudent, cardSection, editCategories, buildTree, merged };
  window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  window.PAGE_RENDERERS.readassess = renderPage;
})();
