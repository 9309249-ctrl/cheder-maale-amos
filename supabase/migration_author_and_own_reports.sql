-- migration_author_and_own_reports.sql — בקשת עמנואל, 25/08/2026 (מייל "(ללא נושא)")
--
-- 1. "אני מתבלבל אם זה נרשם בבוקר אצל המחנך או בצהריים" → צריך לראות **מי רשם** כל דיווח.
--    העמודה created_by כבר קיימת ומתמלאת (default auth.uid()), אבל ה-RLS על profiles
--    (prof_self_read = id = auth.uid() OR is_admin()) מנע מכל מי שאינו מנהל לתרגם
--    את המזהה לשם. לכן נוצרת כאן תצוגת ספריית-צוות מצומצמת (שם+תפקיד בלבד).
--    ⚠️ לא מוסיפים policy על profiles עצמה — שם יש גם tz/email/perms שאסור לחשוף.
--
-- 2. "מי שלא מוגדר כמחנך — יראה רק את הדיווחים שהוא כתב; מחנך — כל מה שעל כיתתו."
--    sees_only_own_reports() מוגדרת מחדש לפי **תפקיד** (ולא לפי perms), ומיושמת
--    על כל טבלאות הדיווח — לא רק attendance/tests כמו עד היום.
--
-- ⚠️ אין כאן שום שינוי ב-INSERT: כל איש צוות ממשיך לדווח על **כל** תלמיד.
--    זו בדיוק ההבחנה מ-migration_report_visibility/scoping שאסור להריץ (ראה CLAUDE.md).
-- idempotent — אפשר להריץ שוב.

-- ---------- 1. ספריית צוות לקריאה (שם + תפקיד בלבד) ----------
create or replace view public.staff_directory
with (security_invoker = false) as
  select p.id, p.name, p.role, p.active
  from public.profiles p
  where public.is_staff();          -- רק משתמש צוות פעיל מקבל שורות; anon מקבל ריק

revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;

-- ---------- 2. עוזרי תפקיד ----------
create or replace function public.is_mechanech() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'מחנך', false) $$;

create or replace function public.my_access_mode() returns text
  language sql stable security definer set search_path = public as
$$ select access_mode from public.profiles where id = auth.uid() and active $$;

-- מי רואה רק את מה שהוא עצמו רשם:
--   מנהל/מפקח — לא (רואים הכל).
--   מחנך — לא (רואה את כל מה שעל כיתתו) — אלא אם המנהל נתן לו במפורש access_mode='own'.
--   כל השאר (מלמד/מזכירה/צוות ותפקיד עתידי) — כן.
create or replace function public.sees_only_own_reports() returns boolean
  language sql stable security definer set search_path = public as
$$ select not public.is_admin()
     and not public.is_supervisor()
     and ( coalesce(public.my_access_mode() = 'own', false)
           or not public.is_mechanech() ) $$;

-- ---------- 3. אכיפה אחידה בכל טבלאות הדיווח ----------
-- התבנית: "מה שאני רשמתי" תמיד גלוי; "מה שעל הכיתה שלי" רק למי שאינו מוגבל-לעצמו.
drop policy if exists beh_read on public.behavior_events;
create policy beh_read on public.behavior_events for select
  using ( created_by = auth.uid()
          or (public.can_read_student(student_id) and not public.sees_only_own_reports()) );

drop policy if exists rasm_read on public.reading_assessments;
create policy rasm_read on public.reading_assessments for select
  using ( created_by = auth.uid()
          or (public.can_read_student(student_id) and not public.sees_only_own_reports()) );

drop policy if exists cnv_read on public.conversations;
create policy cnv_read on public.conversations for select
  using ( created_by = auth.uid()
          or (public.can_read_student(student_id) and not public.sees_only_own_reports()) );

drop policy if exists fnc_read on public.functioning;
create policy fnc_read on public.functioning for select
  using ( created_by = auth.uid()
          or (public.can_read_student(student_id) and not public.sees_only_own_reports()) );

drop policy if exists mtg_read on public.meetings;
create policy mtg_read on public.meetings for select
  using ( created_by = auth.uid()
          or (public.can_read_student(student_id) and not public.sees_only_own_reports()) );

drop policy if exists rdg_read on public.reading;
create policy rdg_read on public.reading for select
  using ( created_by = auth.uid()
          or (public.can_read_student(student_id) and not public.sees_only_own_reports()) );

drop policy if exists wrt_read on public.writing;
create policy wrt_read on public.writing for select
  using ( created_by = auth.uid()
          or (public.can_read_student(student_id) and not public.sees_only_own_reports()) );

-- ---------- 4. שמות הכיתות לכל איש צוות ----------
-- cls_read היה has_class_access(id): מלמד ללא שיוך כיתה קיבל **אפס** כיתות, ולכן כל
-- תלמיד הוצג אצלו "ללא כיתה" ובורר הכיתות במסך הנוכחות היה ריק. עד היום זה לא נראה
-- כי מצב 'writeonly' הסתיר ממנו את הרשימות ממילא; ברגע שהוא רואה את הדיווחים שלו — זה צף.
-- שם כיתה אינו מידע רגיש (class_id של כל תלמיד גלוי ממילא בטבלת students,
-- לפי המודל המאושר "כל צוות רואה את כל התלמידים ופרטיהם"). לכן: קריאה לכל צוות פעיל.
-- ⚠️ זו קריאה בלבד — כתיבה/שינוי כיתות נשארת cls_admin (מנהל בלבד).
drop policy if exists cls_read on public.classes;
create policy cls_read on public.classes for select using ( public.is_staff() );
