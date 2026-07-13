// ===== מודול שכר לימוד =====
// גבייה חודשית: רישום תשלומים, מעקב חובות, סטטיסטיקה

const PAYMENT_METHODS = ['הו"ק בית יעקב', 'הו"ק עמותה', 'העברה בנקאית', 'מזומן', 'אחר'];
const PAYMENT_TYPES   = ['לבן', 'שחור'];

async function renderTuition() {
  const page = document.getElementById('page-tuition');
  if (!page) return;

  const studentsR = await api('listStudents', []);
  const students  = (studentsR.data || []).filter(s => (s['סטטוס'] || 'פעיל') !== 'סיים');
  const tuitionR  = await api('listTuition', []);
  const payments  = tuitionR.data || [];

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // Stats
  const totalExpected = students.length * getMonthlyFee();
  const thisMonthPaid = payments.filter(p => (p['חודש'] || '').startsWith(thisMonth.substring(0,7)))
                                .reduce((s,p) => s + (parseFloat(p['סכום']) || 0), 0);
  const allPaid       = payments.reduce((s,p) => s + (parseFloat(p['סכום']) || 0), 0);

  page.innerHTML = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <h4><i class="bi bi-cash-coin text-success me-2"></i>שכר לימוד — גבייה</h4>
  <div class="d-flex gap-2">
    <button class="btn btn-sm btn-outline-secondary" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה</button>
    <button class="btn btn-sm btn-success" onclick="openAddPayment()"><i class="bi bi-plus-lg"></i> רישום תשלום</button>
  </div>
</div>

<!-- סטטיסטיקה -->
<div class="row g-3 mb-4">
  <div class="col-md-3">
    <div class="card text-center p-3 border-0 shadow-sm" style="background:linear-gradient(135deg,#8B6B14,#c9a227)">
      <div class="display-6 text-white fw-bold">${students.length}</div>
      <div class="text-white-75 small">תלמידים</div>
    </div>
  </div>
  <div class="col-md-3">
    <div class="card text-center p-3 border-0 shadow-sm bg-success bg-opacity-10">
      <div class="display-6 text-success fw-bold">₪${thisMonthPaid.toLocaleString()}</div>
      <div class="text-muted small">גביית ${new Date(now.getFullYear(), now.getMonth()).toLocaleDateString('he-IL',{month:'long',year:'numeric'})}</div>
    </div>
  </div>
  <div class="col-md-3">
    <div class="card text-center p-3 border-0 shadow-sm bg-primary bg-opacity-10">
      <div class="display-6 text-primary fw-bold">₪${allPaid.toLocaleString()}</div>
      <div class="text-muted small">סה"כ כל הזמנים</div>
    </div>
  </div>
  <div class="col-md-3">
    <div class="card text-center p-3 border-0 shadow-sm bg-danger bg-opacity-10">
      <div class="display-6 text-danger fw-bold">${getDebtCount(students, payments, thisMonth)}</div>
      <div class="text-muted small">חייבים החודש</div>
    </div>
  </div>
</div>

<!-- חיפוש ופילטר -->
<div class="card p-3 mb-3">
  <div class="row g-2 align-items-end">
    <div class="col-md-4">
      <input id="tuition-search" class="form-control form-control-sm" placeholder="חפש תלמיד..." oninput="filterTuition()">
    </div>
    <div class="col-md-3">
      <select id="tuition-month-filter" class="form-select form-select-sm" onchange="filterTuition()">
        <option value="">כל החודשים</option>
        ${getLastMonths(6).map(m => `<option value="${m}" ${m===thisMonth?'selected':''}>${formatMonth(m)}</option>`).join('')}
      </select>
    </div>
    <div class="col-md-3">
      <select id="tuition-method-filter" class="form-select form-select-sm" onchange="filterTuition()">
        <option value="">כל שיטות התשלום</option>
        ${PAYMENT_METHODS.map(m => `<option>${m}</option>`).join('')}
      </select>
    </div>
    <div class="col-md-2">
      <button class="btn btn-sm btn-outline-primary w-100" onclick="exportTuitionCSV()"><i class="bi bi-download me-1"></i>Excel</button>
    </div>
  </div>
</div>

<!-- טבלת תשלומים -->
<div class="card">
  <div class="card-header d-flex justify-content-between">
    <span class="fw-bold">רשומות תשלום</span>
    <span id="tuition-count" class="badge bg-secondary">0</span>
  </div>
  <div class="table-responsive">
    <table class="table table-hover table-sm mb-0" id="tuition-table">
      <thead class="table-light">
        <tr>
          <th>תלמיד</th>
          <th>חודש</th>
          <th>סכום</th>
          <th>שיטה</th>
          <th>לבן/שחור</th>
          <th>הערות</th>
          <th>תאריך</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="tuition-tbody"></tbody>
    </table>
  </div>
</div>

<!-- מצב חובות לפי תלמיד -->
<div class="card mt-3">
  <div class="card-header fw-bold"><i class="bi bi-people me-2"></i>מצב גבייה לפי תלמיד</div>
  <div class="table-responsive">
    <table class="table table-sm mb-0">
      <thead class="table-light"><tr><th>שם</th><th>כיתה</th><th>סה"כ שולם</th><th>תשלומים</th><th>אחרון</th><th></th></tr></thead>
      <tbody id="student-debt-tbody"></tbody>
    </table>
  </div>
</div>

<!-- מודל הוספת תשלום -->
<div class="modal fade" id="modal-add-payment" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header" style="background:#8B6B14">
        <h5 class="modal-title text-white">רישום תשלום שכ"ל</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label fw-bold">תלמיד *</label>
          <select id="pay-student" class="form-select">
            <option value="">בחר תלמיד</option>
            ${students.sort((a,b)=>((a['שם']||'')).localeCompare(b['שם']||'')).map(s =>
              `<option value="${escHtml(s['שם']||s['מזהה'])}">${escHtml(s['שם']||'')} ${escHtml(s['כיתה']?'('+s['כיתה']+')':'')}</option>`
            ).join('')}
          </select>
        </div>
        <div class="row g-2 mb-3">
          <div class="col">
            <label class="form-label fw-bold">חודש *</label>
            <input type="month" id="pay-month" class="form-control" value="${thisMonth}">
          </div>
          <div class="col">
            <label class="form-label fw-bold">סכום ₪ *</label>
            <input type="number" id="pay-amount" class="form-control" placeholder="0" min="0">
          </div>
        </div>
        <div class="row g-2 mb-3">
          <div class="col">
            <label class="form-label fw-bold">שיטת תשלום</label>
            <select id="pay-method" class="form-select">
              ${PAYMENT_METHODS.map(m=>`<option>${m}</option>`).join('')}
            </select>
          </div>
          <div class="col">
            <label class="form-label fw-bold">סוג</label>
            <select id="pay-type" class="form-select">
              ${PAYMENT_TYPES.map(t=>`<option>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">הערות</label>
          <input id="pay-notes" class="form-control" placeholder="הערות נוספות...">
        </div>
        <div id="pay-error" class="alert alert-danger d-none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
        <button class="btn btn-success" onclick="savePayment()"><i class="bi bi-check-lg me-1"></i>שמור תשלום</button>
      </div>
    </div>
  </div>
</div>
`;

  // שמור state
  window._tuitionStudents = students;
  window._tuitionPayments = payments;

  filterTuition();
  renderStudentDebts(students, payments);
}

function getMonthlyFee() { return parseFloat(localStorage.getItem('monthly_fee') || '0'); }

function getDebtCount(students, payments, month) {
  const monthStr = month.substring(0,7);
  const paidStudents = new Set(payments.filter(p => (p['חודש']||'').substring(0,7) === monthStr).map(p => p['תלמיד']));
  return students.filter(s => !paidStudents.has(s['שם'] || s['מזהה'])).length;
}

function getLastMonths(n) {
  const months = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

function formatMonth(m) {
  try {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo-1).toLocaleDateString('he-IL', {month:'long', year:'numeric'});
  } catch { return m; }
}

function filterTuition() {
  const search = (document.getElementById('tuition-search')?.value || '').toLowerCase();
  const month  = document.getElementById('tuition-month-filter')?.value || '';
  const method = document.getElementById('tuition-method-filter')?.value || '';
  const payments = window._tuitionPayments || [];

  const filtered = payments.filter(p => {
    if (search && !(p['תלמיד']||'').toLowerCase().includes(search)) return false;
    if (month && !(p['חודש']||'').startsWith(month.substring(0,7))) return false;
    if (method && p['שיטה'] !== method) return false;
    return true;
  }).sort((a,b) => (b['תאריך']||'').localeCompare(a['תאריך']||''));

  const tbody = document.getElementById('tuition-tbody');
  if (!tbody) return;
  const badge = document.getElementById('tuition-count');
  if (badge) badge.textContent = filtered.length;

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td class="fw-bold">${escHtml(p['תלמיד']||'')}</td>
      <td><span class="badge bg-light text-dark border">${escHtml(p['חודש']||'')}</span></td>
      <td class="text-success fw-bold">₪${(parseFloat(p['סכום'])||0).toLocaleString()}</td>
      <td><span class="badge" style="background:#e8f4e8;color:#166534">${escHtml(p['שיטה']||'')}</span></td>
      <td><span class="badge ${p['סוג']==='שחור'?'bg-dark':'bg-primary'}">${escHtml(p['סוג']||'')}</span></td>
      <td class="text-muted small">${escHtml(p['הערות']||'')}</td>
      <td class="text-muted small">${escHtml(p['תאריך']||'')}</td>
      <td>
        <button class="btn btn-sm btn-outline-danger" onclick="deletePayment('${p['מזהה']}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" class="text-center text-muted py-4">אין תשלומים</td></tr>';
}

function renderStudentDebts(students, payments) {
  const tbody = document.getElementById('student-debt-tbody');
  if (!tbody) return;

  tbody.innerHTML = students.sort((a,b)=>(a['שם']||'').localeCompare(b['שם']||'')).map(s => {
    const name = s['שם'] || s['מזהה'];
    const sPayments = payments.filter(p => p['תלמיד'] === name);
    const total = sPayments.reduce((sum,p) => sum + (parseFloat(p['סכום'])||0), 0);
    const last  = sPayments.sort((a,b)=>(b['תאריך']||'').localeCompare(a['תאריך']||''))[0];
    return `
      <tr>
        <td class="fw-bold">${escHtml(name)}</td>
        <td><span class="badge bg-light text-dark border">${escHtml(s['כיתה']||'')}</span></td>
        <td class="text-success fw-bold">₪${total.toLocaleString()}</td>
        <td><span class="badge bg-info text-dark">${sPayments.length}</span></td>
        <td class="text-muted small">${escHtml(last?.['תאריך']||'—')}</td>
        <td>
          <button class="btn btn-sm btn-outline-success" onclick="quickAddPayment('${escHtml(jsAttr(name))}')">
            <i class="bi bi-plus"></i> תשלום
          </button>
        </td>
      </tr>`;
  }).join('');
}

window.openAddPayment = function(studentName) {
  const modal = new bootstrap.Modal(document.getElementById('modal-add-payment'));
  if (studentName) {
    const sel = document.getElementById('pay-student');
    if (sel) sel.value = studentName;
  }
  document.getElementById('pay-error')?.classList.add('d-none');
  modal.show();
};

window.quickAddPayment = function(name) { openAddPayment(name); };

window.savePayment = async function() {
  const student = document.getElementById('pay-student')?.value;
  const month   = document.getElementById('pay-month')?.value;
  const amount  = parseFloat(document.getElementById('pay-amount')?.value);
  const method  = document.getElementById('pay-method')?.value;
  const type    = document.getElementById('pay-type')?.value;
  const notes   = document.getElementById('pay-notes')?.value || '';
  const errEl   = document.getElementById('pay-error');

  if (!student) { errEl.textContent = 'יש לבחור תלמיד'; errEl.classList.remove('d-none'); return; }
  if (!month)   { errEl.textContent = 'יש לבחור חודש'; errEl.classList.remove('d-none'); return; }
  if (!amount || amount <= 0) { errEl.textContent = 'יש להזין סכום'; errEl.classList.remove('d-none'); return; }

  const today = new Date().toISOString().split('T')[0];
  const row = { תלמיד: student, חודש: month, סכום: amount, שיטה: method, סוג: type, הערות: notes, תאריך: today };

  try {
    await api('addTuition', [row]);
    bootstrap.Modal.getInstance(document.getElementById('modal-add-payment'))?.hide();
    notify('התשלום נרשם בהצלחה', 'success');
    renderTuition();
  } catch(e) {
    errEl.textContent = 'שגיאה בשמירה: ' + e.message;
    errEl.classList.remove('d-none');
  }
};

window.deletePayment = async function(id) {
  if (!confirm('למחוק תשלום זה?')) return;
  await api('deleteTuition', ['מזהה', id]);
  notify('נמחק', 'success');
  renderTuition();
};

window.exportTuitionCSV = function() {
  const payments = window._tuitionPayments || [];
  if (!payments.length) { notify('אין נתונים לייצוא', 'warn'); return; }
  const headers = ['תלמיד','חודש','סכום','שיטה','סוג','הערות','תאריך'];
  const rows = [headers.join(','), ...payments.map(p => headers.map(h => '"'+(p[h]||'')+'"').join(','))];
  const blob = new Blob(['﻿'+rows.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `שכ"ל_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
};
