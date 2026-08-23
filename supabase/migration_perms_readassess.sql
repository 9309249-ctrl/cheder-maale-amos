-- migration_perms_readassess.sql — 23/08/2026
-- באג שעמנואל דיווח: "רמי ניסה ולא עובד לו, בכלל לא מופיע לו התלמידים".
--
-- שורש הבעיה: המודול 'readassess' (מעקב קריאה) נוסף ל-MODULES ב-17/08, אבל מערכי ה-perms
-- של המשתמשים הקיימים נקבעו לפניו — ולכן **אף אחד** מהם לא ראה את האריח, וגם ניווט ישיר
-- ל-#readassess הוחזר לדף הבית. רק עמנואל (מנהל, perms=null) הצליח, וזה בדיוק מה שהוא תיאר.
--
-- התיקון כאן: הוספת 'readassess' למערך ה-perms של כל אנשי הצוות הפדגוגיים שחסר להם.
-- (ברירות המחדל לפי תפקיד תוקנו במקביל ב-js/auth.js → roleCaps.)
-- idempotent: הרצה חוזרת לא משנה כלום.

update public.profiles
set perms = array_append(perms, 'readassess')
where perms is not null
  and not ('readassess' = any(perms))
  and role in ('מחנך', 'מלמד', 'מפקח');

-- אימות: אמור להחזיר 0 שורות
select id, name, role, perms
from public.profiles
where perms is not null
  and not ('readassess' = any(perms))
  and role in ('מחנך', 'מלמד', 'מפקח');
