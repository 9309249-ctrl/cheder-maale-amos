// ai-proxy.js — שכבת-תעבורה אחת לכל קריאות ה-AI הגנרטיבי במערכת (חוות דעת חינוכית).
//
// הקריאה עוברת תמיד דרך supabase/functions/ai: המפתח שמור כסוד צד-שרת
// (Supabase secret GEMINI_KEY), הלקוח לא נוגע בו. אצל משתמשים שהסינון שלהם
// חוסם גישה ישירה ל-Gemini/Cloudflare מהדפדפן — Supabase כן מאושר אצל כולם
// (בלעדיו אין התחברות בכלל לאתר עצמו), ולכן זה עובד תמיד. (זהה בתבנית
// ל-cv3call שכבר קיים בבית התלמוד; ראה שם להשוואה.)
//
// window.cv3call(model, body, signal) → Response (כמו fetch: יש .ok/.json()).
(function () {
  'use strict';

  async function cv3call(model, body, signal) {
    const cfg = window.CV3 || {};
    const base = cfg.SUPABASE_URL || '';
    let jwt = '';
    try {
      const s = window.sb && window.sb.auth && (await window.sb.auth.getSession());
      jwt = (s && s.data && s.data.session && s.data.session.access_token) || '';
    } catch (_) {}
    if (!base) throw new Error('חסר חיבור לשרת');
    if (!jwt) throw new Error('צריך להתחבר מחדש כדי להשתמש ב-AI');
    return fetch(base + '/functions/v1/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.SUPABASE_ANON_KEY || '',
        Authorization: 'Bearer ' + jwt,
      },
      body: JSON.stringify({ model: model, body: body }),
      signal: signal,
    });
  }

  window.cv3call = cv3call;
})();
