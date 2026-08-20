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

## מודל הרשאות (בקשת עמנואל, 2026-08-17) — אל תשנה בלי אישור
- **כל צוות רואה את כל התלמידים** (שמות+פרטים מלאים).
- **כל צוות מדווח על כל תלמיד** (INSERT פתוח בטבלאות הדיווח).
- **צפייה בנתונים/דיווחים — רק לכיתה המשויכת** (SELECT class-scoped ב-RLS; + רואים תמיד את מה שאתה עצמך הזנת).
- מיגרציה אוטוריטטיבית: **`supabase/migration_report_on_all_view_own_class.sql`** (רצה ב-DB).
- ⚠️ **אל תריץ** `migration_report_visibility.sql` / `migration_report_scoping*.sql` — הן יישום ישן ומגביל ("דיווח רק על כיתתך") ש**יחזיר את הבאג** שעמנואל התלונן עליו.
- צד-לקוח: `getStudents`/`accessibleIds` ב-`js/students.js` לא מסננים כיתה (RLS אוכף בשרת).

## התחברות
לפי **מספר טלפון** (לא שם). מייל סינתטי `{טלפון}@bht.co.il`. כניסה-לפי-שם מושבתת בכוונה (אבטחה — אל תחזיר grant ל-anon).
מנהל: עמנואל רקובסקי, טלפון 0548451402.

## שינויים 2026-08-19 (בקשות עמנואל במייל)
- **סבסוד הזנה — מחיקת בקשה:** כפתור פח בטבלה ובחלון הפרטים (`takanot-admin.html` + `TakanotSB.remove`).
  מנהל בלבד (RLS `takanot_admin_delete`); מוחק גם את המסמכים ב-Storage. השורה נמחקת קודם ורק אז הקבצים.
- **משתמש מושבת:** ה"מחיקה" במסך ההרשאות היא השבתה (`active=false`). עכשיו המושבתים נשארים ברשימה
  עם תגית "מושבת" וכפתור **החזרה לפעילות**, כניסה שלהם נחסמת עם הודעה מפורשת, והוספה מחדש של אותו טלפון
  משחזרת את הפרופיל הקיים במקום ליפול על "המספר כבר קיים".
  ⚠️ `is_staff()` דורש `active` — משתמש מושבת לא רואה **שום** נתון (זה מה שקרה למחנך של כיתה א', 19/08).
- **מעקב קריאה:** הציון נכתב חופשי **1–100** (היה בחירה 1–10; ציונים ישנים נשמרים כמות שהם),
  ועריכת שמות העמודות/הוספה/סדר זמינה גם ב**הגדרות והרשאות** (כרטיס "עמודות מעקב קריאה").

## שינוי 2026-08-20 (בקשת עמנואל במייל)
- **מעקב קריאה — שורת "ממוצע כיתתי":** בתחתית טבלת הכיתה (`js/reading-assess.js`, `drawGrid`) נוספה `tfoot`
  עם ממוצע אוטומטי לכל עמודה + מספר התלמידים שנספרו בסוגריים.
  - נספרים **רק** תלמידים שיש להם ציון בעמודה — מי שאין לו ציון אינו נחשב 0.
  - `null`/מחרוזת ריקה מסוננים מפורשות (`Number(null)===0` היה מזייף את הממוצע).
  - עמודה שמערבבת ציונים ישנים (1–10) עם חדשים (1–100) מסומנת ב-⚠️ עם הסבר ב-tooltip — הממוצע שם חסר משמעות.
  - עיצוב: `table.tbl tfoot td` ב-`css/main.css`.
