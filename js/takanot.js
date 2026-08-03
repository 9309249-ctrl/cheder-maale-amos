/*
 * takanot.js — לוגיקת טופס בקשת סבסוד ההזנה
 * שומר ל-Supabase דרך ה-RPC המאובטח submit_takanot (js/takanot-supabase.js),
 * מעלה מסמכים ל-Storage הפרטי. אין טוקן/webhook — RLS בצד-שרת הוא ההגנה.
 */

// ההגשה עוברת ל-Supabase (js/takanot-supabase.js) — אין יותר טוקן חשוף בקוד.
const MAX_FILE_MB = 10;

const state = {
  files: { husband: null, wife: null, bank: null, husbandId: null, wifeId: null },
  fileB64: { husband: null, wife: null, bank: null, husbandId: null, wifeId: null },
  extra: [],       // תלושים נוספים — { name, b64 }
  signature: null,
  submitting: false,
};

/* ------------ upload slots ------------- */
function bindSlot(slotId, inputId, key) {
  const slot = document.getElementById(slotId);
  const input = document.getElementById(inputId);
  slot.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.type !== 'application/pdf') {
      alert('רק קבצי PDF מותרים');
      input.value = '';
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`הקובץ גדול מדי, מקסימום ${MAX_FILE_MB} מ״ב`);
      input.value = '';
      return;
    }
    state.files[key] = f;
    slot.classList.add('has-file');
    slot.querySelector('.icon').innerHTML = '<i class="bi bi-file-earmark-check-fill"></i>';
    slot.querySelector('.filesize').innerHTML = `<strong>${f.name}</strong><br>${(f.size/1024/1024).toFixed(2)} מ״ב`;
    // pre-encode to base64
    state.fileB64[key] = await fileToB64(f);
  });
}

/* ------------ multi-file slot (תלושים נוספים) ------------- */
function bindMultiSlot(slotId, inputId) {
  const slot = document.getElementById(slotId);
  const input = document.getElementById(inputId);
  slot.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      if (f.type !== 'application/pdf') { alert('רק קבצי PDF מותרים'); continue; }
      if (f.size > MAX_FILE_MB * 1024 * 1024) { alert(`הקובץ ${f.name} גדול מדי, מקסימום ${MAX_FILE_MB} מ״ב`); continue; }
      state.extra.push({ name: f.name, file: f });
    }
    input.value = '';
    if (state.extra.length) {
      slot.classList.add('has-file');
      slot.querySelector('.icon').innerHTML = '<i class="bi bi-files"></i>';
      slot.querySelector('.filesize').innerHTML =
        `<strong>${state.extra.length} קבצים צורפו</strong><br>` +
        state.extra.map(x => x.name).join('<br>');
    }
  });
}

function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ------------ signature canvas ------------- */
function setupSignature() {
  const canvas = document.getElementById('signature-canvas');
  const ctx = canvas.getContext('2d');
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
  };
  resize();
  window.addEventListener('resize', resize);

  let drawing = false;
  let lastX = 0, lastY = 0;
  let hasDrawn = false;
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
    hasDrawn = true;
  };
  const end = () => { drawing = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start);
  canvas.addEventListener('touchmove', move);
  canvas.addEventListener('touchend', end);

  document.getElementById('clear-sig-btn').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn = false;
  });

  state.getSignature = () => hasDrawn ? canvas.toDataURL('image/png') : null;
}

/* ------------ add child ------------- */
function bindAddChild() {
  const cont = document.getElementById('children-container');
  document.getElementById('add-child-btn').addEventListener('click', () => {
    const idx = cont.children.length;
    const row = document.createElement('div');
    row.className = 'row g-3 child-row mt-2';
    row.dataset.index = idx;
    row.innerHTML = `
      <div class="col-md-6">
        <label class="form-label required">שם הילד</label>
        <input class="form-control form-control-lg" data-field="name" required>
      </div>
      <div class="col-md-3">
        <label class="form-label">תעודת זהות</label>
        <input class="form-control form-control-lg" data-field="id" inputmode="numeric" pattern="\\d{9}" maxlength="9">
      </div>
      <div class="col-md-2">
        <label class="form-label">כיתה</label>
        <input class="form-control form-control-lg" data-field="class">
      </div>
      <div class="col-md-1 d-flex align-items-end">
        <button type="button" class="btn btn-outline-danger" onclick="this.closest('.child-row').remove()"><i class="bi bi-x-lg"></i></button>
      </div>`;
    cont.appendChild(row);
  });
}

