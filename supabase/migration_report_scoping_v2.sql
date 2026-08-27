-- migration_report_scoping_v2.sql
-- מטרה (בקשת עמנואל, 2026-08-17): רב/מלמד יראה רק את הדיווחים שהוא עצמו רשם.
-- הבעיה בגרסה הקודמת: "רואה רק את שלו" הותנה ב-is_limited_staff() (אסימוני stu_names/card_own).
-- מלמד רגיל (כמו הרב גורפלד) אין לו אסימונים כאלה, ולכן ראה את כל דיווחי הכיתה של כל הצוות.
-- כאן: המלמד (לפי תפקיד) וגם צוות-מוגבל רואים רק את דיווחיהם. מנהל/מפקח/מחנך — לפי תפקידם.

-- עוזרי-תפקיד (אידמפוטנטי; חלקם כבר קיימים חי — נוודא הגדרה אחידה)
create or replace function public.is_supervisor() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'מפקח', false) $$;

create or replace function public.is_melamed() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'מלמד', false) $$;

-- קריאת-תלמיד: מנהל/מפקח רואים הכל; שאר הצוות לפי שיוך-כיתה בלבד.
create or replace function public.can_read_student(sid bigint) returns boolean
  language sql stable security definer set search_path = public as
$$ select public.is_admin() or public.is_supervisor()
     or exists (select 1 from public.students s where s.id = sid and public.has_class_access(s.class_id)) $$;

-- "צוות מוגבל" = לא-מנהל עם אסימון גישה-מוגבלת (stu_names/card_own) אך בלי מסך התלמידים המלא.
create or replace function public.is_limited_staff() returns boolean
  language sql stable security definer set search_path = public as
$$ select not public.is_admin()
     and (('stu_names' = any(public.my_perms())) or ('card_own' = any(public.my_perms())))
     and not ('students' = any(public.my_perms())) $$;

-- מי שרואה רק את הדיווחים שרשם בעצמו: מלמד (רב) או צוות-מוגבל.
-- מנהל/מפקח/מחנך אינם כאלה — הם רואים את דיווחי הכיתה/המוסד לפי תפקידם.
create or replace function public.sees_only_own_reports() returns boolean
  language sql stable security definer set search_path = public as
$$ select not public.is_admin()
     and not public.is_supervisor()
     and (public.is_melamed() or public.is_limited_staff()) $$;

-- ===== behavior_events =====
-- קריאה: הדיווחים שלי, או (למי שאינו מוגבל-לשלו) כל תלמיד שאני מורשה לקרוא.
drop policy if exists beh_read on public.behavior_events;
create policy beh_read on public.behavior_events for select
  using (created_by = auth.uid()
         or (public.can_read_student(student_id) and not public.sees_only_own_reports()));
-- הוספה: רק על תלמיד בכיתה משויכת (ללא שינוי).
drop policy if exists beh_ins on public.behavior_events;
create policy beh_ins on public.behavior_events for insert
  with check (public.can_see_student(student_id));
-- עדכון/מחיקה: מנהל, או הדיווחים שלי, או (למחנך) תלמיד בכיתתו. מלמד — רק את שלו.
drop policy if exists beh_upd on public.behavior_events;
create policy beh_upd on public.behavior_events for update
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()))
  with check (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()));
drop policy if exists beh_del on public.behavior_events;
create policy beh_del on public.behavior_events for delete
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()));

-- ===== attendance =====
drop policy if exists att_read on public.attendance;
create policy att_read on public.attendance for select
  using (created_by = auth.uid()
         or (public.can_read_student(student_id) and not public.sees_only_own_reports()));
drop policy if exists att_ins on public.attendance;
create policy att_ins on public.attendance for insert
  with check (public.can_see_student(student_id));
drop policy if exists att_upd on public.attendance;
create policy att_upd on public.attendance for update
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()))
  with check (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()));
drop policy if exists att_del on public.attendance;
create policy att_del on public.attendance for delete
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()));

-- ===== tests =====
drop policy if exists tst_read on public.tests;
create policy tst_read on public.tests for select
  using (created_by = auth.uid()
         or (public.can_read_student(student_id) and not public.sees_only_own_reports()));
drop policy if exists tst_ins on public.tests;
create policy tst_ins on public.tests for insert
  with check (public.can_see_student(student_id));
drop policy if exists tst_upd on public.tests;
create policy tst_upd on public.tests for update
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()))
  with check (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()));
drop policy if exists tst_del on public.tests;
create policy tst_del on public.tests for delete
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.sees_only_own_reports()));
