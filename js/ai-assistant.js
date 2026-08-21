// ai-assistant.js — "מסייע חכם": ניתוח אוטומטי של התלמידים בכל פתיחת מסך.
// מזהה מי דורש מעקב, מפיק סיכום קצר (4-5 שורות) לכל תלמיד, וסקירה כללית.
// כפתור צף + מגירה בצד — נוכח בכל המסכים. אותו רכיב מוטמע גם בכרטיס התלמיד.
//
// פרטיות והרשאות: כל הנתונים נטענים דרך window.store, כלומר בשרת ה-RLS
// מחזיר לכל משתמש רק את מה שמותר לו לראות (דיווחי כיתתו / דיווחים שרשם בעצמו).
// אין ניתוח בענן — הכל מחושב בדפדפן, שום מידע על תלמיד לא יוצא החוצה.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAY = 864e5, WINDOW = 30;
  const fullName = s => (window.UI && window.UI.fullName) ? window.UI.fullName(s) : ((s && s.name) || '');

  function daysAgoNum(iso) {
    if (!iso) return 9999;
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); const t = d.getTime();
    return isNaN(t) ? 9999 : Math.floor((Date.now() - t) / DAY);
  }
  const recent = iso => daysAgoNum(iso) <= WINDOW;
  function hebDate(iso) { if (!iso) return ''; try { return new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' }).format(new Date(String(iso).slice(0, 10) + 'T00:00:00')); } catch (_) { return String(iso); } }

  // ---------- טעינת נתונים (מטמון קצר כדי לא לטעון בכל מעבר מסך) ----------
  let _cache = null, _cacheAt = 0, _loading = null;
  async function loadData(force) {
    if (!force && _cache && Date.now() - _cacheAt < 45000) return _cache;
    if (_loading) return _loading;
    _loading = (async () => {
      const S = window.store;
      const students = window.cv3Students ? await window.cv3Students.getStudents() : await S.list('students');
      const [classes, cats, beh, att, tst, fnc, med, tsk] = await Promise.all([
        S.list('classes'), S.list('categories'),
        S.list('behavior_events'), S.list('attendance'), S.list('tests'),
        S.list('functioning'), S.list('medications'), S.list('tasks'),
      ]);
      const by = {}; const bucket = id => (by[id] || (by[id] = { beh: [], att: [], tst: [], fnc: [], med: [], tsk: [] }));
      beh.forEach(r => bucket(r.student_id).beh.push(r));
      att.forEach(r => bucket(r.student_id).att.push(r));
      tst.forEach(r => bucket(r.student_id).tst.push(r));
      fnc.forEach(r => bucket(r.student_id).fnc.push(r));
      med.forEach(r => bucket(r.student_id).med.push(r));
      tsk.forEach(r => { if (r.student_id) bucket(r.student_id).tsk.push(r); });
      _cache = { students, classes, cats, by, at: Date.now() }; _cacheAt = Date.now();
      return _cache;
    })();
    try { return await _loading; } finally { _loading = null; }
  }
  function clearCache() { _cache = null; _cacheAt = 0; }

  const className = (classes, id) => { const c = classes.find(x => x.id === id); return c ? c.name : ''; };
  const catName = (cats, id) => { const c = cats.find(x => x.id == id); return c ? c.name : 'דיווח'; };
  const gnum = g => { const n = Number(g); return isNaN(n) ? null : n; };

  // ---------- מנוע הניתוח לתלמיד יחיד ----------
  function analyzeOne(d, s) {
    const b = d.by[s.id] || { beh: [], att: [], tst: [], fnc: [], med: [], tsk: [] };
    const reasons = []; let score = 0;
    const add = (w, icon, text) => { score += w; reasons.push({ icon, text, w }); };

    // התנהגות — חומרה גבוהה/בינונית בחודש האחרון (נמוכה נחשבת חיובית/ניטרלית ואינה מנקדת)
    const behRec = b.beh.filter(e => recent(e.event_date));
    const hi = behRec.filter(e => e.severity === 'גבוהה');
    const mid = behRec.filter(e => e.severity === 'בינונית');
    if (hi.length) { const last = hi.slice().sort((a, c) => String(c.event_date).localeCompare(String(a.event_date)))[0]; add(Math.min(hi.length, 3) * 3, 'bi-exclamation-octagon', hi.length + ' דיווחי חומרה גבוהה (אחרון: ' + catName(d.cats, last.category_id) + (last.note ? ' — ' + last.note : '') + ')'); }
    if (mid.length) add(Math.min(mid.length, 3), 'bi-clipboard-check', mid.length + ' דיווחי חומרה בינונית');

    // נוכחות
    const absent = b.att.filter(a => a.status === 'absent' && recent(a.date)).length;
    const late = b.att.filter(a => a.status === 'late' && recent(a.date)).length;
    if (absent) add(absent >= 3 ? 4 : absent === 2 ? 2 : 1, 'bi-calendar-x', 'נעדר ' + absent + ' פעמים בחודש האחרון');
    if (late) add(late >= 4 ? 2 : late >= 2 ? 1 : 0, 'bi-clock-history', 'איחר ' + late + ' פעמים בחודש האחרון');

    // מבחנים
    const tstRec = b.tst.filter(t => recent(t.date) && gnum(t.grade) != null);
    const fails = tstRec.filter(t => gnum(t.grade) < 60);
    const weak = tstRec.filter(t => gnum(t.grade) >= 60 && gnum(t.grade) < 70);
    if (fails.length) add(Math.min(fails.length, 2) * 3, 'bi-card-checklist', 'נכשל ב-' + fails.length + ' מבחנים (' + fails.map(t => t.subject + ' ' + gnum(t.grade)).slice(0, 2).join(', ') + ')');
    else if (weak.length) add(1, 'bi-card-checklist', 'ציונים גבוליים ב-' + weak.length + ' מבחנים');

    // ציוני תפקוד נמוכים (סולם 1-10)
    const lowFnc = b.fnc.filter(f => recent(f.date) && gnum(f.score) != null && gnum(f.score) <= 4);
    if (lowFnc.length) add(Math.min(lowFnc.length, 2) * 2, 'bi-bar-chart-line', 'תפקוד נמוך: ' + lowFnc.map(f => f.area + ' ' + gnum(f.score)).slice(0, 2).join(', '));

    // משימות פתוחות שחלף זמנן
    const overdue = b.tsk.filter(t => (t.status === 'open' || t.status === 'in_progress') && t.due_date && daysAgoNum(t.due_date) > 0);
    if (overdue.length) add(Math.min(overdue.length, 2) * 2, 'bi-kanban', overdue.length + ' משימות פתוחות שחלף זמנן (' + overdue.map(t => t.title).slice(0, 2).join(', ') + ')');

    // רפואי — מידע חשוב, לא בהכרח "בעיה"
    if (b.med.length) add(1, 'bi-capsule', 'לתשומת לב רפואית: ' + b.med.map(m => m.name).slice(0, 2).join(', '));

    const level = score >= 7 ? 'high' : score >= 4 ? 'medium' : score >= 1 ? 'low' : 'none';
    const hasData = (b.beh.length + b.att.length + b.tst.length + b.fnc.length + b.med.length + b.tsk.length) > 0;
    return { student: s, id: s.id, name: fullName(s), cls: className(d.classes, s.class_id), score, level, reasons, hasData, buckets: b, lastReport: b.beh.length ? b.beh.slice().sort((a, c) => String(c.event_date).localeCompare(String(a.event_date)))[0] : null };
  }

  // ---------- הפקת סיכום מילולי (4-5 שורות) ----------
  const LEVEL_TXT = { high: 'דורש תשומת לב מיידית.', medium: 'מומלץ מעקב קרוב.', low: 'תקין בסך הכל — כדאי עין פקוחה.', none: 'תקין. אין נקודות לתשומת לב כרגע.' };
  function summarize(a) {
    const lines = [];
    lines.push((a.cls ? a.cls + ' · ' : '') + LEVEL_TXT[a.level]);
    if (!a.hasData) { lines.push('אין נתונים נגישים על תלמיד זה בהרשאות שלך.'); return lines; }
    a.reasons.slice().sort((x, y) => y.w - x.w).forEach(r => { if (lines.length < 5) lines.push(r.text + '.'); });
    if (a.level === 'none' && a.lastReport) lines.push('דיווח אחרון: ' + catName((_cache && _cache.cats) || [], a.lastReport.category_id) + ' (' + hebDate(a.lastReport.event_date) + ').');
    if (a.level === 'high') lines.push('המלצה: ליצור קשר עם ההורים ולתעד שיחה.');
    else if (a.level === 'medium') lines.push('המלצה: לעקוב השבוע ולשקול שיחת עידוד.');
    return lines.slice(0, 6);
  }

  // ---------- ניתוח מלא + סקירה ----------
  async function analyze(force) {
    const d = await loadData(force);
    const list = d.students.map(s => analyzeOne(d, s)).filter(a => a.level !== 'none').sort((x, y) => y.score - x.score);
    const counts = { high: 0, medium: 0, low: 0, total: list.length, students: d.students.length };
    list.forEach(a => counts[a.level]++);
    return { list, counts, at: new Date() };
  }

  // סיכום לתלמיד יחיד (לשימוש חוזר בכרטיס התלמיד)
  async function summaryFor(id) {
    const d = await loadData(false);
    const s = d.students.find(x => x.id == id) || { id: id, name: '' };
    const a = analyzeOne(d, s);
    return { level: a.level, lines: summarize(a), reasons: a.reasons, name: a.name };
  }

  // ---------- רכיב גרפי אחיד ----------
  const LEVEL_LABEL = { high: 'דחוף', medium: 'מעקב', low: 'עין פקוחה', none: 'תקין' };
  const LEVEL_ICON = { high: 'bi-exclamation-triangle-fill', medium: 'bi-eye-fill', low: 'bi-check-circle', none: 'bi-check-circle-fill' };
  function cardHtml(sum) {
    return '<div class="ai-card lv-' + sum.level + '">' +
      '<div class="ai-card-head"><span class="ai-badge"><i class="bi bi-stars"></i></span>' +
      '<div class="ai-card-t"><strong>מסייע חכם</strong><small>ניתוח אוטומטי</small></div>' +
      '<span class="ai-level lv-' + sum.level + '"><i class="bi ' + LEVEL_ICON[sum.level] + '"></i> ' + LEVEL_LABEL[sum.level] + '</span></div>' +
      '<div class="ai-lines">' + sum.lines.map(l => '<div class="ai-line">' + esc(l) + '</div>').join('') + '</div></div>';
  }

  // ---------- מגירה צדדית ----------
  function ensureDrawer() {
    let ov = document.getElementById('aiDrawerOv');
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'aiDrawerOv'; ov.className = 'ai-drawer-ov';
    ov.innerHTML =
      '<aside class="ai-drawer" role="dialog" aria-label="מסייע חכם">' +
      '<div class="ai-head"><span class="ai-badge lg"><i class="bi bi-stars"></i></span>' +
      '<div class="ai-head-t"><strong>מסייע חכם</strong><small>מעקב וזיהוי אוטומטי</small></div>' +
      '<button class="ai-x" aria-label="סגור"><i class="bi bi-x-lg"></i></button></div>' +
      '<div class="ai-body" id="aiBody"><div class="ai-loading"><i class="bi bi-arrow-repeat spin"></i> מנתח נתונים…</div></div>' +
      '</aside>';
    document.body.appendChild(ov);
    const close = () => ov.classList.remove('open');
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('.ai-x').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    return ov;
  }

  async function openDrawer() {
    const ov = ensureDrawer(); ov.classList.add('open');
    const body = ov.querySelector('#aiBody');
    body.innerHTML = '<div class="ai-loading"><i class="bi bi-arrow-repeat spin"></i> מנתח נתונים…</div>';
    let res; try { res = await analyze(true); } catch (e) { body.innerHTML = '<div class="ai-loading">שגיאה בטעינת הנתונים.</div>'; return; }
    renderDrawer(body, res);
  }

  function renderDrawer(body, res) {
    const c = res.counts;
    let html = '<div class="ai-overview">' +
      '<div class="ai-ov-title"><i class="bi bi-clipboard-data"></i> סקירה כללית</div>' +
      '<div class="ai-stats">' +
        '<div class="ai-stat lv-high"><b>' + c.high + '</b><span>דחוף</span></div>' +
        '<div class="ai-stat lv-medium"><b>' + c.medium + '</b><span>מעקב</span></div>' +
        '<div class="ai-stat lv-low"><b>' + c.low + '</b><span>עין פקוחה</span></div>' +
        '<div class="ai-stat"><b>' + c.students + '</b><span>תלמידים</span></div>' +
      '</div>' +
      '<div class="ai-ov-note">' + (c.total ? 'נמצאו ' + c.total + ' תלמידים הדורשים תשומת לב.' : 'הכול תקין — אין תלמידים הדורשים מעקב כעת.') + '</div>' +
    '</div>';
    if (res.list.length) {
      html += '<div class="ai-list">' + res.list.map(a =>
        '<div class="ai-item lv-' + a.level + '" data-id="' + a.id + '">' +
          '<div class="ai-item-head">' +
            '<span class="ava">' + esc((a.name || '?').slice(0, 2)) + '</span>' +
            '<div class="ai-item-main"><strong>' + esc(a.name) + '</strong><small>' + esc(a.cls) + '</small></div>' +
            '<span class="ai-level lv-' + a.level + '"><i class="bi ' + LEVEL_ICON[a.level] + '"></i> ' + LEVEL_LABEL[a.level] + '</span>' +
          '</div>' +
          '<div class="ai-reasons">' + a.reasons.slice(0, 3).map(r => '<span class="ai-reason"><i class="bi ' + r.icon + '"></i> ' + esc(r.text) + '</span>').join('') + '</div>' +
          '<div class="ai-item-full"></div>' +
        '</div>').join('') + '</div>';
    }
    html += '<div class="ai-foot"><i class="bi bi-shield-lock"></i> הניתוח מבוסס רק על הנתונים שמותר לך לראות, ומחושב במכשירך.</div>';
    body.innerHTML = html;
    body.querySelectorAll('.ai-item').forEach(it => {
      it.querySelector('.ai-item-head').addEventListener('click', async () => {
        const full = it.querySelector('.ai-item-full');
        if (it.classList.contains('expanded')) { it.classList.remove('expanded'); full.innerHTML = ''; return; }
        it.classList.add('expanded'); full.innerHTML = '<div class="ai-loading sm"><i class="bi bi-arrow-repeat spin"></i></div>';
        const sum = await summaryFor(it.dataset.id);
        full.innerHTML = '<div class="ai-lines">' + sum.lines.map(l => '<div class="ai-line">' + esc(l) + '</div>').join('') + '</div>';
      });
    });
  }

  // ---------- כפתור צף + תג ----------
  function mountFab() {
    if (document.getElementById('aiFab')) return;
    const btn = document.createElement('button');
    btn.id = 'aiFab'; btn.className = 'ai-fab'; btn.title = 'מסייע חכם'; btn.setAttribute('aria-label', 'מסייע חכם');
    btn.innerHTML = '<i class="bi bi-stars"></i><span class="ai-fab-badge" hidden>0</span>';
    btn.addEventListener('click', openDrawer);
    document.body.appendChild(btn);
  }

  async function refresh() {
    if (!window.currentUser || !window.store) return;
    clearCache();
    let res; try { res = await analyze(true); } catch (_) { return; }
    const fab = document.getElementById('aiFab'); if (!fab) return;
    const badge = fab.querySelector('.ai-fab-badge');
    const n = res.counts.high + res.counts.medium;
    if (n > 0) { badge.textContent = n; badge.hidden = false; fab.classList.toggle('urgent', res.counts.high > 0); }
    else { badge.hidden = true; fab.classList.remove('urgent'); }
    const ov = document.getElementById('aiDrawerOv');
    if (ov && ov.classList.contains('open')) renderDrawer(ov.querySelector('#aiBody'), res);
  }

  // הופעה רק אחרי כניסה + עדכון בכל פתיחת מסך (עוטף את showPage פעם אחת)
  let lastRefresh = 0;
  function sync() {
    const loggedIn = !!window.currentUser;
    const fab = document.getElementById('aiFab');
    if (loggedIn && !fab) { mountFab(); refresh(); }
    if (fab) fab.style.display = loggedIn ? '' : 'none';
    if (loggedIn && window.showPage && !window.__aiWrapShowPage) {
      window.__aiWrapShowPage = true;
      const orig = window.showPage;
      window.showPage = function () { const r = orig.apply(this, arguments); if (window.currentUser && Date.now() - lastRefresh > 1500) { lastRefresh = Date.now(); setTimeout(refresh, 60); } return r; };
    }
  }
  document.addEventListener('DOMContentLoaded', () => { setInterval(sync, 800); });

  window.cv3AI = { analyze, summaryFor, cardHtml, refresh, openDrawer, clearCache };
})();