/* ------------ validation & submit ------------- */
function collectData() {
  const val = (id) => document.getElementById(id).value.trim();
  const children = [...document.querySelectorAll('.child-row')].map(r => ({
    name: r.querySelector('[data-field=name]').value.trim(),
    id: r.querySelector('[data-field=id]').value.trim(),
    class: r.querySelector('[data-field=class]').value.trim(),
  })).filter(c => c.name);
  return {
    שם_משפחה: val('f-last'),
    שם_בעל: val('f-husband'),
    תז_בעל: val('f-husband-id'),
    שם_אישה: val('f-wife'),
    תז_אישה: val('f-wife-id'),
    טלפון: val('f-phone'),
    מייל: val('f-email'),
    כתובת: val('f-address'),
    ילדים_json: JSON.stringify(children),
    ילדים_תמצית: children.map(c => c.name + (c.class ? ` (${c.class})` : '')).join(', '),
    נטו_בעל: val('f-husband-net'),
    נטו_אישה: val('f-wife-net'),
    נטו_סה_כ: (+val('f-husband-net') || 0) + (+val('f-wife-net') || 0),
    הכנסות_נוספות: val('f-extra-income'),
    מספר_נפשות: val('f-family-size'),
    תאריך_הגשה: new Date().toISOString(),
    סטטוס: 'התקבל',
    מקור_הגשה: 'טופס אונליין',
  };
}

