// Main app router & login

let currentUser = null;
const PAGES = ['login','home','students','behavior','settings','reports'];

function showPage(name) {
  PAGES.forEach(p => {
    document.getElementById('page-' + p).classList.toggle('d-none', p !== name);
  });
  if (name === 'students' && typeof renderStudents === 'function') renderStudents();
  if (name === 'behavior' && typeof renderBehavior === 'function') renderBehavior();
  if (name === 'settings' && typeof renderSettings === 'function') renderSettings();
  if (name === 'reports' && typeof renderReports === 'function') renderReports();
}

function goto(page) {
  showPage(page);
  history.pushState({page}, '', '#' + page);
}

window.addEventListener('popstate', e => {
  const page = (e.state && e.state.page) || 'home';
  showPage(page);
});

document.getElementById('login-btn').onclick = async () => {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  if (!u || !p) return;
  // Local fallback: admin/6742 always works
  if (u === 'admin' && p === '6742') {
    currentUser = { username: 'admin', role: 'מנהל' };
    sessionStorage.setItem('user', JSON.stringify(currentUser));
    document.getElementById('user-info').textContent = u + ' (מנהל)';
    showPage('home');
    loadStats();
    return;
  }
  const r = await api('authenticate', [u, p]);
  if (r.ok && r.data && r.data.ok) {
    currentUser = r.data.user;
    sessionStorage.setItem('user', JSON.stringify(currentUser));
    document.getElementById('user-info').textContent = currentUser.username + ' (' + currentUser.role + ')';
    showPage('home');
    loadStats();
  } else {
    const err = document.getElementById('login-error');
    err.textContent = (r.data && r.data.error) || r.error || 'שגיאה';
    err.classList.remove('d-none');
  }
};

async function loadStats() {
  const s = await api('listStudents', []);
  const b = await api('listBehavior', []);
  document.getElementById('stat-students').textContent = (s.data || []).length;
  document.getElementById('stat-events').textContent = (b.data || []).length;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const week = (b.data || []).filter(e => new Date(e['תאריך']).getTime() > weekAgo);
  document.getElementById('stat-week').textContent = week.length;
}

// Auto-login (no auth required for now)
currentUser = { username: 'admin', role: 'מנהל' };
sessionStorage.setItem('user', JSON.stringify(currentUser));
document.getElementById('user-info').textContent = 'admin (מנהל)';
showPage('home');
setTimeout(loadStats, 500);
