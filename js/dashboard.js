// dashboard.js — חלק 6: דשבורד + דוחות + חיפוש מהיר (Ctrl+K) + ייצוא.
(function () {
  'use strict';
  const DEMO = !window.sb;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function students() { return (window.cv3Students ? await window.cv3Students.getStudents() : []); }

  async function renderReports(page) {
    const [studs, beh, att, tst, catRows, clsRows] = await Promise.all([
      students(), window.store.list('behavior_events'), window.store.list('attendance'), window.store.list('tests'), window.store.list('categories'),
      window.store.list('classes').catch(() => [])
    ]);
    const todayStr = new Date().toISOString().slice(0, 10);
    const ids = window.cv3Students ? await window.cv3Students.accessibleIds() : null;
    const sc = arr => ids ? arr.filter(r => ids.includes(r.student_id)) : arr;
    const behS = sc(beh), attS = sc(att), tstS = sc(tst);
    const stats = { students: studs.length, behavior: behS.length, attendance: attS.filter(a => a.date === todayStr && a.status === 'present').length, tests: tstS.length };
    const cats = catRows.map(c => c.name);
    const vals = catRows.map(c => behS.filter(e => e.category_id === c.id).length);
    // כרטיס ימי הולדת עבריים (בקשת עמנואל 24/08). לא מסונן לפי כיתה — במודל ההרשאות
    // של עמנואל כל הצוות רואה את כל התלמידים; רק *דיווחים* מוגבלים לכיתה.
    ensureBdayCss();
    let bdayHtml = '';
    try { bdayHtml = bdayCardHtml(scanBirthdays(studs, 13), clsRows); }
    catch (err) { console.error('bday', err); bdayHtml = ''; }
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>דשבורד ודוחות</h2>' +
      '<div class="head-actions"><button class="btn-ghost sm" id="rpExport"><i class="bi bi-download"></i> ייצוא דוח (Excel/CSV)</button>' +
      '<button class="btn-ghost sm" id="rpPrint"><i class="bi bi-printer"></i> הדפסה / PDF</button></div></div>' +
      '<div class="stat-row">' +
        statCard('bi-people-fill', stats.students, 'תלמידים') +
        statCard('bi-clipboard-check', stats.behavior, 'דיווחי התנהגות') +
        statCard('bi-calendar-check', stats.attendance, 'נוכחות היום') +
        statCard('bi-card-checklist', stats.tests, 'מבחנים') +
      '</div>' +
      bdayHtml +
      '<div class="dash-grid">' +
        '<div class="qr-card"><h3><i class="bi bi-graph-up-arrow"></i> התנהגות לפי קטגוריה</h3><canvas id="behChart" height="150"></canvas></div>' +
        '<div class="qr-card"><h3><i class="bi bi-star"></i> תלמידים לתשומת לב</h3><div id="noteList"></div></div>' +
      '</div>';
    // students to note (demo: those with status not active, or first few)
    // תלמידים עם דיווחי התנהגות אחרונים (ללא כפילויות)
    const recentIds = [...new Set(behS.slice().reverse().map(e => e.student_id))];
    const note = recentIds.map(id => studs.find(s => s.id === id)).filter(Boolean).slice(0, 4);
    page.querySelector('#noteList').innerHTML = note.length ? note.map(s =>
      '<div class="tl-item" style="margin-bottom:6px"><span class="ava">' + esc((s.name || '?').slice(0, 2)) + '</span><div class="tl-main">' + esc(s.name) + '</div></div>').join('')
      : '<div class="empty-state" style="padding:18px">אין התראות</div>';
    page.querySelector('#rpPrint').addEventListener('click', () => window.print());
    // ייצוא דוח דשבורד ל-Excel/CSV (בקשת עמנואל: בדשבורד דוחות לא היה ייצוא)
    const hebDate = iso => { if (!iso) return ''; try { return new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T00:00:00')); } catch (_) { return ''; } };
    const nameOf = id => { const s = studs.find(x => x.id == id); return s ? s.name : '—'; };
    const catName = id => { const c = catRows.find(x => x.id == id); return c ? c.name : ''; };
    page.querySelector('#rpExport').addEventListener('click', () => {
      const rows = [];
      rows.push(['סיכום דוח דשבורד']);
      rows.push(['תלמידים', stats.students], ['דיווחי התנהגות', stats.behavior], ['נוכחות היום', stats.attendance], ['מבחנים', stats.tests]);
      rows.push([]);
      rows.push(['התנהגות לפי קטגוריה']);
      cats.forEach((c, i) => rows.push([c, vals[i]]));
      rows.push([]);
      rows.push(['פירוט דיווחי התנהגות']);
      rows.push(['תלמיד', 'קטגוריה', 'תאריך', 'תאריך עברי', 'שעה', 'הערה']);
      behS.slice().reverse().forEach(e => rows.push([nameOf(e.student_id), catName(e.category_id), e.event_date || '', hebDate(e.event_date), e.event_time || '', e.note || '']));
      const csv = rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dashboard_report.csv'; a.click();
    });
    // chart
    if (window.Chart) {
      const ctx = page.querySelector('#behChart');
      new window.Chart(ctx, {
        type: 'bar',
        data: { labels: cats, datasets: [{ data: vals, backgroundColor: ['#1f8a5b', '#c0392b', '#2b7c98', '#c98a1a'], borderRadius: 6 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, maintainAspectRatio: false },
      });
    } else {
      page.querySelector('#behChart').outerHTML = '<div class="empty-state" style="padding:18px">גרף ייטען כשספריית Chart.js תהיה זמינה</div>';
    }
  }

  // ================= ימי הולדת עבריים (בקשת עמנואל, 24/08/2026) =================
  // מקור אמת ראשי: השדה החופשי `birthdate_heb` ("כ״ג אדר תשפ״ד") — זה מה שהמזכירות הזינו.
  // גיבוי: המרת `birthdate` הלועזי דרך Intl, אבל **רק אם השנה שפויה** — במסד יש רשומות
  // פגומות כמו "0202-08-28" שהיו מייצרות יום הולדת מזויף.
  const GEM = { 'א':1,'ב':2,'ג':3,'ד':4,'ה':5,'ו':6,'ז':7,'ח':8,'ט':9,'י':10,
    'כ':20,'ך':20,'ל':30,'מ':40,'ם':40,'נ':50,'ן':50,'ס':60,'ע':70,'פ':80,'ף':80,
    'צ':90,'ץ':90,'ק':100,'ר':200,'ש':300,'ת':400 };
  function gematria(str) {
    const s = String(str == null ? '' : str);
    if (!s) return 0;
    let n = 0;
    for (const ch of s) { if (GEM[ch] == null) return 0; n += GEM[ch]; }
    return n;
  }
  const stripMarks = s => String(s == null ? '' : s).replace(/["'׳״‘’“”]/g, '').trim();

  // שם חודש קנוני. כולל את הכתיבים של Intl ("חשוון","סיוון","אדר א׳") ואת אלה של המזכירות ("חשון","סיון").
  function normMonth(raw) {
    const m = stripMarks(raw).replace(/\s+/g, ' ');
    if (/^(מר)?חשו?ו?ן$/.test(m)) return 'חשוון';
    if (/^כסל[יו]?ו$/.test(m)) return 'כסלו';
    if (/^סיו?ו?ן$/.test(m)) return 'סיוון';
    if (/^נ[יי]?סן$/.test(m)) return 'ניסן';
    if (/^א[יי]?יר$/.test(m)) return 'אייר';
    if (/^(מנחם )?אב$/.test(m)) return 'אב';
    if (/^אדר ?(א|ראשון)$/.test(m)) return 'אדר א';
    if (/^אדר ?(ב|שני)$/.test(m)) return 'אדר ב';
    if (/^אדר$/.test(m)) return 'אדר';
    if (/^(תשרי|טבת|שבט|תמוז|אלול)$/.test(m)) return m;
    return null;
  }

  // התאריך העברי של יום לועזי נתון — ישירות מ-Intl. אין כאן חשבון לוח עברי משלנו, בכוונה.
  const HEB_FMT = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' });
  function hebOf(dateObj) {
    const p = HEB_FMT.formatToParts(dateObj);
    const get = t => { const x = p.find(v => v.type === t); return x ? x.value : ''; };
    return { day: parseInt(get('day'), 10), month: normMonth(get('month')),
             year: parseInt(String(get('year')).replace(/\D/g, ''), 10) || null };
  }
  // תצוגה "י״א באלול תשפ״ו". ⚠️ `numberingSystem:'hebr'` / locale `-nu-hebr` **אינם עובדים**
  // בכל מנוע (נבדק: מחזיר "11 באלול 5786"), ולכן הספרות העבריות נבנות כאן ידנית.
  const GEM_OUT = [[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],
    [50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']];
  function numToHeb(n) {
    n = Number(n); if (!n || n < 1) return '';
    let out = '';
    // ט״ו / ט״ז ולא י״ה / י״ו. ⚠️ המודולו הוא 100 ולא 20 — עם 20 המספר 775 הפך ל"תשסט״ו".
    if (n % 100 === 15) { out = 'טו'; n -= 15; }
    else if (n % 100 === 16) { out = 'טז'; n -= 16; }
    let head = '';
    GEM_OUT.forEach(pair => { while (n >= pair[0]) { head += pair[1]; n -= pair[0]; } });
    const all = head + out;
    if (!all) return '';
    if (all.length === 1) return all + '׳';
    return all.slice(0, -1) + '״' + all.slice(-1);
  }
  function hebText(d) {
    const h = hebOf(d);
    if (!h.day || !h.month) { try { return HEB_FMT.format(d); } catch (_) { return ''; } }
    const mName = h.month === 'אדר א' ? 'אדר א׳' : h.month === 'אדר ב' ? 'אדר ב׳' : h.month;
    return numToHeb(h.day) + ' ב' + mName + (h.year ? ' ' + numToHeb(h.year % 1000) : '');
  }

  // "כב שבט תשע״ה" / "י״ד תמוז תש״פ" / "ג' תשרי תש״ף" → {day,month,year}
  function parseHebBirth(txt) {
    const raw = String(txt == null ? '' : txt).trim();
    if (!raw) return null;
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    const day = gematria(stripMarks(parts[0]));
    if (!day || day > 30) return null;                     // "אדר ב' תשע״ו" — רשומה בלי יום כלל
    // החודש הוא מילה אחת ("שבט") או שתיים ("אדר ב"). מנסים את הארוך קודם.
    let month = null, rest = 1;
    if (parts.length >= 3) { const two = normMonth(parts[1] + ' ' + parts[2]); if (two) { month = two; rest = 3; } }
    if (!month) { month = normMonth(parts[1]); rest = 2; }
    if (!month) return null;
    const yNum = gematria(stripMarks(parts.slice(rest).join('')));
    return { day: day, month: month, year: yNum ? (yNum < 1000 ? 5000 + yNum : yNum) : null };
  }

  // גיבוי מהתאריך הלועזי — עם שער שפיות על השנה.
  function hebFromGreg(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso == null ? '' : iso))) return null;
    const y = +iso.slice(0, 4), nowY = new Date().getFullYear();
    if (y < 1990 || y > nowY) return null;                 // "0202-08-28" — נתון פגום, לא מנחשים
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    const h = hebOf(d);
    return (h.month && h.day) ? h : null;
  }

  const birthOf = s => parseHebBirth(s.birthdate_heb) || hebFromGreg(s.birthdate);

  // התאמת חודש. שנה מעוברת מזוהה לפי מה ש-Intl מחזיר על היום עצמו ("אדר א׳"/"אדר ב׳").
  function monthMatch(birthM, dayM) {
    if (!birthM || !dayM) return { ok: false };
    if (birthM === dayM) return { ok: true, note: '' };
    if (dayM === 'אדר') {            // שנה פשוטה — מי שנולד באדר א׳/ב׳ חוגג באדר היחיד
      if (birthM === 'אדר א' || birthM === 'אדר ב') return { ok: true, note: 'נולד ב' + birthM + '׳, והשנה אינה מעוברת' };
      return { ok: false };
    }
    // שנה מעוברת ונולד ב"אדר" סתם — מוצג באדר ב׳ (רמ״א או״ח נ״ה). אם עמנואל ירצה אדר א׳ — שינוי שורה אחת.
    if (dayM === 'אדר ב' && birthM === 'אדר') return { ok: true, note: 'נולד באדר; בשנה מעוברת מוצג באדר ב׳' };
    return { ok: false };
  }

  // סורק N ימים לועזיים קדימה ושואל את Intl מה התאריך העברי של כל אחד.
  // כך אין צורך בחשבון לוח עברי, וגם ל׳ בחודש שיש בו 29 יום נופל למקומו הנכון.
  function scanBirthdays(studs, days) {
    const withB = studs.map(s => ({ s: s, b: birthOf(s) }));
    const unparsed = withB.filter(x => !x.b).length;
    const base = new Date(); base.setHours(12, 0, 0, 0);
    const out = [];
    for (let i = 0; i <= days; i++) {
      const d = new Date(base.getTime() + i * 864e5);
      const h = hebOf(d);
      const lastOfMonth = hebOf(new Date(d.getTime() + 864e5)).month !== h.month;
      const list = [];
      withB.forEach(x => {
        if (!x.b) return;
        const mm = monthMatch(x.b.month, h.month);
        if (!mm.ok) return;
        let note = mm.note || '';
        if (x.b.day !== h.day) {
          if (!(x.b.day === 30 && h.day === 29 && lastOfMonth)) return;
          note = (note ? note + '; ' : '') + 'נולד בל׳ בחודש, והחודש הזה בן 29 יום';
        }
        list.push({ s: x.s, turns: (x.b.year && h.year) ? (h.year - x.b.year) : null, note: note });
      });
      if (list.length) out.push({ offset: i, heb: hebText(d), list: list });
    }
    return { days: out, unparsed: unparsed, todayHeb: hebText(base) };
  }

  const BDAY_CSS = '#bdayCard{background:var(--card);border:1px solid var(--line);border-radius:14px;' +
    'box-shadow:var(--shadow);padding:14px 16px;margin:2px 2px 16px}' +
    '#bdayCard h3{font-size:1rem;font-weight:800;color:var(--primary-dark);margin:0 0 10px;display:flex;align-items:center;gap:7px}' +
    '#bdayCard h3 .bi{color:#c98a1a}' +
    '#bdayCard.has-today{border-color:#e3b341;box-shadow:0 0 0 3px rgba(227,179,65,.18);background:linear-gradient(180deg,#fffaf0,var(--card))}' +
    '.bd-today{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px}' +
    '.bd-chip{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e3b341;' +
    'border-radius:12px;padding:7px 12px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.06)}' +
    '.bd-chip .ava{margin-inline-end:0}' +
    '.bd-cls{font-weight:600;font-size:.78rem;color:#667}' +
    '.bd-age{background:#c98a1a;color:#fff;border-radius:8px;padding:1px 7px;font-size:.76rem;font-weight:800}' +
    '.bd-none{padding:8px 2px 2px;color:#667;font-size:.88rem}' +
    '.bd-next{margin-top:10px;border-top:1px dashed var(--line);padding-top:9px}' +
    '.bd-next h4{font-size:.82rem;font-weight:800;color:#667;margin:0 0 6px}' +
    '.bd-row{display:flex;gap:9px;align-items:baseline;font-size:.88rem;padding:2px 0}' +
    '.bd-row b{min-width:120px;color:var(--primary-dark);white-space:nowrap}' +
    '.bd-warn{margin-top:9px;font-size:.78rem;color:#8a6d3b;background:#fcf8e3;border:1px solid #faebcc;' +
    'border-radius:9px;padding:7px 10px}' +
    'body.mode-writeonly #bdayCard{display:none !important}' +
    '@media (max-width:640px){.bd-row{flex-direction:column;gap:0}.bd-row b{min-width:0}}';
  function ensureBdayCss() {
    if (document.getElementById('bdayCss')) return;
    const st = document.createElement('style');
    st.id = 'bdayCss'; st.textContent = BDAY_CSS;
    document.head.appendChild(st);
  }

  const bdName = s => { const f = (s.family || '').trim(), n = (s.name || '').trim();
    if (!f) return n; if (!n) return f; return n.split(/\s+/).includes(f) ? n : (n + ' ' + f); };

  function bdayCardHtml(res, classes) {
    const clsOf = id => { const c = (classes || []).find(x => x.id === id); return c ? c.name : ''; };
    const today = res.days.find(d => d.offset === 0);
    const later = res.days.filter(d => d.offset > 0);
    let h = '<div id="bdayCard"' + (today ? ' class="has-today"' : '') + '>' +
      '<h3><i class="bi bi-balloon-heart-fill"></i> ימי הולדת (לפי התאריך העברי)</h3>';
    if (today) {
      h += '<div class="bd-today">' + today.list.map(x =>
        '<span class="bd-chip"' + (x.note ? ' title="' + esc(x.note) + '"' : '') + '>' +
        '<span class="ava">' + esc(bdName(x.s).slice(0, 2)) + '</span>' + esc(bdName(x.s)) +
        (clsOf(x.s.class_id) ? '<span class="bd-cls">' + esc(clsOf(x.s.class_id)) + '</span>' : '') +
        (x.turns ? '<span class="bd-age">בן ' + esc(x.turns) + '</span>' : '') +
        (x.note ? '<span class="bd-cls">*</span>' : '') + '</span>').join('') + '</div>' +
        '<div class="bd-none">היום — ' + esc(res.todayHeb) + '</div>';
    } else {
      h += '<div class="bd-none">אין יום הולדת היום (' + esc(res.todayHeb) + ').</div>';
    }
    if (later.length) {
      h += '<div class="bd-next"><h4>בימים הקרובים</h4>' + later.map(d =>
        '<div class="bd-row"><b>' + esc(d.heb) + '</b><span>' +
        esc(d.list.map(x => bdName(x.s) + (x.turns ? ' (בן ' + x.turns + ')' : '')).join(', ')) +
        '</span></div>').join('') + '</div>';
    }
    if (res.unparsed) {
      h += '<div class="bd-warn">' + esc(res.unparsed) + ' תלמידים בלי תאריך לידה עברי תקין בכרטיס — ' +
        'הם לא ייספרו כאן עד שיושלם השדה "ת. לידה עברי".</div>';
    }
    return h + '</div>';
  }

  function statCard(icon, num, label) {
    return '<div class="stat-card"><div class="stat-ic"><i class="bi ' + icon + '"></i></div>' +
      '<div class="stat-num">' + esc(num) + '</div><div class="stat-lbl">' + esc(label) + '</div></div>';
  }

  // ----- חיפוש מהיר Ctrl+K -----
  function openSearch() {
    const mods = (window.MODULES || []).filter(m => !window.Auth || window.Auth.canAccess(m.id)).map(m => ({ type: 'מסך', label: m.label, go: () => showPage(m.id) }));
    let items = mods.slice();
    students().then(ss => { items = mods.concat(ss.map(s => ({ type: 'תלמיד', label: s.name, go: () => showPage('students') }))); draw(); });
    const m = window.UI.modal({ title: 'חיפוש מהיר', bodyHTML: '<input class="inp mb0" id="qkInput" placeholder="הקלד מסך או תלמיד…" autofocus><div id="qkRes" class="qk-res"></div>' });
    const input = m.el.querySelector('#qkInput');
    function draw() {
      const q = (input.value || '').trim();
      const res = (q ? items.filter(i => i.label.includes(q)) : items).slice(0, 8);
      m.el.querySelector('#qkRes').innerHTML = res.map((i, idx) =>
        '<button class="qk-item" data-i="' + items.indexOf(i) + '"><span class="qk-type">' + i.type + '</span> ' + esc(i.label) + '</button>').join('');
      m.el.querySelectorAll('.qk-item').forEach(btn => btn.addEventListener('click', () => { items[btn.dataset.i].go(); m.close(); }));
    }
    input.addEventListener('input', draw);
    setTimeout(() => input.focus(), 30);
    draw();
  }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (window.currentUser) openSearch(); }
  });

  const R = window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  R.reports = renderReports;
})();
