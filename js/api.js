// ===== BACKEND: GitHub as Database =====
// Read: raw.githubusercontent.com (public, no auth)
// Write: GitHub API with PAT stored in localStorage

const GH_OWNER = '9309249-ctrl';
const GH_REPO  = 'cheder-maale-amos';
const GH_BRANCH = 'main';
const RAW_BASE  = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/data`;
const API_BASE  = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/data`;
const STORAGE_KEY = 'cheder_maale_amos_data';
const GOOGLE_CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';

function getGHToken() { return localStorage.getItem('gh_write_token') || ''; }

function genId() {
  return Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
}

function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveStored(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
}

// ===== GOOGLE SIGN-IN =====
const GOOGLE_USERS_URL = `${RAW_BASE}/google_users.json`;

let _googleUsersCache = null;
async function loadGoogleUsers() {
  if (_googleUsersCache) return _googleUsersCache;
  try {
    const r = await fetch(GOOGLE_USERS_URL + '?t=' + Date.now());
    const d = await r.json();
    _googleUsersCache = d;
    return d;
  } catch { return { users: [] }; }
}

// Called by Google GSI after successful sign-in
window.handleGoogleCredential = async function(response) {
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    const email = payload.email;
    const name  = payload.name || email;
    const picture = payload.picture || '';

    const gUsers = await loadGoogleUsers();
    const allowed = (gUsers.users || []).find(u => u.email === email && u.active !== false);
    if (!allowed) {
      const errEl = document.getElementById('login-error');
      if (errEl) { errEl.textContent = 'כתובת המייל ' + email + ' אינה מורשית. פנה למנהל המערכת.'; errEl.classList.remove('d-none'); }
      return;
    }

    currentUser = {
      username: email,
      name: name,
      picture: picture,
      role: allowed.role || 'משתמש',
      permissions: allowed.permissions || 'all',
      group: allowed.group || '',
    };
    sessionStorage.setItem('user', JSON.stringify(currentUser));
    onLoginSuccess();
  } catch(e) {
    console.error('Google auth error', e);
  }
};

window.initGoogleSignIn = function() {
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(initGoogleSignIn, 500);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: window.handleGoogleCredential,
    auto_select: true,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: false,
  });
  const btn = document.getElementById('google-signin-div');
  if (btn) {
    google.accounts.id.renderButton(btn, {
      theme: 'outline', size: 'large', text: 'signin_with',
      locale: 'he', width: 300, logo_alignment: 'center'
    });
  }
  google.accounts.id.prompt();
};

// ===== GITHUB DATA LAYER =====

// Cache of file SHAs to avoid extra API calls on write
const _shaCache = {};

async function ghRead(collection) {
  try {
    const r = await fetch(`${RAW_BASE}/${collection}.json?t=${Date.now()}`);
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function ghGetSha(collection) {
  if (_shaCache[collection]) return _shaCache[collection];
  try {
    const tok = getGHToken();
    const r = await fetch(`${API_BASE}/${collection}.json`, {
      headers: { Authorization: `token ${tok}`, Accept: 'application/vnd.github.v3+json' }
    });
    const d = await r.json();
    _shaCache[collection] = d.sha;
    return d.sha;
  } catch { return null; }
}

async function ghWrite(collection, data, commitMsg) {
  const tok = getGHToken();
  if (!tok) { notify('לא הוגדר טוקן GitHub — שמירה מקומית בלבד', 'warn'); return false; }
  try {
    const sha = await ghGetSha(collection);
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body = { message: commitMsg || `update ${collection}`, content, branch: GH_BRANCH };
    if (sha) body.sha = sha;
    const r = await fetch(`${API_BASE}/${collection}.json`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${tok}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(body)
    });
    const result = await r.json();
    if (result.content && result.content.sha) _shaCache[collection] = result.content.sha;
    return r.ok;
  } catch(e) {
    console.error('ghWrite error', e);
    notify('שגיאה בשמירה ל-GitHub', 'error');
    return false;
  }
}

// ===== DATA LAYER =====

let _data = null;
let _loaded = false;
const COLLECTIONS = ['students','behavior','categories','classes','functioning','tests','medications','meetings','attendance','conversations','tuition'];

async function loadData() {
  const stored = loadStored();
  _data = {};
  for (const c of COLLECTIONS) {
    _data[c] = Array.isArray(stored[c]) ? stored[c] : [];
  }
  // If cache is empty, pull from GitHub
  const hasAnyData = _data.students.length || _data.behavior.length;
  if (!hasAnyData) {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('טוען נתונים...');
    await pullAllFromGitHub();
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
  _data.students.forEach(s => { if (!s['סטטוס']) s['סטטוס'] = 'פעיל'; });
  // Backfill IDs
  ['students','behavior'].forEach(col => {
    let maxId = _data[col].reduce((m, e) => Math.max(m, parseInt(e['מזהה']) || 0), 0);
    _data[col].forEach(e => { if (!e['מזהה']) { maxId++; e['מזהה'] = maxId; } });
  });
  saveStored(_data);
  return _data;
}

async function pullAllFromGitHub() {
  const results = await Promise.allSettled(
    COLLECTIONS.map(c => ghRead(c).then(d => ({ col: c, data: d })))
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value.data)) {
      _data[r.value.col] = r.value.data;
    }
  }
  saveStored(_data);
  _loaded = true;
}

