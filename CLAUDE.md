# CLAUDE.md — cheder-maale-amos (מעקב תלמידים)

## ⚠️ DEPLOY — קרא לפני כל push!
**אתר הפרודקשן היחיד:** https://9309249-ctrl.github.io/cheder-maale-amos/
- remote: **`ctrl`** = `github.com/9309249-ctrl/cheder-maale-amos` (branch `main`).
- **deploy = `git push ctrl HEAD:main`** → GitHub Pages בונה אוטומטית (SW network-first, רענון מספיק).

**אל תדחוף ל-`orgnew` (maale-amos/cheder)** — זה **אתר מת** (DEMO, SUPABASE ריק, Pages כובה 2026-08-14).
בעבר נדחפו שינויים לשם בטעות והם לא הופיעו לעמנואל. `origin` (yossi6742853) = fork אישי מפוצל.

## Supabase
- project ref `jpoxcwtigyvzjrlejzri`. anon key ב-`js/config.js` (ציבורי; הגנה=RLS).
- כתיבה/DDL/מיגרציות: Management API PAT ב-`_CREDENTIALS.md` (gitignored) —
  `POST https://api.supabase.com/v1/projects/jpoxcwtigyvzjrlejzri/database/query`.

## טבלת students — שדות (כולם קיימים ב-DB ובטופס `js/students.js`)
name, family, tz, class_id, birthdate, birthdate_heb, parent_name, parent_phone,
**mother_name, mother_phone, mother_email**, address, status, notes.
- הטופס "תלמיד חדש"/עריכה מציג את **כל** השדות (יושר לעמודות האקסל של עמנואל, 2026-08-14).
- לחיצה על שם תלמיד ברשימה פותחת את כרטיס התלמיד.

## התחברות
לפי **מספר טלפון** (לא שם). מייל סינתטי `{טלפון}@bht.co.il`. כניסה-לפי-שם מושבתת בכוונה (אבטחה — אל תחזיר grant ל-anon).
מנהל: עמנואל רקובסקי, טלפון 0548451402.
