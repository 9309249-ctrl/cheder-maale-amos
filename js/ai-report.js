// ai-report.js — "חוות דעת חינוכית" AI, לכל תלמיד ולכל כיתה (2026-09-07, בקשת יוסף).
//
// שונה במכוון מ-ai-assistant.js (מנוע ניקוד קבוע, רץ בדפדפן, "מי דורש מעקב"):
// כאן זה ניתוח בשפה חופשית דרך Gemini (window.cv3call, ai-proxy.js), שמיישם
// עקרונות מתוך שיטת "לא ניתן החינוך למלאכי השרת" (הרב אריה אינדורסקי) —
// לא "מה קרה" אלא "בשביל מה" ההתנהגות קורית, ומה הצעד המעשי הבא.
//
// כפתור בלבד, לא נטען אוטומטית — עמנואל ביקש (08/30) שניתוח AI לא ידחוף
// את עצמו למסך, אלא יישאר מאחורי פעולה מפורשת של המשתמש.
//
// פרטיות: הנתונים נאספים דרך window.store בשם המשתמש המחובר (RLS בשרת —
// כל מלמד רואה רק את מה שמותר לו). לניתוח נשלחים שם התלמיד ונתונים
// מצטברים (נוכחות/מעקב/מבחנים); לא ת"ז, טלפונים או תוכן רפואי.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fullName = s => (window.UI && window.UI.fullName) ? window.UI.fullName(s) : ((s && s.name) || '');

  const METHOD_PROMPT = [
    'אתה יועץ חינוכי המלווה מלמדים ומחנכים בת"ת/חיידר, על פי דרך החינוך התורנית',
    '(מבוססת על "לא ניתן החינוך למלאכי השרת", הרב אריה אינדורסקי, מכון הורני).',
    'עקרונות שעליך ליישם בניתוח:',
    '',
    '1. שאל "בשביל מה" ולא "למה" — אל תחפש רק סיבות/גורמים חיצוניים להתנהגות',
    '   חוזרת (עייפות, "קושי", "אופי"). התלמיד בטבעו רוצה להשתייך ולשתף',
    '   פעולה; דפוס חוזר הוא לרוב ניסיון לא-מודע להשיג שייכות בדרך מוטעית.',
    '2. שני סוגי שייכות מוטעית, והרמז לאבחנה הוא התגובה הרגשית של הצוות:',
    '   (א) תשומת לב עודפת — התלמיד "מרוויח" מלהיתפס כחלש/מתקשה, ומקבל',
    '   התעסקות ורחמים מוגברים. (ב) מאבק כוח — התלמיד "מרוויח" מניצחון על',
    '   הסמכות, וגורם לתסכול וחוסר אונים. שער בזהירות לפי הנתונים, בלי לקבוע.',
    '3. אל תניח מגבלה קבועה — קושי נוכחי אינו זהות. התלמיד יכול ורוצה,',
    '   גם אם כרגע נראה אחרת.',
    '4. המלצה מעשית: להעביר אחריות בצעד קטן אחד, מתוך אמון וסמכות רגועה —',
    '   לא כפייה ולא ויתור. תוצאה טבעית/הגיונית עדיפה על עונש מתוך כעס.',
    '5. עין טובה — פתח בנקודת חוזק אמיתית מתוך הנתונים, לפני הקושי.',
    '',
    'כתוב בעברית, קצר וממוקד, בשלושה חלקים עם כותרות מודגשות: **מה קורה כאן**',
    '(מה כנראה משיג התלמיד/הכיתה — או שאין מספיק נתונים לדעת), **נקודת חוזק**,',
    '**צעד אחד מעשי לצוות**. הסתמך אך ורק על הנתונים שסופקו, בלי להמציא.',
    'אל תאבחן ואל תיתן חוות דעת רפואית/פסיכולוגית — זו הכוונה חינוכית בלבד.',
    'אל תפתח בברכה, פנייה אישית או הקדמה — התחל ישר מהכותרת הראשונה,',
    'ואל תסיים במשפט סיכום — עצור אחרי הצעד המעשי.',
  ].join('\n');

  async function gemini(prompt, maxTokens) {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens || 1000, thinkingConfig: { thinkingBudget: 0 } },
    };
    const res = await window.cv3call('gemini-2.5-flash', body);
    const d = await res.json().catch(() => null);
    if (!res.ok || !d) throw new Error((d && d.error && d.error.message) || ('שגיאה ' + res.status));
    const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
    const out = parts.map(p => p.text || '').join('').trim();
    if (!out) throw new Error('לא התקבלה תשובה');
    return out;
  }

  // ── מטמון: מייצרים מחדש רק כשהנתונים באמת השתנו ──
  const CV = 'v1:';
  function cacheGet(k, sig) {
    try {
      const raw = localStorage.getItem('cv3rep_' + CV + k);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return o && o.sig === sig ? o : null;
    } catch (_) { return null; }
  }
  function cacheSet(k, sig, text) {
    try { localStorage.setItem('cv3rep_' + CV + k, JSON.stringify({ sig: sig, text: text, at: Date.now() })); } catch (_) {}
  }
  function cacheClear(k) { try { localStorage.removeItem('cv3rep_' + CV + k); } catch (_) {} }
  const ago = ts => {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'עכשיו';
    if (m < 60) return 'לפני ' + m + ' דק׳';
    const h = Math.round(m / 60);
    return h < 24 ? 'לפני ' + h + ' שעות' : 'לפני ' + Math.round(h / 24) + ' ימים';
  };

  // markdown מינימלי: כותרות מודגשות + פסקאות
  function md(t) {
    return String(t || '').split('\n').map(ln => {
      ln = ln.trim();
      if (!ln) return '';
      const b = esc(ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      return '<p style="margin:6px 0">' + b + '</p>';
    }).join('');
  }

  const attCounts = att => {
    const c = ks => att.filter(a => ks.indexOf(a.status) > -1).length;
    const present = c(['present', 'נוכח']), late = c(['late', 'איחור']),
          leftMid = c(['left', 'יצא']), absent = c(['absent', 'חיסור', 'נעדר']);
    return { present, late, leftMid, absent, tot: present + late + leftMid + absent };
  };
  const sevLabel = s => s === 'high' || s === 'גבוהה' ? 'חומרה גבוהה' : (s === 'low' || s === 'נמוכה' ? 'חומרה נמוכה' : 'חומרה רגילה');

  // ───────────────────────── איסוף נתוני תלמיד ─────────────────────────
  async function studentData(s) {
    const S = window.store;
    const [att, beh, tst, fnc, cats] = await Promise.all([
      S.byStudent ? S.byStudent('attendance', s.id) : S.list('attendance').then(l => l.filter(x => x.student_id === s.id)),
      S.byStudent ? S.byStudent('behavior_events', s.id) : S.list('behavior_events').then(l => l.filter(x => x.student_id === s.id)),
      S.byStudent ? S.byStudent('tests', s.id) : S.list('tests').then(l => l.filter(x => x.student_id === s.id)),
      S.byStudent ? S.byStudent('functioning', s.id) : S.list('functioning').then(l => l.filter(x => x.student_id === s.id)),
      S.list('categories'),
    ]);
    const catName = id => { const c = cats.find(x => String(x.id) === String(id)); return c ? c.name : 'דיווח'; };
    const a = attCounts(att);
    const grades = tst.map(t => Number(t.grade)).filter(x => !isNaN(x));
    const behLines = beh.slice(-10).map(e =>
      (catName(e.category_id) || 'דיווח') + ' (' + sevLabel(e.severity) + ')' + (e.note ? ' — ' + e.note : ''));
    return {
      sig: [att.length, beh.length, tst.length, fnc.length].join('-'),
      text: [
        'תלמיד: ' + fullName(s),
        'נוכחות: ' + (a.tot ? (a.present + ' נוכח, ' + a.late + ' איחורים, ' + a.absent + ' חיסורים (' +
          Math.round(((a.present + a.late) / a.tot) * 100) + '% הגעה)') : 'אין רישומים'),
        'דיווחי מעקב (מהאחרונים לישנים): ' + (behLines.length ? behLines.join(' | ') : 'אין'),
        'מבחנים: ' + (grades.length ? (grades.length + ' מבחנים, ממוצע ' + Math.round(grades.reduce((x, y) => x + y, 0) / grades.length)) : 'אין'),
        'ציוני תפקוד: ' + (fnc.length ? fnc.map(f => f.area + ' ' + f.score).join(', ') : 'אין'),
      ].join('\n'),
    };
  }

  // ───────────────────────── איסוף נתוני כיתה ─────────────────────────
  async function classData(classId, className) {
    const S = window.store;
    const [studentsAll, att, beh, tst] = await Promise.all([
      window.cv3Students ? window.cv3Students.getStudents() : S.list('students'),
      S.list('attendance'), S.list('behavior_events'), S.list('tests'),
    ]);
    const students = studentsAll.filter(s => String(s.class_id) === String(classId));
    const ids = students.map(s => s.id);
    const inClass = arr => arr.filter(x => ids.indexOf(x.student_id) > -1);
    const a = attCounts(inClass(att));
    const behC = inClass(beh);
    const highSev = behC.filter(e => e.severity === 'high' || e.severity === 'גבוהה').length;
    const grades = inClass(tst).map(t => Number(t.grade)).filter(x => !isNaN(x));
    // כמה תלמידים מרכזים את רוב דיווחי המעקב — רמז לדפוס כיתתי (לא רק "תלמיד קשה")
    const byStudent = {};
    behC.forEach(e => { byStudent[e.student_id] = (byStudent[e.student_id] || 0) + 1; });
    const topReported = Object.keys(byStudent).sort((x, y) => byStudent[y] - byStudent[x]).slice(0, 3)
      .map(sid => { const s = students.find(x => String(x.id) === String(sid)); return s ? fullName(s) + ' (' + byStudent[sid] + ')' : null; })
      .filter(Boolean);
    return {
      sig: [students.length, inClass(att).length, behC.length, inClass(tst).length].join('-'),
      text: [
        'כיתה: ' + (className || ''),
        'מספר תלמידים: ' + students.length,
        'נוכחות כיתתית: ' + (a.tot ? (Math.round(((a.present + a.late) / a.tot) * 100) + '% הגעה, ' + a.absent + ' חיסורים סה"כ') : 'אין רישומים'),
        'דיווחי מעקב: ' + behC.length + ' סה"כ, מתוכם ' + highSev + ' בחומרה גבוהה',
        'התלמידים עם הכי הרבה דיווחי מעקב: ' + (topReported.length ? topReported.join(', ') : 'אין ריכוז בולט'),
        'מבחנים: ' + (grades.length ? (grades.length + ' ציונים, ממוצע ' + Math.round(grades.reduce((x, y) => x + y, 0) / grades.length)) : 'אין'),
      ].join('\n'),
    };
  }

  const STU_PROMPT = METHOD_PROMPT + '\n\nלהלן נתוני תלמיד יחיד. נתח אותו לפי העקרונות שלמעלה.\n\nנתונים:\n';
  const CLS_PROMPT = METHOD_PROMPT + '\n\nלהלן נתונים מצטברים על כיתה שלמה (לא תלמיד יחיד). התייחס לאקלים ' +
    'הכיתתי הכללי — האם יש ריכוז דיווחים אצל מעטים, מגמת נוכחות, וכו׳ — ולא לתלמיד ספציפי.\n\nנתונים:\n';

  async function renderReport(host, key, prompt, dataFn, emptyNote) {
    if (!host) return;
    host.innerHTML = '<div class="ld"><i class="bi bi-stars"></i> מנתח…</div>';
    try {
      const d = await dataFn();
      let hit = cacheGet(key, d.sig);
      if (!hit) {
        const txt = await gemini(prompt + d.text, 1000);
        cacheSet(key, d.sig, txt);
        hit = cacheGet(key, d.sig) || { text: txt, at: Date.now() };
      }
      host.innerHTML = md(hit.text) +
        '<div class="tl-note" style="font-size:.72rem;margin-top:6px">חוות דעת AI על בסיס שיטת "לא ניתן החינוך למלאכי השרת" · ' +
        ago(hit.at) + ' · <a href="#" data-repref>רענון</a></div>';
      const r = host.querySelector('[data-repref]');
      if (r) r.addEventListener('click', e => { e.preventDefault(); cacheClear(key); renderReport(host, key, prompt, dataFn, emptyNote); });
    } catch (e) {
      host.innerHTML = '<div class="tl-note" style="color:#b91c1c">לא ניתן להפיק חוות דעת כרגע (' + esc(e.message || e) + ')</div>';
    }
  }

  function renderStudentReport(host, student) {
    return renderReport(host, 'stu' + student.id, STU_PROMPT, () => studentData(student));
  }
  function renderClassReport(host, classId, className) {
    return renderReport(host, 'cls' + classId, CLS_PROMPT, () => classData(classId, className));
  }

  window.cv3AIReport = { renderStudentReport, renderClassReport };
})();
