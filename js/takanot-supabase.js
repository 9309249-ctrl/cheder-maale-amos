// takanot-supabase.js — שכבת נתונים מאובטחת למודול "סבסוד הזנה" (Supabase + RLS).
// מחליף את ה-webhook עם הטוקן החשוף. מופעל רק כאשר CV3.TAKANOT_SB === true
// ו-window.sb (לקוח Supabase) קיים — אחרת אינרטי, וההתנהגות הישנה נשמרת.
//
// אבטחה: אין כאן שום סוד. ה-anon key ציבורי מעצם עיצובו, וה-RLS בצד-שרת הוא ההגנה:
//   • הגשה עוברת רק דרך ה-RPC submit_takanot (SECURITY DEFINER) — anon לא קורא כלום.
//   • רשימת/עדכון בקשות דורשים session מאומת של צוות (RLS: מנהל/מזכירות).
//   • מסמכים ב-bucket פרטי; קריאה רק בקישור חתום זמני.
(function () {
  'use strict';

  function sb() { return window.sb || null; }
  function enabled() { return !!(window.CV3 && window.CV3.TAKANOT_SB && sb()); }

  function safeName(n) { return String(n || 'file').replace(/[^\w.\-]/g, '_').slice(-80); }

  async function upload(file, code, slot, i) {
    const path = code + '/' + slot + '-' + i + '-' + safeName(file.name);
    const { error } = await sb().storage.from('takanot-docs').upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  }

  window.TakanotSB = {
    enabled: enabled,

    // הגשת בקשה. data = כל שדות הטופס; filesMap = {slot:[File,...]}.
    // מעלה קבצים ל-Storage ואז מכניס דרך ה-RPC המאובטח. מחזיר request_code.
    async submit(data, filesMap) {
      const tmp = 'up-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
      const docs = {};
      const fm = filesMap || {};
      for (const slot in fm) {
        const arr = fm[slot] || [];
        docs[slot] = [];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i]) docs[slot].push(await upload(arr[i], tmp, slot, i));
        }
      }
      const p = Object.assign({}, data, { docs: docs });
      const { data: res, error } = await sb().rpc('submit_takanot', { p: p });
      if (error) throw error;
      if (!res || res.ok !== true) throw new Error((res && res.error) || 'submit_failed');
      return res.request_code;
    },

    // רשימת כל הבקשות (RLS מסנן לפי הרשאה — יחזיר ריק ללא session צוות).
    async list() {
      const { data, error } = await sb().from('takanot_requests')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async updateStatus(id, status, note) {
      const patch = { status: status };
      if (note != null) patch.admin_note = note;
      const { error } = await sb().from('takanot_requests').update(patch).eq('id', id);
      if (error) throw error;
    },

    // קישור חתום זמני (שעה) להורדת מסמך מה-bucket הפרטי.
    async signedUrl(path) {
      const { data, error } = await sb().storage.from('takanot-docs').createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    }
  };
})();
