// Students page
let _students = [];

async function renderStudents() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3><i class="bi bi-people"></i> רשימת תלמידים</h3>
      <button class="btn btn-primary" onclick="addStudentModal()"><i class="bi bi-plus"></i> תלמיד חדש</button>
    </div>
    <div class="card p-3">
      <input id="s-search" class="form-control mb-3" placeholder="חיפוש תלמיד...">
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr><th>מזהה</th><th>שם מלא</th><th>גיל</th><th>מחזור</th><th>טלפון אם</th></tr>
          </thead>
          <tbody id="students-tbody"></tbody>
        </table>
      </div>
      <div id="s-empty" class="text-center py-5 d-none text-muted"><i class="bi bi-people fs-1"></i><p>אין תלמידים</p></div>
    </div>`;
  document.getElementById('page-students').innerHTML = html;

  const r = await api('listStudents', []);
  _students = r.data || [];
  drawStudents(_students);

  document.getElementById('s-search').oninput = e => {
    const q = e.target.value.toLowerCase();
    if (!q) return drawStudents(_students);
    drawStudents(_students.filter(s =>
      Object.values(s).some(v => String(v).toLowerCase().includes(q))));
  };
}

function drawStudents(list) {
  const tbody = document.getElementById('students-tbody');
  if (!list.length) {
    tbody.innerHTML = '';
    document.getElementById('s-empty').classList.remove('d-none');
    return;
  }
  document.getElementById('s-empty').classList.add('d-none');
  tbody.innerHTML = list.map(s => {
    const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
    const initials = fullName.trim().split(' ').map(w=>w[0]||'').join('').slice(0,2);
    return `<tr style="cursor:pointer">
      <td onclick="viewStudent(${s['מזהה']})">${s['מזהה']||''}</td>
      <td onclick="viewStudent(${s['מזהה']})"><span class="avatar">${initials}</span>${fullName}</td>
      <td onclick="viewStudent(${s['מזהה']})">${s['גיל']||''}</td>
      <td onclick="viewStudent(${s['מזהה']})">${s['מחזור']||''}</td>
      <td onclick="viewStudent(${s['מזהה']})">${s['טלפון אם']||''}</td>
      <td>
        <button class="btn btn-sm btn-outline-info me-1" onclick="viewStudent(${s['מזהה']})" title="צפייה"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editStudent(${s['מזהה']})" title="עריכה"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteStudent(${s['מזהה']})" title="מחיקה"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function viewStudent(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  const events = ((await api('listBehavior', [])).data || [])
    .filter(e => String(e['תלמיד_מזהה']) === String(id))
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const eventsHtml = events.length ? events.map(e => {
    const sev = e['חומרה'] === 'גבוהה' ? 'severity-high' : e['חומרה'] === 'נמוכה' ? 'severity-low' : 'severity-mid';
    const dt = e['תאריך'] ? new Date(e['תאריך']).toLocaleDateString('he-IL') : '';
    return `<div class="card p-2 mb-2 ${sev}">
      <div class="d-flex justify-content-between"><span class="cat-badge">${e['קטגוריה']||''}</span><small class="text-muted">${dt}</small></div>
      <p class="mb-0 mt-1 small">${e['תיאור']||''}</p>
    </div>`;
  }).join('') : '<p class="text-muted">אין אירועים מתועדים</p>';

  const html = `<div class="modal fade" id="viewStuModal"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-person"></i> ${fullName}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-2 mb-3">
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${s['גיל']||'-'}</strong><div class="small text-muted">גיל</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${s['מחזור']||'-'}</strong><div class="small text-muted">מחזור</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${events.length}</strong><div class="small text-muted">אירועים</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${events.filter(e=>e['חומרה']==='גבוהה').length}</strong><div class="small text-muted">חומרה גבוהה</div></div></div>
      </div>
      <h6>פרטים אישיים</h6>
      <table class="table table-sm">
        <tr><td><strong>שם אם</strong></td><td>${s['שם אם']||'-'}</td><td><strong>טלפון אם</strong></td><td>${s['טלפון אם']||'-'}</td></tr>
        <tr><td><strong>שם אב</strong></td><td>${s['שם אב']||'-'}</td><td><strong>טלפון אב</strong></td><td>${s['טלפון אב']||'-'}</td></tr>
        <tr><td><strong>כתובת</strong></td><td colspan="3">${s['כתובת']||'-'}</td></tr>
        ${s['הערות'] ? `<tr><td><strong>הערות</strong></td><td colspan="3">${s['הערות']}</td></tr>` : ''}
      </table>
      <h6 class="mt-3">היסטוריית התנהגות (${events.length})</h6>
      ${eventsHtml}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline-primary" onclick="bootstrap.Modal.getInstance(document.getElementById('viewStuModal')).hide(); editStudent(${id})"><i class="bi bi-pencil"></i> ערוך</button>
      <button class="btn btn-secondary" data-bs-dismiss="modal">סגור</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('viewStuModal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('viewStuModal')).show();
}

function editStudent(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  addStudentModal();
  setTimeout(() => {
    document.getElementById('ns-fname').value = s['שם פרטי']||'';
    document.getElementById('ns-lname').value = s['שם משפחה']||'';
    document.getElementById('ns-age').value = s['גיל']||'';
    document.getElementById('ns-cycle').value = s['מחזור']||'';
    document.getElementById('ns-mname').value = s['שם אם']||'';
    document.getElementById('ns-mphone').value = s['טלפון אם']||'';
    document.getElementById('ns-fname2').value = s['שם אב']||'';
    document.getElementById('ns-fphone').value = s['טלפון אב']||'';
    document.getElementById('ns-addr').value = s['כתובת']||'';
    // Mark as edit mode
    document.getElementById('addStudentModal').dataset.editId = id;
    document.querySelector('#addStudentModal .modal-title').textContent = 'עריכת תלמיד';
  }, 100);
}

async function deleteStudent(id) {
  if (!confirm('בטוח למחוק את התלמיד?')) return;
  await api('deleteStudent', [id]);
  renderStudents();
  loadStats();
}

function addStudentModal() {
  const html = `
    <div class="modal fade" id="addStudentModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5>תלמיד חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div class="row g-2">
              <div class="col-6"><label class="form-label small">שם פרטי</label><input id="ns-fname" class="form-control"></div>
              <div class="col-6"><label class="form-label small">שם משפחה</label><input id="ns-lname" class="form-control"></div>
              <div class="col-4"><label class="form-label small">גיל</label><input id="ns-age" type="number" class="form-control"></div>
              <div class="col-8"><label class="form-label small">מחזור</label><input id="ns-cycle" class="form-control"></div>
              <div class="col-6"><label class="form-label small">שם אם</label><input id="ns-mname" class="form-control"></div>
              <div class="col-6"><label class="form-label small">טלפון אם</label><input id="ns-mphone" class="form-control"></div>
              <div class="col-6"><label class="form-label small">שם אב</label><input id="ns-fname2" class="form-control"></div>
              <div class="col-6"><label class="form-label small">טלפון אב</label><input id="ns-fphone" class="form-control"></div>
              <div class="col-12"><label class="form-label small">כתובת</label><input id="ns-addr" class="form-control"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
            <button class="btn btn-primary" onclick="saveStudent()">שמור</button>
          </div>
        </div>
      </div>
    </div>`;
  const old = document.getElementById('addStudentModal');
  if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('addStudentModal')).show();
}

async function saveStudent() {
  const obj = {
    'שם פרטי': document.getElementById('ns-fname').value,
    'שם משפחה': document.getElementById('ns-lname').value,
    'גיל': document.getElementById('ns-age').value,
    'מחזור': document.getElementById('ns-cycle').value,
    'שם אם': document.getElementById('ns-mname').value,
    'טלפון אם': document.getElementById('ns-mphone').value,
    'שם אב': document.getElementById('ns-fname2').value,
    'טלפון אב': document.getElementById('ns-fphone').value,
    'כתובת': document.getElementById('ns-addr').value,
  };
  if (!obj['שם פרטי']) return alert('שם פרטי חובה');
  const editId = document.getElementById('addStudentModal').dataset.editId;
  if (editId) {
    obj['מזהה'] = parseInt(editId);
    await api('updateStudent', [obj]);
  } else {
    await api('addStudent', [obj]);
  }
  bootstrap.Modal.getInstance(document.getElementById('addStudentModal')).hide();
  renderStudents();
  loadStats();
}
