-- ═══════════════════════════════════════════════════════════════
-- migration_security_fixes.sql · תיקוני אבטחה מביקורת 2026-08-03
-- הרץ ב-SQL Editor (בטוח להריץ שוב). דורש הרשאת בעלים (service).
-- ═══════════════════════════════════════════════════════════════

-- 🔴 #1: form_responses היה פתוח ל-anon (student_id is null בלי בדיקת התחברות).
-- anon יכל לקרוא/לזייף/לשנות/למחוק חתימות. מוסיפים דרישת התחברות.
drop policy if exists fr_staff on public.form_responses;
create policy fr_staff on public.form_responses for all
  using (auth.uid() is not null and (public.is_admin() or student_id is null or public.can_see_student(student_id)))
  with check (auth.uid() is not null and (public.is_admin() or student_id is null or public.can_see_student(student_id)));
-- (זרימת חתימת הורים לא נשברת — עוברת דרך get_signing/submit_signature/submit_general
--  שהן SECURITY DEFINER ועוקפות RLS.)

-- 🟡 #9: הגבלת bucket המסמכים — סוג וקובץ מקסימלי (מצמצם ניצול העלאות אנונימי).
update storage.buckets
   set file_size_limit = 10485760,                                   -- 10MB
       allowed_mime_types = array['application/pdf','image/png','image/jpeg']
 where id = 'takanot-docs';
