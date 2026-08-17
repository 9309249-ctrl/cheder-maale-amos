-- migration_teacher_student_access.sql
-- תיקון RLS: לאפשר למורה עם "גישה מוגבלת לתלמידים" (stu_names / card_own)
-- לראות את רשימת שמות התלמידים ולדווח — גם ללא שיוך כיתה.
-- הבעיה: stu_read/beh_* היו מותנים ב-has_class_access בלבד, ולמורים אין כיתות משויכות
-- → קיבלו אפס תלמידים ("התלמידים לא מופיעים אצלו"). התיקון אדיטיבי בלבד.

-- perms של המשתמש הנוכחי (text[]; null → מערך ריק)
create or replace function public.my_perms() returns text[]
  language sql stable security definer set search_path = public as
$$ select coalesce(perms, '{}'::text[]) from public.profiles where id = auth.uid() and active $$;

-- האם למשתמש יש הרשאת גישה-מוגבלת לרשימת התלמידים
create or replace function public.can_list_students() returns boolean
  language sql stable security definer set search_path = public as
$$ select public.is_admin()
     or 'stu_names' = any(public.my_perms())
     or 'card_own'  = any(public.my_perms()) $$;

-- students: קריאה גם למי שיש לו גישה-מוגבלת (רשימת שמות מלאה)
drop policy if exists stu_read on public.students;
create policy stu_read on public.students for select
  using (public.has_class_access(class_id) or public.can_list_students());

-- behavior_events: מורה מוגבל יכול לדווח (insert) על כל תלמיד,
-- ולראות/לערוך/למחוק רק את הדיווחים שהוא עצמו רשם.
drop policy if exists beh_read on public.behavior_events;
create policy beh_read on public.behavior_events for select
  using (public.can_see_student(student_id) or created_by = auth.uid());
drop policy if exists beh_ins on public.behavior_events;
create policy beh_ins on public.behavior_events for insert
  with check (public.can_see_student(student_id) or public.can_list_students());
drop policy if exists beh_upd on public.behavior_events;
create policy beh_upd on public.behavior_events for update
  using (public.can_see_student(student_id) or created_by = auth.uid())
  with check (public.can_see_student(student_id) or created_by = auth.uid());
drop policy if exists beh_del on public.behavior_events;
create policy beh_del on public.behavior_events for delete
  using (public.can_see_student(student_id) or created_by = auth.uid());
