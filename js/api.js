// Apps Script backend URL
const API_URL = 'https://script.google.com/macros/s/AKfycbzK7LWmXwF1zaOs76wH7JncB19eXr_mfYQol5_k7uZBxq45hOHVIz_FDJPVhOTvF7DksA/exec';

// Local cache fallback for offline / NetFree-blocked
const STORAGE_KEY = 'cheder_data';

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveLocal(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch { /* quota? */ }
}

// Call Apps Script via fetch with JSONP fallback for CORS issues
async function api(fn, args) {
  const local = loadLocal();
  try {
    const res = await fetch(API_URL + '?action=gCall&fn=' + encodeURIComponent(fn) + '&args=' + encodeURIComponent(JSON.stringify(args || [])), {
      method: 'GET', mode: 'cors',
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    // Cache the result
    if (data.ok && fn.startsWith('list')) {
      local[fn] = data.data;
      saveLocal(local);
    }
    return data;
  } catch (e) {
    // Fallback to local cache
    if (fn.startsWith('list') && local[fn]) {
      return { ok: true, data: local[fn], _cached: true };
    }
    return { ok: false, error: e.message };
  }
}

// Local-only operations for fully offline work
function localList(key) {
  const data = loadLocal();
  return data[key] || [];
}

function localAppend(key, obj) {
  const data = loadLocal();
  if (!data[key]) data[key] = [];
  data[key].push(obj);
  saveLocal(data);
}
