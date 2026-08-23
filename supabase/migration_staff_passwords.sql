-- migration_staff_passwords.sql — 23/08/2026
-- ⚠️ החלטה מפורשת של יוסף (23/08/2026), אחרי שהוצגה לו המשמעות:
--    המנהל צריך לראות את סיסמאות הצוות. Supabase שומר רק hash חד-כיווני, ולכן
--    נדרש אחסון נפרד של הסיסמה כטקסט. **זו הורדת אבטחה מודעת, לא תקלה.**
--
-- צמצום הסיכון ככל האפשר:
--   1. טבלה נפרדת (לא עמודה ב-profiles) — כדי ששום policy קיים או עתידי על profiles
--      לא יחשוף אותה בטעות. ל-profiles יש `prof_self_read` שמאפשר לכל אחד לקרוא את
--      השורה של עצמו; אילו הסיסמה הייתה שם, המבנה היה תלוי בזה שאיש לא ירחיב את ה-policy.
--   2. RLS: **מנהל בלבד**, לכל הפעולות. אין self-read — משתמש לא קורא אפילו את שלו.
--   3. `force row level security` — חל גם על בעל הטבלה.
--   4. אין GRANT ל-anon.
--
-- מגבלה מובנית: סיסמאות שנקבעו **לפני** המיגרציה אינן ניתנות לשחזור.
-- מה שכן אפשר: לזהות מי עדיין על סיסמת ברירת המחדל (= מספר הטלפון) ע"י בדיקת ההצפנה
-- מול הטלפון — בדיקת התאמה, לא פענוח. רק אלה מולאו כאן.

create table if not exists public.staff_passwords (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  password   text not null,
  updated_at timestamptz not null default now()
);

alter table public.staff_passwords enable row level security;
alter table public.staff_passwords force row level security;

drop policy if exists sp_admin_all on public.staff_passwords;
create policy sp_admin_all on public.staff_passwords
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.staff_passwords from anon;
grant select, insert, update, delete on public.staff_passwords to authenticated;

-- ── מילוי ראשוני: רק מי שהסיסמה שלו עדיין ברירת המחדל (מספר הטלפון) ──
insert into public.staff_passwords (user_id, password)
select u.id, split_part(u.email, '@', 1)
from auth.users u
join public.profiles p on p.id = u.id
where u.encrypted_password = extensions.crypt(split_part(u.email, '@', 1), u.encrypted_password)
on conflict (user_id) do nothing;

-- ── קביעת סיסמה בידי המנהל: מעדכנת גם את ה-hash וגם את העותק הקריא ──
create or replace function public.admin_set_password(p_user uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'password too short'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
  if not found then return false; end if;
  -- העותק הקריא למנהל (החלטת יוסף 23/08/2026)
  insert into public.staff_passwords (user_id, password, updated_at)
  values (p_user, p_password, now())
  on conflict (user_id) do update set password = excluded.password, updated_at = now();
  return true;
end $function$;

-- ── רישום סיסמה של משתמש חדש שנוצר דרך signUp (ה-hash כבר נקבע ע"י Auth) ──
create or replace function public.admin_record_password(p_user uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if coalesce(p_password, '') = '' then return false; end if;
  insert into public.staff_passwords (user_id, password, updated_at)
  values (p_user, p_password, now())
  on conflict (user_id) do update set password = excluded.password, updated_at = now();
  return true;
end $function$;

revoke all on function public.admin_set_password(uuid, text) from anon;
revoke all on function public.admin_record_password(uuid, text) from anon;
