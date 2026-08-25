// author.js — "מי רשם את זה" (בקשת עמנואל 25/08/2026).
//
// עמנואל: "יש אצלנו מלמדים בצהריים שמעדכנים על תלמיד משהו... אני מתבלבל אם זה
// אצל המחנך בבוקר או בצהריים. הייתי רוצה שאוכל ללחוץ ולראות מי כתב את זה."
//
// העמודה created_by קיימת בכל טבלאות הדיווח ומתמלאת אוטומטית ב-DB
// (default auth.uid()) — היא פשוט מעולם לא הוצגה. המודול הזה ממפה מזהה→שם+תפקיד
// כדי שהניסוח יהיה זהה בכל מסך.
//
// ⚠️ המיפוי בא מהתצוגה public.staff_directory ולא מ-profiles: ל-profiles יש RLS
// שמאפשר לכל משתמש לקרוא רק את עצמו (וגם tz/email/perms שאסור לחשוף). ראה
// supabase/migration_author_and_own_reports.sql.
//
// רשומות שנוצרו לפני שהעמודה התמלאה יוצגו "לא ידוע" — אל תמלא אותן בדיעבד בניחוש.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let map = null;      // uid -> {name, role}
  let loading = null;

  async function load(force) {
    if (map && !force) return map;
    if (loading) return loading;
    loading = (async () => {
      const m = {};
      try {
        const rows = await window.store.list('staff_directory');
        (rows || []).forEach(p => { if (p && p.id) m[p.id] = { name: p.name || '', role: p.role || '', active: p.active !== false }; });
      } catch (_) { /* בלי הספרייה פשוט לא יוצג שם — לא מפילים מסך */ }
      // המשתמש המחובר תמיד מוכר, גם אם הספרייה נכשלה
      const u = window.currentUser;
      if (u && u.id && !m[u.id]) m[u.id] = { name: u.name || '', role: u.role || '', active: true };
      map = m; loading = null; return m;
    })();
    return loading;
  }

  function rec(uid) { return (map && uid && map[uid]) || null; }
  function name(uid) { const r = rec(uid); return r && r.name ? r.name : (uid ? 'לא ידוע' : '—'); }
  function role(uid) { const r = rec(uid); return r ? (r.role || '') : ''; }
  function isMe(uid) { const u = window.currentUser; return !!(u && uid && String(u.id) === String(uid)); }

  // תג קטן לשורת דיווח: "מחנך · משה רביבו". התפקיד הוא העיקר כאן —
  // זה מה שעונה על "בוקר אצל המחנך או צהריים אצל המלמד".
  function chip(uid) {
    const r = rec(uid);
    if (!r || !r.name) {
      return '<span class="au au-none" title="הרשומה נוצרה לפני שהמערכת תיעדה מי רשם">לא ידוע</span>';
    }
    const rl = r.role || '';
    return '<span class="au' + (isMe(uid) ? ' au-me' : '') + '" title="' + esc(rl ? rl + ' · ' + r.name : r.name) + '">' +
      '<i class="bi bi-person-badge"></i>' +
      (rl ? '<b class="au-role">' + esc(rl) + '</b>' : '') +
      '<span class="au-name">' + esc(r.name) + '</span></span>';
  }

  // תא לטבלה — שם בלבד, תפקיד ב-tooltip
  function cell(uid) {
    const r = rec(uid);
    if (!r || !r.name) return '<span class="au au-none">' + (uid ? 'לא ידוע' : '—') + '</span>';
    return '<span class="au' + (isMe(uid) ? ' au-me' : '') + '" title="' + esc(r.role || '') + '">' + esc(r.name) + '</span>';
  }

  // שורת "נרשם ע"י" לכרטיסים
  function line(row) {
    const uid = row && (row.created_by || row.createdBy);
    return '<span class="au-line">נרשם ע"י ' + cell(uid) + (role(uid) ? ' <small>(' + esc(role(uid)) + ')</small>' : '') + '</span>';
  }

  // טקסט נקי לייצוא CSV
  function text(uid) { const r = rec(uid); return r && r.name ? ((r.role ? r.role + ' ' : '') + r.name) : (uid ? 'לא ידוע' : ''); }

  function style() {
    if (document.getElementById('auStyle')) return;
    const s = document.createElement('style'); s.id = 'auStyle';
    s.textContent =
      '.au{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:.78rem;' +
        'background:var(--chip-bg,#f1f5f9);color:var(--muted,#475569);border-radius:999px;padding:1px 8px}' +
      '.au .bi{font-size:.8rem;opacity:.7}' +
      '.au-role{font-weight:700;color:var(--primary-dark,#3730a3)}' +
      '.au-me{background:#e0f2fe;color:#075985}.au-me .au-role{color:#075985}' +
      '.au-none{font-style:italic;opacity:.75}' +
      '.au-line{display:inline-flex;align-items:center;gap:5px;font-size:.8rem;color:var(--muted,#6b7280)}' +
      '.tl-item .au{margin-inline-start:6px}';
    document.head.appendChild(s);
  }

  style();
  window.Author = { load, name, role, cell, chip, line, text, isMe, get map() { return map; } };
})();
