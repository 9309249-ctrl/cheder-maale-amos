-- migration_student_fields.sql — הוספת שדות פרטי תלמיד (בקשת עמנואל, 2026-08)
-- מוסיף: שם משפחה, תעודת זהות, תאריך לידה עברי.
-- (תאריך לידה לועזי כבר קיים כעמודה birthdate מסוג date.)
-- להריץ ב-Supabase → SQL Editor. בטוח להרצה חוזרת (IF NOT EXISTS).
alter table public.students add column if not exists family        text;
alter table public.students add column if not exists tz            text;
alter table public.students add column if not exists birthdate_heb text;

comment on column public.students.family        is 'שם משפחה';
comment on column public.students.tz            is 'תעודת זהות';
comment on column public.students.birthdate_heb is 'תאריך לידה עברי (טקסט חופשי)';

-- רענון מטמון הסכימה של PostgREST כדי שה-API יזהה את העמודות מיד
notify pgrst, 'reload schema';
