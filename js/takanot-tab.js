// takanot-tab.js — מודול "סבסוד הזנה" בתוך התוכנה.
// מטמיע את הטופס להורים (takanot-hanacha.html) ואת מסך הניהול (takanot-admin.html)
// הקיימים דרך iframe, כדי לא לשכפל את לוגיקת הטופס/ההגשה שכבר עובדת.
(function () {
  'use strict';

  function render(page) {
    const view = window._takanotView || 'admin';
    const src = view === 'form' ? 'takanot-hanacha.html' : 'takanot-admin.html';
    page.innerHTML =
      '<div class="page-head" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button>' +
        '<h2 style="margin:0"><i class="bi bi-cash-stack"></i> סבסוד הזנה</h2>' +
        '<div style="margin-inline-start:auto;display:flex;gap:8px;flex-wrap:wrap">' +
          '<div class="btn-group" role="group" style="display:inline-flex;gap:4px">' +
            '<button id="tkTabAdmin" class="btn-primary sm" data-v="admin">ניהול בקשות</button>' +
            '<button id="tkTabForm" class="btn-ghost sm" data-v="form">טופס בקשה</button>' +
          '</div>' +
          '<button id="tkShare" class="btn-ghost sm" title="פתח את טופס ההורים בכרטיסייה נפרדת לשיתוף"><i class="bi bi-box-arrow-up-left"></i> פתח לשיתוף</button>' +
        '</div>' +
      '</div>' +
      '<iframe id="tkFrame" title="סבסוד הזנה" ' +
        'style="width:100%;height:78vh;border:1px solid var(--border,#e2e8f0);border-radius:12px;background:#fff" ' +
        'src="' + src + '"></iframe>';

    function setView(v) {
      window._takanotView = v;
      const frame = page.querySelector('#tkFrame');
      const want = v === 'form' ? 'takanot-hanacha.html' : 'takanot-admin.html';
      if (frame && !(frame.getAttribute('src') || '').endsWith(want)) frame.setAttribute('src', want);
      const a = page.querySelector('#tkTabAdmin'), f = page.querySelector('#tkTabForm');
      if (a && f) {
        a.className = (v === 'admin' ? 'btn-primary' : 'btn-ghost') + ' sm';
        f.className = (v === 'form' ? 'btn-primary' : 'btn-ghost') + ' sm';
      }
    }

    page.querySelector('#tkTabAdmin').addEventListener('click', () => setView('admin'));
    page.querySelector('#tkTabForm').addEventListener('click', () => setView('form'));
    page.querySelector('#tkShare').addEventListener('click', () => window.open('takanot-hanacha.html', '_blank'));
    setView(view);
  }

  window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  window.PAGE_RENDERERS.takanot = render;
})();