async function pullFromGitHub(collection) {
  const data = await ghRead(collection);
  if (Array.isArray(data)) {
    _data[collection] = data;
    saveStored(_data);
  }
}

function getData() {
  if (!_loaded && !_data) loadData().then(() => {
    try { window.dispatchEvent(new CustomEvent('cheder-data-refreshed')); } catch {}
  });
  const empty = {};
  for (const c of COLLECTIONS) empty[c] = [];
  return _data || empty;
}

// Background sync every 90 seconds
setInterval(async () => {
  if (!_loaded) return;
  try {
    await pullAllFromGitHub();
    window.dispatchEvent(new CustomEvent('cheder-data-refreshed'));
  } catch {}
}, 90000);

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function jsAttr(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// ===== DATA ACCESS FUNCTIONS =====

function canMutateStudent(sid) {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  if (u.role === 'מנהל') return true;
  const gUsers = _googleUsersCache;
  const userEntry = (gUsers?.users || []).find(x => x.email === u.username);
  if (!userEntry) return false;
  if (!_data.students || !_data.students.length) return true;
  const p = userEntry.permissions || 'all';
  if (p === 'all') return true;
  return false;
}

function getVisibleData(collection) {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  const arr = (_data || {})[collection] || [];
  if (u.role === 'מנהל') return arr;
  const gUsers = _googleUsersCache;
  const userEntry = (gUsers?.users || []).find(x => x.email === u.username);
  if (!userEntry || userEntry.permissions === 'all') return arr;
  // For now return all — permission filtering can be extended later
  return arr;
}

// ===== CRUD API =====

const _ensuredSchema = {};
async function ensureLoaded() {
  if (!_loaded) await loadData();
  _loaded = true;
}

// Main API dispatcher — keeps same interface as original
async function api(action, args) {
  await ensureLoaded();
  const d = _data;
  try {
    switch (action) {
      // ---- AUTH (now handled by Google Sign-In, but kept for compatibility) ----
      case 'authenticate': {
        // Legacy fallback — should not be called in normal flow anymore
        return { ok: true, data: { ok: false, error: 'השתמש בכניסה עם Google' }};
      }
      case 'listUsers': {
        const gUsers = await loadGoogleUsers();
        return { ok: true, data: (gUsers.users || []).map(u => ({
          'שם משתמש': u.email, 'שם מלא': u.name, 'תפקיד': u.role,
          'הרשאות': u.permissions, 'פעיל': u.active !== false ? 'כן' : 'לא'
        }))};
      }

      // ---- STUDENTS ----
      case 'listStudents': return { ok: true, data: getVisibleData('students') };
      case 'addStudent': {
        const row = { ...args[0], מזהה: genId() };
        d.students.push(row);
        saveStored(d);
        await ghWrite('students', d.students, `הוספת תלמיד: ${row['שם'] || row['מזהה']}`);
        return { ok: true, data: row };
      }
      case 'updateStudent': {
        const [matchKey, matchVal, updates] = args;
        const idx = d.students.findIndex(s => String(s[matchKey]) === String(matchVal));
        if (idx < 0) return { ok: false, error: 'לא נמצא' };
        d.students[idx] = { ...d.students[idx], ...updates };
        saveStored(d);
        await ghWrite('students', d.students, `עדכון תלמיד: ${matchVal}`);
        return { ok: true, data: d.students[idx] };
      }
      case 'deleteStudent': {
        const [matchKey, matchVal] = args;
        d.students = d.students.filter(s => String(s[matchKey]) !== String(matchVal));
        saveStored(d);
        await ghWrite('students', d.students, `מחיקת תלמיד: ${matchVal}`);
        return { ok: true };
      }

      // ---- BEHAVIOR ----
      case 'listBehavior': return { ok: true, data: d.behavior || [] };
      case 'addBehavior': {
        const row = { ...args[0], מזהה: genId() };
        d.behavior.push(row);
        saveStored(d);
        await ghWrite('behavior', d.behavior, `אירוע: ${row['קטגוריה'] || ''}`);
        return { ok: true, data: row };
      }
      case 'updateBehavior': {
        const [matchKey, matchVal, updates] = args;
        const idx = d.behavior.findIndex(e => String(e[matchKey]) === String(matchVal));
        if (idx >= 0) { d.behavior[idx] = { ...d.behavior[idx], ...updates }; saveStored(d); await ghWrite('behavior', d.behavior, `עדכון אירוע`); }
        return { ok: true };
      }
      case 'deleteBehavior': {
        const [matchKey, matchVal] = args;
        d.behavior = d.behavior.filter(e => String(e[matchKey]) !== String(matchVal));
        saveStored(d);
        await ghWrite('behavior', d.behavior, `מחיקת אירוע`);
        return { ok: true };
      }

      // ---- CATEGORIES ----
      case 'listCategories': return { ok: true, data: d.categories || [] };
      case 'addCategory': {
        const row = { ...args[0], מזהה: genId() };
        d.categories.push(row);
        saveStored(d);
        await ghWrite('categories', d.categories, `קטגוריה: ${row['שם']}`);
        return { ok: true, data: row };
      }
      case 'deleteCategory': {
        const [matchKey, matchVal] = args;
        d.categories = d.categories.filter(c => String(c[matchKey]) !== String(matchVal));
        saveStored(d);
        await ghWrite('categories', d.categories, `מחיקת קטגוריה`);
        return { ok: true };
      }

      // ---- CLASSES ----
      case 'listClasses': return { ok: true, data: d.classes || [] };
      case 'addClass': {
        const row = { ...args[0], מזהה: genId() };
        d.classes.push(row);
        saveStored(d);
        await ghWrite('classes', d.classes, `כיתה: ${row['שם']}`);
        return { ok: true, data: row };
      }
      case 'updateClass': {
        const [matchKey, matchVal, updates] = args;
        const idx = d.classes.findIndex(c => String(c[matchKey]) === String(matchVal));
        if (idx >= 0) { d.classes[idx] = { ...d.classes[idx], ...updates }; saveStored(d); await ghWrite('classes', d.classes, `עדכון כיתה`); }
        return { ok: true };
      }
      case 'deleteClass': {
        const [matchKey, matchVal] = args;
        d.classes = d.classes.filter(c => String(c[matchKey]) !== String(matchVal));
        saveStored(d);
        await ghWrite('classes', d.classes, `מחיקת כיתה`);
        return { ok: true };
      }

      // ---- FUNCTIONING / TESTS / MEDICATIONS / ATTENDANCE ----
      case 'listFunctioning': return { ok: true, data: d.functioning || [] };
      case 'addFunctioning': {
        const row = { ...args[0], מזהה: genId() };
        d.functioning.push(row);
        saveStored(d);
        await ghWrite('functioning', d.functioning, `תפקוד`);
        return { ok: true, data: row };
      }
      case 'updateFunctioning': {
        const [k,v,u2] = args;
        const idx = d.functioning.findIndex(x => String(x[k])===String(v));
        if (idx>=0){d.functioning[idx]={...d.functioning[idx],...u2};saveStored(d);await ghWrite('functioning',d.functioning,'עדכון תפקוד');}
        return { ok: true };
      }
      case 'deleteFunctioning': {
        d.functioning = d.functioning.filter(x=>String(x[args[0]])!==String(args[1]));
        saveStored(d); await ghWrite('functioning',d.functioning,'מחיקת תפקוד');
        return { ok: true };
      }

      case 'listTests': return { ok: true, data: d.tests || [] };
      case 'addTest': {
        const row={...args[0],מזהה:genId()};d.tests.push(row);saveStored(d);await ghWrite('tests',d.tests,'מבחן');return{ok:true,data:row};
      }
      case 'updateTest': {
        const [k,v,u2]=args,idx=d.tests.findIndex(x=>String(x[k])===String(v));
        if(idx>=0){d.tests[idx]={...d.tests[idx],...u2};saveStored(d);await ghWrite('tests',d.tests,'עדכון מבחן');}
        return{ok:true};
      }
      case 'deleteTest': {
        d.tests=d.tests.filter(x=>String(x[args[0]])!==String(args[1]));saveStored(d);await ghWrite('tests',d.tests,'מחיקת מבחן');return{ok:true};
      }

      case 'listMedications': return { ok: true, data: d.medications || [] };
      case 'addMedication': {
        const row={...args[0],מזהה:genId()};d.medications.push(row);saveStored(d);await ghWrite('medications',d.medications,'תרופה');return{ok:true,data:row};
      }
      case 'updateMedication': {
        const [k,v,u2]=args,idx=d.medications.findIndex(x=>String(x[k])===String(v));
        if(idx>=0){d.medications[idx]={...d.medications[idx],...u2};saveStored(d);await ghWrite('medications',d.medications,'עדכון תרופה');}
        return{ok:true};
      }
      case 'deleteMedication': {
        d.medications=d.medications.filter(x=>String(x[args[0]])!==String(args[1]));saveStored(d);await ghWrite('medications',d.medications,'מחיקת תרופה');return{ok:true};
      }

      case 'listAttendance': return { ok: true, data: d.attendance || [] };
      case 'addAttendance': {
        const row={...args[0],מזהה:genId()};d.attendance.push(row);saveStored(d);await ghWrite('attendance',d.attendance,'נוכחות');return{ok:true,data:row};
      }
      case 'updateAttendance': {
        const [k,v,u2]=args,idx=d.attendance.findIndex(x=>String(x[k])===String(v));
        if(idx>=0){d.attendance[idx]={...d.attendance[idx],...u2};saveStored(d);await ghWrite('attendance',d.attendance,'עדכון נוכחות');}
        return{ok:true};
      }
      case 'deleteAttendance': {
        d.attendance=d.attendance.filter(x=>String(x[args[0]])!==String(args[1]));saveStored(d);await ghWrite('attendance',d.attendance,'מחיקת נוכחות');return{ok:true};
      }

      // ---- MEETINGS / CONVERSATIONS ----
      case 'listMeetings': return { ok: true, data: d.meetings || [] };
      case 'addMeeting': {
        const row={...args[0],מזהה:genId()};d.meetings.push(row);saveStored(d);await ghWrite('meetings',d.meetings,'אסיפה');return{ok:true,data:row};
      }
      case 'updateMeeting': {
        const [k,v,u2]=args,idx=d.meetings.findIndex(x=>String(x[k])===String(v));
        if(idx>=0){d.meetings[idx]={...d.meetings[idx],...u2};saveStored(d);await ghWrite('meetings',d.meetings,'עדכון אסיפה');}
        return{ok:true};
      }
      case 'deleteMeeting': {
        d.meetings=d.meetings.filter(x=>String(x[args[0]])!==String(args[1]));saveStored(d);await ghWrite('meetings',d.meetings,'מחיקת אסיפה');return{ok:true};
      }

      case 'listConversations': return { ok: true, data: d.conversations || [] };
      case 'addConversation': {
        const row={...args[0],מזהה:genId()};d.conversations.push(row);saveStored(d);await ghWrite('conversations',d.conversations,'שיחה');return{ok:true,data:row};
      }
      case 'updateConversation': {
        const [k,v,u2]=args,idx=d.conversations.findIndex(x=>String(x[k])===String(v));
        if(idx>=0){d.conversations[idx]={...d.conversations[idx],...u2};saveStored(d);await ghWrite('conversations',d.conversations,'עדכון שיחה');}
        return{ok:true};
      }
      case 'deleteConversation': {
        d.conversations=d.conversations.filter(x=>String(x[args[0]])!==String(args[1]));saveStored(d);await ghWrite('conversations',d.conversations,'מחיקת שיחה');return{ok:true};
      }

      // ---- TUITION ----
      case 'listTuition': return { ok: true, data: d.tuition || [] };
      case 'addTuition': {
        const row={...args[0],מזהה:genId()};d.tuition.push(row);saveStored(d);await ghWrite('tuition',d.tuition,'תשלום שכ"ל');return{ok:true,data:row};
      }
      case 'updateTuition': {
        const [k,v,u2]=args,idx=d.tuition.findIndex(x=>String(x[k])===String(v));
        if(idx>=0){d.tuition[idx]={...d.tuition[idx],...u2};saveStored(d);await ghWrite('tuition',d.tuition,'עדכון תשלום');}
        return{ok:true};
      }
      case 'deleteTuition': {
        d.tuition=d.tuition.filter(x=>String(x[args[0]])!==String(args[1]));saveStored(d);await ghWrite('tuition',d.tuition,'מחיקת תשלום');return{ok:true};
      }

      // ---- AUDIT LOG ----
      case 'listAuditLog': return { ok: true, data: [] };

      default: return { ok: false, error: 'unknown action: ' + action };
    }
  } catch(e) {
    console.error('api error', action, e);
    return { ok: false, error: e.message };
  }
}

// ===== ADMIN: Save GitHub token =====
window.saveGHToken = function(token) {
  localStorage.setItem('gh_write_token', token.trim());
  _shaCache; // reset
  Object.keys(_shaCache).forEach(k => delete _shaCache[k]);
  notify('טוקן GitHub נשמר', 'success');
};

window.pullNow = async function() {
  showLoadingOverlay('מרענן נתונים...');
  await pullAllFromGitHub();
  hideLoadingOverlay();
  window.dispatchEvent(new CustomEvent('cheder-data-refreshed'));
  notify('נתונים עודכנו', 'success');
};

// Compatibility shims for modules that call these directly
window.getData      = getData;
window.escHtml      = escHtml;
window.jsAttr       = jsAttr;
window.genId        = genId;
window.api          = api;
window.canMutateStudent = canMutateStudent;
window.getVisibleData   = getVisibleData;
