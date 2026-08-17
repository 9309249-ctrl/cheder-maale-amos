-- מודל עמנואל (2026-08-17):
--   • כל צוות רואה את כל התלמידים (שמות+פרטים).
--   • כל צוות יכול לדווח על כל תלמיד (INSERT בטבלאות הדיווח).
--   • צפייה בנתונים/דיווחים — רק לכיתה המשויכת (SELECT נשאר class-scoped),
--     בתוספת "רואים תמיד את מה שאתה עצמך הזנת" (created_by) — נדרש כדי ש-INSERT
--     עם returning לא ייכשל, וגם הגיוני (רואים את הדיווח שכתבת).
-- אידמפוטנטי: אפשר להריץ שוב.

-- צוות פעיל כלשהו
create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path to 'public' as
$$ select exists(select 1 from public.profiles where id = auth.uid() and active) $$;

-- ── students: כל צוות רואה את כולם ──
drop policy if exists stu_read on public.students;
create policy stu_read on public.students for select to authenticated
  using ( public.is_staff() );

-- ── טבלאות עם insert נפרד: פותחים דיווח לכולם (הקריאה כבר כוללת created_by) ──
drop policy if exists beh_ins on public.behavior_events;
create policy beh_ins on public.behavior_events for insert to authenticated
  with check ( public.is_staff() );
-- יישור beh_read לשאר הטבלאות: מחנך רואה את דיווחי ההתנהגות של כיתתו (גם של אחרים),
-- בלי תלות בהרשאת 'reports'. (קודם דרש can_see_all_reports → מחנך לא ראה דיווחי כיתתו.)
drop policy if exists beh_read on public.behavior_events;
create policy beh_read on public.behavior_events for select to authenticated
  using ( public.is_admin() or created_by = auth.uid() or public.can_read_student(student_id) );

drop policy if exists att_ins on public.attendance;
create policy att_ins on public.attendance for insert to authenticated
  with check ( public.is_staff() );

drop policy if exists tst_ins on public.tests;
create policy tst_ins on public.tests for insert to authenticated
  with check ( public.is_staff() );

-- ── טבלאות בתבנית _all: מפצלים כדי לפתוח insert בלבד, לשמור צפייה class-scoped ──
-- conversations
drop policy if exists cnv_all on public.conversations;
create policy cnv_all on public.conversations for all to authenticated
  using ( public.can_see_student(student_id) or created_by = auth.uid() )
  with check ( public.is_staff() );
drop policy if exists cnv_read on public.conversations;
create policy cnv_read on public.conversations for select to authenticated
  using ( public.can_read_student(student_id) or created_by = auth.uid() );

-- functioning
drop policy if exists fnc_all on public.functioning;
create policy fnc_all on public.functioning for all to authenticated
  using ( public.can_see_student(student_id) or created_by = auth.uid() )
  with check ( public.is_staff() );
drop policy if exists fnc_read on public.functioning;
create policy fnc_read on public.functioning for select to authenticated
  using ( public.can_read_student(student_id) or created_by = auth.uid() );

-- meetings
drop policy if exists mtg_all on public.meetings;
create policy mtg_all on public.meetings for all to authenticated
  using ( public.can_see_student(student_id) or created_by = auth.uid() )
  with check ( public.is_staff() );
drop policy if exists mtg_read on public.meetings;
create policy mtg_read on public.meetings for select to authenticated
  using ( public.can_read_student(student_id) or created_by = auth.uid() );

-- reading
drop policy if exists rdg_all on public.reading;
create policy rdg_all on public.reading for all to authenticated
  using ( public.can_see_student(student_id) or created_by = auth.uid() )
  with check ( public.is_staff() );
drop policy if exists rdg_read on public.reading;
create policy rdg_read on public.reading for select to authenticated
  using ( public.can_read_student(student_id) or created_by = auth.uid() );

-- writing
drop policy if exists wrt_all on public.writing;
create policy wrt_all on public.writing for all to authenticated
  using ( public.can_see_student(student_id) or created_by = auth.uid() )
  with check ( public.is_staff() );
drop policy if exists wrt_read on public.writing;
create policy wrt_read on public.writing for select to authenticated
  using ( public.can_read_student(student_id) or created_by = auth.uid() );

-- הערה: medications נשאר admin-בלבד (רגיש). tasks כבר פתוח ל-insert. tuition/כספים לא נגענו.
