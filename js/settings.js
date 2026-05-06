async function renderSettings() {
  document.getElementById('page-settings').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3><i class="bi bi-gear"></i> הגדרות והרשאות</h3>
      <button class="btn btn-primary" onclick="addUserModal()"><i class="bi bi-plus"></i> משתמש חדש</button>
    </div>
    <div class="card p-3 mb-3">
      <h5>משתמשים</h5>
      <table class="table table-hover">
        <thead><tr><th>שם משתמש</th><th>תפקיד</th><th>הרשאות</th></tr></thead>
        <tbody id="users-tbody"></tbody>
      </table>
    </div>
    <div class="card p-3">
      <h5>אודות המערכת</h5>
      <ul class="mb-0">
        <li>מערכת חדר מעלה עמוס - גרסה 1.0</li>
        <li>backend: Google Apps Script + Google Sheets</li>
        <li>אחסון מקומי כגיבוי (localStorage)</li>
        <li>RTL עברית מלא</li>
      </ul>
    </div>`;
  const r = await api('listUsers', []);
  const users = r.data || [];
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">אין משתמשים</td></tr>';
    return;
  }
  const PERM_LABELS = {students:'תלמידים', behavior:'התנהגות', reports:'דוחות', settings:'ניהול', all:'הכל'};
  tbody.innerHTML = users.map(u => {
    const role = u['תפקיד']||'';
    const cls = role === 'מנהל' ? 'role-admin' : role === 'רב' ? 'role-rabbi' : 'role-readonly';
    const perms = (u['הרשאות']||'').split(',').map(p => p.trim()).filter(Boolean);
    const permBadges = perms.map(p => `<span class="cat-badge me-1">${PERM_LABELS[p]||p}</span>`).join(' ');
    return `<tr><td>${u['שם משתמש']||''}</td><td><span class="badge ${cls}">${role}</span></td><td>${permBadges}</td></tr>`;
  }).join('');
}

const PERMISSION_AREAS = [
  { key: 'students', label: 'תלמידים', icon: 'bi-people', desc: 'צפייה והוספה של תלמידים' },
  { key: 'behavior', label: 'מעקב התנהגות', icon: 'bi-clipboard-check', desc: 'תיעוד אירועים' },
  { key: 'reports', label: 'דוחות וייצוא', icon: 'bi-file-earmark-pdf', desc: 'הורדת PDF' },
  { key: 'settings', label: 'ניהול משתמשים', icon: 'bi-gear', desc: 'הוספה ועריכה של משתמשים' },
];

const ROLE_DEFAULTS = {
  'מנהל': ['students','behavior','reports','settings'],
  'רב': ['students','behavior','reports'],
  'מורה': ['students','behavior'],
  'קריאה בלבד': ['students'],
  'מותאם אישית': [],
};

function addUserModal() {
  const checkboxes = PERMISSION_AREAS.map(a => `
    <div class="form-check d-flex align-items-center p-3 mb-2 border rounded" style="cursor:pointer">
      <input class="form-check-input ms-3 perm-cb" type="checkbox" value="${a.key}" id="perm-${a.key}">
      <label class="form-check-label flex-grow-1 ms-2" for="perm-${a.key}" style="cursor:pointer">
        <i class="bi ${a.icon} fs-4 text-primary"></i>
        <strong class="ms-2">${a.label}</strong>
        <div class="text-muted small">${a.desc}</div>
      </label>
    </div>
  `).join('');

  const html = `<div class="modal fade" id="addUModal"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-person-plus"></i> משתמש חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">שם משתמש</label>
          <input id="nu-name" class="form-control form-control-lg" placeholder="לדוגמה: rabbi.cohen">
        </div>
        <div class="col-md-6">
          <label class="form-label">סיסמה</label>
          <input id="nu-pass" class="form-control form-control-lg" placeholder="לפחות 4 ספרות">
        </div>
        <div class="col-12">
          <label class="form-label">תפקיד</label>
          <select id="nu-role" class="form-select form-select-lg">
            ${Object.keys(ROLE_DEFAULTS).map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
          <div class="text-muted small mt-1">בחירת תפקיד מסמנת אוטומטית את ההרשאות המתאימות</div>
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-shield-check"></i> מסכים שיוכל לראות:</h6>
          ${checkboxes}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="saveUser()"><i class="bi bi-check"></i> שמור משתמש</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('addUModal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('addUModal')).show();

  // Auto-set permissions when role changes
  function updatePerms(){
    const role = document.getElementById('nu-role').value;
    const defaults = ROLE_DEFAULTS[role] || [];
    PERMISSION_AREAS.forEach(a => {
      document.getElementById('perm-' + a.key).checked = defaults.includes(a.key);
    });
  }
  document.getElementById('nu-role').addEventListener('change', updatePerms);
  updatePerms();
}

async function saveUser() {
  const checked = Array.from(document.querySelectorAll('.perm-cb:checked')).map(c => c.value);
  const obj = {
    'שם משתמש': document.getElementById('nu-name').value.trim(),
    'סיסמה': document.getElementById('nu-pass').value.trim(),
    'תפקיד': document.getElementById('nu-role').value,
    'הרשאות': checked.length === 4 ? 'all' : checked.join(','),
  };
  if (!obj['שם משתמש'] || !obj['סיסמה']) return alert('שם וסיסמה חובה');
  if (!checked.length) return alert('יש לסמן לפחות מסך אחד');
  const r = await api('addUser', [obj]);
  bootstrap.Modal.getInstance(document.getElementById('addUModal')).hide();
  renderSettings();
}

async function renderReports() {
  document.getElementById('page-reports').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <h3 class="mb-3"><i class="bi bi-file-earmark-pdf"></i> דוחות</h3>
    <div class="row g-3">
      <div class="col-md-4"><div class="card p-3 text-center">
        <i class="bi bi-people fs-1 text-primary"></i>
        <h5>רשימת תלמידים</h5>
        <button class="btn btn-outline-primary" onclick="downloadReport('students')">הורד PDF</button>
      </div></div>
      <div class="col-md-4"><div class="card p-3 text-center">
        <i class="bi bi-clipboard fs-1 text-success"></i>
        <h5>מעקב התנהגות</h5>
        <button class="btn btn-outline-success" onclick="downloadReport('behavior')">הורד PDF</button>
      </div></div>
      <div class="col-md-4"><div class="card p-3 text-center">
        <i class="bi bi-file fs-1 text-info"></i>
        <h5>דוח מלא</h5>
        <button class="btn btn-outline-info" onclick="downloadReport('all')">הורד PDF</button>
      </div></div>
    </div>`;
}

async function downloadReport(type) {
  const r = await api('exportPDF', [type]);
  if (r.ok && r.data && r.data.url) window.open(r.data.url, '_blank');
  else alert('שגיאה: ' + (r.error || 'לא ניתן ליצור דוח'));
}
