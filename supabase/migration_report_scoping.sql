-- migration_report_scoping.sql
-- מטרה (בקשת עמנואל, 2026-08-17): לצמצם את מה שרב/מורה עם "גישה מוגבלת" רואה —
--   1) תלמידים: רואה רק את התלמידים של הכיתות המשויכות לו. אין כיתה משויכת → לא רואה אף תלמיד.
--   2) דיווחים: רואה רק את הדיווחים שהוא עצמו רשם, לא של צוות/הנהלה אחרים.
-- מבטל את ההרשאה הגורפת הקודמת (can_list_students) שנתנה למורה מוגבל לראות את כל המוסד.

-- "צוות מוגבל" = לא-מנהל שיש לו אסימון גישה-מוגבלת (stu_names/card_own) אך אין לו את מסך התלמידים המלא.
create or replace function public.is_limited_staff() returns boolean
  language sql stable security definer set search_path = public as
$$ select not public.is_admin()
     and (('stu_names' = any(public.my_perms())) or ('card_own' = any(public.my_perms())))
     and not ('students' = any(public.my_perms())) $$;

-- students: גישה לפי כיתות משויכות בלבד (מנהל כלול בתוך has_class_access). אין עוד גישה גורפת לרשימה.
drop policy if exists stu_read on public.students;
create policy stu_read on public.students for select
  using (public.has_class_access(class_id));

-- behavior_events:
--   קריאה/עדכון/מחיקה: מנהל, או השורות שהמשתמש עצמו רשם, או (למי שאינו מוגבל) כל תלמיד בכיתתו.
--   הוספה: אפשר לדווח רק על תלמיד שנמצא בכיתה משויכת (can_see_student). אין כיתה → אין דיווח.
drop policy if exists beh_read on public.behavior_events;
create policy beh_read on public.behavior_events for select
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.is_limited_staff()));
drop policy if exists beh_ins on public.behavior_events;
create policy beh_ins on public.behavior_events for insert
  with check (public.can_see_student(student_id));
drop policy if exists beh_upd on public.behavior_events;
create policy beh_upd on public.behavior_events for update
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.is_limited_staff()))
  with check (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.is_limited_staff()));
drop policy if exists beh_del on public.behavior_events;
create policy beh_del on public.behavior_events for delete
  using (public.is_admin() or created_by = auth.uid()
         or (public.can_see_student(student_id) and not public.is_limited_staff()));

-- הפונקציה הגורפת אינה בשימוש יותר.
drop function if exists public.can_list_students();

-- ===== שינוי סיסמה בידי המנהל =====
-- מאפשר למנהל (בלבד) לאפס סיסמה של משתמש אחר. משתמש רגיל משנה את סיסמתו דרך auth.updateUser.
create or replace function public.admin_set_password(p_user uuid, p_password text)
  returns boolean language plpgsql security definer
  set search_path = public, auth, extensions as
$$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'password too short'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
  return found;
end $$;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