// אימות ת״ז ישראלית אמיתי (ספרת ביקורת) — לא רק 9 ספרות
function validIsraeliId(id) {
  id = String(id || '').trim();
  if (!/^\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = +id[i] * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

function validate(data) {
  const errors = [];
  if (!data.שם_משפחה) errors.push('שם משפחה חסר');
  if (!data.שם_בעל) errors.push('שם הבעל חסר');
  if (!data.שם_אישה) errors.push('שם האישה חסר');
  if (!validIsraeliId(data.תז_בעל)) errors.push('ת״ז הבעל לא תקינה (בדוק את הספרות)');
  if (!validIsraeliId(data.תז_אישה)) errors.push('ת״ז האישה לא תקינה (בדוק את הספרות)');
  if (!/^0\d{8,9}$/.test(data.טלפון)) errors.push('טלפון לא תקין');
  if (data.מייל && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.מייל)) errors.push('כתובת המייל לא תקינה');
  if (!data.כתובת) errors.push('כתובת חסרה');
  if (data.ילדים_json === '[]') errors.push('חובה למלא לפחות ילד אחד');
  if (!/^\d+$/.test(data.נטו_בעל)) errors.push('הכנסת הבעל (נטו) — יש להזין מספר בלבד');
  if (!/^\d+$/.test(data.נטו_אישה)) errors.push('הכנסת האישה (נטו) — יש להזין מספר בלבד');
  if (!/^\d+$/.test(data.מספר_נפשות) || +data.מספר_נפשות < 1) errors.push('מספר נפשות — יש להזין מספר (לפחות 1)');
  if (!document.getElementById('f-agree').checked) errors.push('חובה לאשר את ההצהרה');
  if (!state.files.husband) errors.push('תלוש הבעל לא הועלה');
  if (!state.files.wife) errors.push('תלוש האישה לא הועלה');
  if (!state.files.bank) errors.push('עובר ושב לא הועלה');
  if (!state.files.husbandId) errors.push('תעודת זהות + ספח של הבעל לא הועלו');
  if (!state.files.wifeId) errors.push('תעודת זהות + ספח של האישה לא הועלו');
  const sig = state.getSignature();
  if (!sig) errors.push('חתימה חסרה');
  return { errors, sig };
}

// המרת dataURL (חתימה) ל-File להעלאה ל-Storage
function dataURLtoFile(dataURL, name) {
  const [meta, b64] = String(dataURL).split(',');
  const mime = (meta.match(/:(.*?);/) || [])[1] || 'image/png';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

// מיפוי שדות הטופס (עברית) לעמודות Supabase (אנגלית)
function mapToSB(d) {
  return {
    family_name: d.שם_משפחה, husband_name: d.שם_בעל, husband_id: d.תז_בעל,
    wife_name: d.שם_אישה, wife_id: d.תז_אישה,
    phone: d.טלפון, email: d.מייל, address: d.כתובת,
    children: JSON.parse(d.ילדים_json || '[]'),
    household_size: d.מספר_נפשות,
    gross_husband: null, net_husband: d.נטו_בעל,
    gross_wife: null, net_wife: d.נטו_אישה,
    gross_total: null, net_total: String(d.נטו_סה_כ),
    extra_income: d.הכנסות_נוספות,
  };
}

async function submitForm() {
  if (state.submitting) return;
  const errBox = document.getElementById('form-error');
  errBox.style.display = 'none';
  const data = collectData();
  const { errors, sig } = validate(data);
  if (errors.length) {
    errBox.innerHTML = '<strong>יש למלא:</strong><ul class="mb-0 mt-2">' + errors.map(e => '<li>' + e + '</li>').join('') + '</ul>';
    errBox.style.display = 'block';
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  state.submitting = true;
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> שולח...';

  try {
    if (!window.TakanotSB || !window.TakanotSB.enabled()) {
      throw new Error('המערכת עדיין נטענת — המתן רגע ונסה שוב');
    }
    // העלאת המסמכים ל-Storage הפרטי + הכנסת הבקשה דרך ה-RPC המאובטח (בלי טוקן)
    const filesMap = {
      payslip_husband: [state.files.husband],
      payslip_wife: [state.files.wife],
      bank: [state.files.bank],
      id_husband: [state.files.husbandId],
      id_wife: [state.files.wifeId],
      extra: state.extra.map(x => x.file).filter(Boolean),
      signature: [dataURLtoFile(sig, 'signature.png')],
    };
    const requestId = await window.TakanotSB.submit(mapToSB(data), filesMap);

    document.getElementById('request-id').textContent = requestId;
    document.getElementById('form-view').style.display = 'none';
    document.getElementById('success-view').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    errBox.innerHTML = '<strong>שגיאה בשליחה:</strong> ' + (err.message || err) + '. נסה שוב בעוד רגע.';
    errBox.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send-check"></i> שליחה';
    state.submitting = false;
  }
}

function buildEmailHTML(d, id) {
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kids = JSON.parse(d.ילדים_json || '[]').map(k => `<li>${esc(k.name)}${k.class ? ' — כיתה ' + esc(k.class) : ''}${k.id ? ' — ת״ז ' + esc(k.id) : ''}</li>`).join('');
  return `
  <div style="font-family:Heebo,Arial,sans-serif;direction:rtl;max-width:700px;">
    <h2 style="color:#0d6efd;">בקשת הנחה בשכר לימוד — חיידר מעלה עמוס</h2>
    <p><strong>מספר בקשה:</strong> ${esc(id)}<br>
       <strong>תאריך הגשה:</strong> ${new Date().toLocaleString('he-IL')}</p>
    <h3>פרטי ההורים</h3>
    <ul>
      <li><strong>שם משפחה:</strong> ${esc(d.שם_משפחה)}</li>
      <li><strong>הבעל:</strong> ${esc(d.שם_בעל)} — ת״ז ${esc(d.תז_בעל)}</li>
      <li><strong>האישה:</strong> ${esc(d.שם_אישה)} — ת״ז ${esc(d.תז_אישה)}</li>
      <li><strong>טלפון:</strong> ${esc(d.טלפון)}</li>
      <li><strong>מייל:</strong> ${esc(d.מייל) || '—'}</li>
      <li><strong>כתובת:</strong> ${esc(d.כתובת)}</li>
    </ul>
    <h3>פרטי ילדים</h3>
    <ul>${kids}</ul>
    <h3>הכנסות חודשיות</h3>
    <table style="border-collapse:collapse;width:100%;">
      <tr><td style="border:1px solid #ddd;padding:8px;"><strong>הכנסה</strong></td>
          <td style="border:1px solid #ddd;padding:8px;">ברוטו</td>
          <td style="border:1px solid #ddd;padding:8px;">נטו</td></tr>
      <tr><td style="border:1px solid #ddd;padding:8px;">הבעל</td>
          <td style="border:1px solid #ddd;padding:8px;">${esc(d.ברוטו_בעל)} ₪</td>
          <td style="border:1px solid #ddd;padding:8px;">${esc(d.נטו_בעל)} ₪</td></tr>
      <tr><td style="border:1px solid #ddd;padding:8px;">האישה</td>
          <td style="border:1px solid #ddd;padding:8px;">${esc(d.ברוטו_אישה)} ₪</td>
          <td style="border:1px solid #ddd;padding:8px;">${esc(d.נטו_אישה)} ₪</td></tr>
      <tr style="background:#f4f6f9;"><td style="border:1px solid #ddd;padding:8px;"><strong>סה״כ</strong></td>
          <td style="border:1px solid #ddd;padding:8px;"><strong>${esc(d.ברוטו_סה_כ)} ₪</strong></td>
          <td style="border:1px solid #ddd;padding:8px;"><strong>${esc(d.נטו_סה_כ)} ₪</strong></td></tr>
    </table>
    ${d.הכנסות_נוספות ? `<p><strong>הכנסות נוספות:</strong> ${esc(d.הכנסות_נוספות)}</p>` : ''}
    <p><strong>מספר נפשות במשפחה:</strong> ${esc(d.מספר_נפשות)}</p>
    <p style="margin-top:24px;color:#666;font-size:13px;">מסמכים מצורפים: תלוש בעל, תלוש אישה, עובר ושב, ת״ז + ספח (בעל ואישה)${d._extra_count ? `, ${d._extra_count} תלושים נוספים` : ''} + חתימה דיגיטלית.</p>
  </div>`;
}

/* ------------ init ------------- */
document.addEventListener('DOMContentLoaded', () => {
  bindSlot('slot-husband', 'file-husband', 'husband');
  bindSlot('slot-wife', 'file-wife', 'wife');
  bindSlot('slot-bank', 'file-bank', 'bank');
  bindSlot('slot-husband-id', 'file-husband-id', 'husbandId');
  bindSlot('slot-wife-id', 'file-wife-id', 'wifeId');
  bindMultiSlot('slot-extra', 'file-extra');
  setupSignature();
  bindAddChild();
  document.getElementById('submit-btn').addEventListener('click', submitForm);
});
