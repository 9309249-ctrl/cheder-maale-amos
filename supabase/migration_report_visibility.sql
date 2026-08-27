-- migration_report_visibility.sql
-- מטרה (בקשת עמנואל, 2026-08-17): רב/מלמד רואה רק את הדיווחים שהוא עצמו רשם —
--   לא דיווחים של אנשי צוות אחרים ולא של ההנהלה. גם אם שויכו לו כיתות (כדי לראות תלמידים).
-- שיפור על migration_report_scoping: שם, מורה שאינו "מוגבל" (יש לו מסך תלמידים מלא) עדיין ראה
-- את כל הדיווחים על תלמידי כיתתו. עכשיו: רואים דיווחי-זולת רק אם יש הרשאת 'reports' (דשבורד/דוחות).

-- מי רשאי לראות דיווחים של אחרים (בכיתותיו): מנהל, או מי שהוקצתה לו הרשאת 'reports'
-- (מחנך/מפקח לפי ברירת-המחדל, או כל מי שהמנהל סימן לו את מסך הדוחות). מלמד ללא ההרשאה — רק שלו.
create or replace function public.can_see_all_reports() returns boolean
  language sql stable security definer set search_path = public as
$$ select public.is_admin() or ('reports' = any(public.my_perms())) $$;

-- קריאה: מנהל, או השורות שהמשתמש עצמו רשם, או (למי שיש הרשאת דוחות) דיווחים על תלמיד בכיתה משויכת.
drop policy if exists beh_read on public.behavior_events;
create policy beh_read on public.behavior_events for select
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_all_reports() and public.can_see_student(student_id)));

-- הוספה: אפשר לדווח רק על תלמיד בכיתה משויכת. אין כיתה → אין דיווח.
drop policy if exists beh_ins on public.behavior_events;
create policy beh_ins on public.behavior_events for insert
  with check (public.can_see_student(student_id));

-- עדכון/מחיקה: כל אחד עורך/מוחק רק את הדיווחים שהוא עצמו רשם. מנהל — הכל.
drop policy if exists beh_upd on public.behavior_events;
create policy beh_upd on public.behavior_events for update
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());
drop policy if exists beh_del on public.behavior_events;
create policy beh_del on public.behavior_events for delete
  using (public.is_admin() or created_by = auth.uid());
