/* emmanuel_features.js - בקשות עמנואל רקובסקי 2026
 * 1. autocomplete בבחירת קטגוריית אירוע
 * 2. סינון תלמידים לפי כיתת המחנך
 * 3. הצגת שם הכותב באירועים
 */
(function () {
  'use strict';

  // === הגדרות ===
  const TEACHER_CLASS_MAP_KEY = 'cmm_teacher_classes';
  const ALLOWED_DOMAINS = ['gmail.com'];

  // === 1. Autocomplete לקטגוריות ===
  function upgradeEventCategoryToAutocomplete() {
    const observer = new MutationObserver(() => {
      const select = document.getElementById('ne-cat');
      if (!select || select.dataset.acReady) return;
      select.dataset.acReady = '1';

      const options = Array.from(select.options).filter(o => o.value).map(o => ({
        value: o.value, label: o.textContent.trim()
      }));
      if (!options.length) return;

      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = select.className || 'form-control';
      input.placeholder = 'הקלד לחיפוש קטגוריה...';
      input.autocomplete = 'off';
      const list = document.createElement('div');
      list.style.cssText = 'position:absolute;top:100%;right:0;left:0;background:#fff;border:1px solid #ddd;border-radius:6px;max-height:240px;overflow-y:auto;z-index:1100;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.08)';

      wrap.appendChild(input);
      wrap.appendChild(list);
      select.style.display = 'none';
      select.parentNode.insertBefore(wrap, select.nextSibling);

      function renderMatches(q) {
        q = (q || '').trim().toLowerCase();
        const matches = !q ? options : options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
        list.innerHTML = '';
        if (!matches.length) {
          list.style.display = 'none';
          return;
        }
        matches.slice(0, 20).forEach(o => {
          const item = document.createElement('div');
          item.textContent = o.label;
          item.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0';
          item.onmouseover = () => item.style.background = '#f5f7fa';
          item.onmouseout = () => item.style.background = '#fff';
          item.onclick = () => {
            input.value = o.label;
            select.value = o.value;
            list.style.display = 'none';
            select.dispatchEvent(new Event('change'));
          };
          list.appendChild(item);
        });
        list.style.display = 'block';
      }

      input.addEventListener('focus', () => renderMatches(input.value));
      input.addEventListener('input', () => renderMatches(input.value));
      document.addEventListener('click', e => {
        if (!wrap.contains(e.target)) list.style.display = 'none';
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // === 2. סינון תלמידים לפי כיתת המחנך ===
  function getTeacherClass() {
    try {
      const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
      if (!sess.username || sess.role === 'admin') return null;
      const map = JSON.parse(localStorage.getItem(TEACHER_CLASS_MAP_KEY) || '{}');
      return map[sess.username] || sess.classFilter || null;
    } catch { return null; }
  }

  function filterStudentsByClass(students) {
    const cls = getTeacherClass();
    if (!cls || !Array.isArray(students)) return students;
    return students.filter(s => {
      const sc = s['כיתה'] || s['class'] || '';
      return String(sc).trim() === String(cls).trim();
    });
  }

  // wrapper סביב _allStudents כדי לסנן באופן שקוף
  function installStudentFilter() {
    let actualStudents = null;
    Object.defineProperty(window, '_allStudents_unfiltered', {
      get() { return actualStudents; },
      set(v) { actualStudents = v; },
      configurable: true
    });
    // נתפוס כל הצבה ל-_allStudents ונסנן
    let _current = window._allStudents;
    Object.defineProperty(window, '_allStudents', {
      get() { return _current; },
      set(v) {
        actualStudents = v;
        _current = filterStudentsByClass(v) || v;
      },
      configurable: true
    });
    if (_current) window._allStudents = _current;
  }

  // === 3. הצגת שם הכותב באירועים ===
  function enhanceEventDisplay() {
    // hook לתוך פונקציית פורמט האירוע אם קיימת
    if (typeof window.formatEventLine === 'function') {
      const orig = window.formatEventLine;
      window.formatEventLine = function (ev) {
        const base = orig.apply(this, arguments);
        const writer = ev['דווח_עי'] || ev.reporter || '';
        if (writer && typeof base === 'string' && !base.includes(writer)) {
          return base + ` <span class="text-muted small">· דווח ע"י ${writer}</span>`;
        }
        return base;
      };
    }

    // הוספה ויזואלית לתאי טבלת אירועים
    const observer = new MutationObserver(() => {
      document.querySelectorAll('[data-ev-id]:not([data-writer-shown])').forEach(row => {
        const evId = row.dataset.evId;
        const ev = (window._events || []).find(x => String(x['מזהה']) === String(evId));
        if (ev && ev['דווח_עי']) {
          row.dataset.writerShown = '1';
          const lbl = document.createElement('div');
          lbl.className = 'small text-muted';
          lbl.style.marginTop = '4px';
          lbl.innerHTML = `<i class="bi bi-person-circle"></i> ${ev['דווח_עי']}` +
            (ev['תאריך'] ? ` · ${new Date(ev['תאריך']).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}` : '');
          row.appendChild(lbl);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // === 4. Google Sign-In integration (אם הכפתור קיים) ===
  function setupGoogleSignIn() {
    if (!window.google || !window.google.accounts) {
      setTimeout(setupGoogleSignIn, 500);
      return;
    }
    const btnEl = document.getElementById('google-signin-btn-cheder');
    if (!btnEl) return;
    window.google.accounts.id.initialize({
      client_id: '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com',
      callback: (resp) => {
        try {
          const payload = JSON.parse(atob(resp.credential.split('.')[1]));
          const email = (payload.email || '').toLowerCase();
          const allowedTLD = ALLOWED_DOMAINS.some(d => email.endsWith('@' + d));
          if (!allowedTLD) {
            alert('כתובת לא מורשית. פנה למזכירות.');
            return;
          }
          // שמור session
          sessionStorage.setItem('user', JSON.stringify({
            username: email,
            name: payload.name || email,
            role: getRoleForEmail(email),
            classFilter: getTeacherClass.bind(null, email)() || null,
            via: 'google',
          }));
          // הצג למשתמש שהוא מחובר ורענן את העמוד
          location.reload();
        } catch (e) {
          alert('שגיאת התחברות');
        }
      },
    });
    window.google.accounts.id.renderButton(btnEl, {
      theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'he'
    });
  }

  function getRoleForEmail(email) {
    const admins = JSON.parse(localStorage.getItem('cmm_admin_emails') || '["6742853@gmail.com","e0548451402@gmail.com"]');
    return admins.map(a => a.toLowerCase()).includes(email) ? 'admin' : 'teacher';
  }

  // === Init ===
  function init() {
    try { upgradeEventCategoryToAutocomplete(); } catch (e) { console.warn('autocomplete init fail', e); }
    try { installStudentFilter(); } catch (e) { console.warn('filter init fail', e); }
    try { enhanceEventDisplay(); } catch (e) { console.warn('event display init fail', e); }
    try { setupGoogleSignIn(); } catch (e) { console.warn('google signin init fail', e); }
    console.log('[emmanuel_features] loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
