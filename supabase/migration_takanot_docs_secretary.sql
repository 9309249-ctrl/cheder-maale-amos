-- migration_takanot_docs_secretary.sql — 2026-09-07
-- עמנואל ביקש לפתוח את "סבסוד הזנה" למזכירה מירי הולצמן.
-- הטבלה takanot_requests כבר נפתחה למזכירה ב-migration_security_hardening (סעיף M-1),
-- אבל ה-policy על ה-Storage נשארה על מחרוזת התפקיד הישנה 'מזכירות' — תפקיד שאינו קיים
-- באף פרופיל. התוצאה: המזכירה רואה את 11 הבקשות אבל כל לחיצה על מסמך מחזירה
-- "שגיאה בהורדת המסמך" (takanot-admin.html → openDoc → TakanotSB.download).
-- כאן מיישרים את ה-Storage לאותה כוונה בדיוק. מחיקה נשארת למנהל בלבד.
-- idempotent.
drop policy if exists takanot_docs_staff_read on storage.objects;
create policy takanot_docs_staff_read on storage.objects for select
  to authenticated
  using (bucket_id = 'takanot-docs' and (public.is_admin() or public.my_role() = 'מזכירה'));
