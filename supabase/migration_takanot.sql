-- ═══════════════════════════════════════════════════════════════
-- migration_takanot.sql · מודול "סבסוד הזנה" על Supabase + RLS
-- מחליף את ה-webhook עם הטוקן החשוף. הרץ ב-SQL Editor (בטוח להריץ שוב).
--
-- מודל האבטחה (Least Privilege):
--   • הורה אנונימי: יכול רק *להגיש* בקשה — דרך הפונקציה submit_takanot בלבד.
--     אין ל-anon שום גישת SELECT/UPDATE/DELETE לטבלה → לא יכול לקרוא כלום.
--   • צוות מחובר (מנהל/מזכירות): קורא ומנהל בקשות דרך RLS מאומת בצד-שרת.
--   • מסמכים: bucket פרטי ב-Storage; anon מעלה בלבד, צוות קורא בקישור חתום.
-- ═══════════════════════════════════════════════════════════════

-- ===== הטבלה =====
create table if not exists public.takanot_requests (
  id             bigint generated always as identity primary key,
  -- פרטי הורים
  family_name    text not null,
  husband_name   text,
  husband_id     text,
  wife_name      text,
  wife_id        text,
  phone          text not null,
  email          text,
  address        text,
  -- ילדים: [{name, class}]
  children       jsonb not null default '[]'::jsonb,
  household_size int,
  -- הכנסות
  gross_husband  numeric, net_husband numeric,
  gross_wife     numeric, net_wife    numeric,
  gross_total    numeric, net_total   numeric,
  extra_income   text,
  -- מסמכים: {payslip_husband:[paths], payslip_wife:[], bank:[], id_husband:[], id_wife:[], extra:[]}
  docs           jsonb not null default '{}'::jsonb,
  -- ניהול
  request_code   text unique,                      -- מזהה קריא לשיוך מסמכים/מיילים
  status         text not null default 'התקבל',    -- התקבל / מאושר / נדחה
  admin_note     text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_takanot_status  on public.takanot_requests(status);
create index if not exists idx_takanot_created on public.takanot_requests(created_at);
create index if not exists idx_takanot_code    on public.takanot_requests(request_code);

-- ===== RLS: deny-by-default; קריאה/עדכון רק לצוות מורשה =====
alter table public.takanot_requests enable row level security;

drop policy if exists takanot_staff_read on public.takanot_requests;
create policy takanot_staff_read on public.takanot_requests for select
  using (public.is_admin() or public.my_role() = 'מזכירות');

drop policy if exists takanot_staff_update on public.takanot_requests;
create policy takanot_staff_update on public.takanot_requests for update
  using (public.is_admin() or public.my_role() = 'מזכירות')
  with check (public.is_admin() or public.my_role() = 'מזכירות');

drop policy if exists takanot_admin_delete on public.takanot_requests;
create policy takanot_admin_delete on public.takanot_requests for delete
  using (public.is_admin());

-- אין policy ל-INSERT → אף אחד לא מכניס ישירות; ההגשה עוברת דרך הפונקציה מטה בלבד.

-- ===== הגשה אנונימית מבוקרת (SECURITY DEFINER — עוקף RLS להכנסה מאומתת בלבד) =====
-- מקבל את כל שדות הבקשה, כופה status='התקבל', מייצר request_code, ומחזיר אותו.
-- ולידציה בסיסית + הגבלת-קצב פשוטה (מונע הצפה) — לא ניתן לזייף status/PII של אחרים.
create or replace function public.submit_takanot(p jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public as
$$
declare
  code text;
  recent int;
  ph text := nullif(trim(coalesce(p->>'phone','')), '');
  fam text := nullif(trim(coalesce(p->>'family_name','')), '');
begin
  if fam is null or ph is null then
    return jsonb_build_object('ok', false, 'error', 'missing family_name/phone');
  end if;
  -- הגבלת-קצב: מקסימום 5 הגשות מאותו טלפון ב-24 שעות (בלימת ספאם/הצפה)
  select count(*) into recent from public.takanot_requests
   where phone = ph and created_at > now() - interval '24 hours';
  if recent >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  code := 'TK-' || to_char(now(),'YYMMDD') || '-' || substr(md5(random()::text||clock_timestamp()::text), 1, 6);
  insert into public.takanot_requests(
    family_name, husband_name, husband_id, wife_name, wife_id, phone, email, address,
    children, household_size,
    gross_husband, net_husband, gross_wife, net_wife, gross_total, net_total, extra_income,
    docs, request_code, status)
  values (
    fam, p->>'husband_name', p->>'husband_id', p->>'wife_name', p->>'wife_id', ph, p->>'email', p->>'address',
    coalesce(p->'children','[]'::jsonb),
    nullif(p->>'household_size','')::int,
    nullif(p->>'gross_husband','')::numeric, nullif(p->>'net_husband','')::numeric,
    nullif(p->>'gross_wife','')::numeric,    nullif(p->>'net_wife','')::numeric,
    nullif(p->>'gross_total','')::numeric,   nullif(p->>'net_total','')::numeric,
    p->>'extra_income',
    coalesce(p->'docs','{}'::jsonb), code, 'התקבל');
  return jsonb_build_object('ok', true, 'request_code', code);
end $$;

revoke all on function public.submit_takanot(jsonb) from public;
grant execute on function public.submit_takanot(jsonb) to anon, authenticated;

-- ===== Storage: bucket פרטי למסמכים =====
insert into storage.buckets (id, name, public)
  values ('takanot-docs', 'takanot-docs', false)
  on conflict (id) do nothing;

-- anon: העלאה בלבד (INSERT) לתיקיית הבקשות; ללא קריאה/מחיקה.
drop policy if exists takanot_docs_anon_upload on storage.objects;
create policy takanot_docs_anon_upload on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'takanot-docs');

-- צוות מורשה: קריאה (להורדה/קישור חתום) + מחיקה.
drop policy if exists takanot_docs_staff_read on storage.objects;
create policy takanot_docs_staff_read on storage.objects for select
  to authenticated
  using (bucket_id = 'takanot-docs' and (public.is_admin() or public.my_role() = 'מזכירות'));

drop policy if exists takanot_docs_staff_delete on storage.objects;
create policy takanot_docs_staff_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'takanot-docs' and public.is_admin());
