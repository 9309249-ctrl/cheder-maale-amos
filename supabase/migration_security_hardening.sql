-- ═══════════════════════════════════════════════════════════════
-- migration_security_hardening.sql · ביקורת עומק 2026-08-03
-- הרץ ב-SQL Editor (בטוח להריץ שוב). דורש הרשאת בעלים.
-- כל בלוק מסומן בחומרה + הערת-סיכון אם עלול להשפיע על פיצ'ר.
-- ═══════════════════════════════════════════════════════════════

-- ── 🔴 C-2 · form_responses היה פתוח ל-anon (student_id is null בלי auth) ──
-- בטוח: זרימת חתימת הורים עוברת דרך פונקציות SECURITY DEFINER ולא דרך הטבלה.
drop policy if exists fr_staff on public.form_responses;
create policy fr_staff on public.form_responses for all
  using (auth.uid() is not null and (public.is_admin() or student_id is null or public.can_see_student(student_id)))
  with check (auth.uid() is not null and (public.is_admin() or student_id is null or public.can_see_student(student_id)));

-- ── 🔴 C-1 · email_by_name חשף ל-anon את המייל = {ת"ז}@bht.co.il (דלף ת"ז!) ──
-- ⚠️ שובר "התחברות לפי שם". הצוות ימשיך להיכנס לפי ת"ז/טלפון/מייל מלא (עובד בלי הפונקציה).
revoke execute on function public.email_by_name(text) from anon;

-- ── 🟠 H-2 · 'מפקח' (קריאה-בלבד) יכול היה למחוק כספים (for all + using כלל מפקח) ──
-- בטוח: מפצל קריאה (למפקח+מזכירה) מכתיבה (מזכירה+מנהל בלבד).
drop policy if exists tui_money on public.tuition;
create policy tui_read  on public.tuition  for select using (public.is_admin() or public.my_role() in ('מזכירה','מפקח'));
create policy tui_write on public.tuition  for all    using (public.is_admin() or public.my_role()='מזכירה') with check (public.is_admin() or public.my_role()='מזכירה');
drop policy if exists inc_money on public.income;
create policy inc_read  on public.income   for select using (public.is_admin() or public.my_role() in ('מזכירה','מפקח'));
create policy inc_write on public.income   for all    using (public.is_admin() or public.my_role()='מזכירה') with check (public.is_admin() or public.my_role()='מזכירה');
drop policy if exists exp_money on public.expenses;
create policy exp_read  on public.expenses for select using (public.is_admin() or public.my_role() in ('מזכירה','מפקח'));
create policy exp_write on public.expenses for all    using (public.is_admin() or public.my_role()='מזכירה') with check (public.is_admin() or public.my_role()='מזכירה');

-- ── 🟠 M-1 · איחוד תפקיד המזכירה: takanot השתמש ב'מזכירות'; הקנוני הוא 'מזכירה' ──
-- בטוח + מתקן תקלה: המזכירה תראה בקשות סבסוד.
drop policy if exists takanot_staff_read on public.takanot_requests;
create policy takanot_staff_read on public.takanot_requests for select using (public.is_admin() or public.my_role()='מזכירה');
drop policy if exists takanot_staff_update on public.takanot_requests;
create policy takanot_staff_update on public.takanot_requests for update using (public.is_admin() or public.my_role()='מזכירה') with check (public.is_admin() or public.my_role()='מזכירה');

-- ── 🟠 M-2 · forms: כל מאומת יכול היה למחוק את כל הטפסים (+חתימות ב-cascade) ──
-- בטוח: קריאה לכל צוות; יצירה/עריכה/מחיקה למנהל או ליוצר בלבד.
drop policy if exists forms_staff on public.forms;
create policy forms_read  on public.forms for select using (auth.uid() is not null);
create policy forms_write on public.forms for all using (public.is_admin() or created_by = auth.uid()) with check (public.is_admin() or created_by = auth.uid());

-- ── 🟠 M-4 · voice_reports: מורה יכל לזייף דיווח "מאושר" בשם המנהל ──
-- ⚠️ בדוק שיצירת דיווח קולי עדיין עובדת (הלקוח חייב לשלוח created_by=המשתמש, status='draft').
alter table public.voice_reports alter column created_by set default auth.uid();
drop policy if exists vr_own_insert on public.voice_reports;
create policy vr_own_insert on public.voice_reports for insert
  with check (auth.uid() is not null and created_by = auth.uid() and coalesce(status,'draft')='draft'
              and approved_by is null and (student_id is null or public.can_see_student(student_id)));

-- ── 🟠 M-5 · audit_log: אפשר היה לזייף רשומות בשם משתמש אחר ──
-- בטוח: כופה user_id = המשתמש המחובר.
alter table public.audit_log alter column user_id set default auth.uid();
drop policy if exists aud_ins on public.audit_log;
create policy aud_ins on public.audit_log for insert with check (auth.uid() is not null and user_id = auth.uid());

-- ── 🟠 M-7 · tasks: קריאה חוצת-כיתות (מורה ראה משימות של תלמידים בכיתות זרות) ──
-- בטוח יחסית: מגביל משימות המקושרות לתלמיד. אם משימות כלליות נעלמות למורים — הרחב את התנאי.
drop policy if exists task_read on public.tasks;
create policy task_read on public.tasks for select
  using (auth.uid() is not null and (student_id is null or public.can_see_student(student_id) or created_by = auth.uid()));

-- ── 🟡 storage · הגבלת גודל/סוג ל-bucket המסמכים ──
update storage.buckets set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf','image/png','image/jpeg']
 where id = 'takanot-docs';

-- ── 🟠 H1(takanot) · אימות צד-שרת ב-submit_takanot (anon יכל להזריק נתונים פגומים) ──
-- כולל בדיקת ספרת-ביקורת לת"ז, פורמט טלפון, מספרים אי-שליליים, תקרות.
create or replace function public.valid_il_id(p text) returns boolean
  language plpgsql immutable as $$
declare s int := 0; d int; i int;
begin
  if p is null or p !~ '^\d{9}$' then return false; end if;
  for i in 0..8 loop
    d := (substr(p,i+1,1))::int * ((i % 2) + 1);
    if d > 9 then d := d - 9; end if;
    s := s + d;
  end loop;
  return s % 10 = 0;
end $$;

create or replace function public.submit_takanot(p jsonb)
  returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  code text; recent int;
  ph  text := nullif(trim(coalesce(p->>'phone','')), '');
  fam text := nullif(trim(coalesce(p->>'family_name','')), '');
  hid text := nullif(trim(coalesce(p->>'husband_id','')), '');
  wid text := nullif(trim(coalesce(p->>'wife_id','')), '');
  hh  int  := nullif(p->>'household_size','')::int;
  nh  numeric := nullif(p->>'net_husband','')::numeric;
  nw  numeric := nullif(p->>'net_wife','')::numeric;
begin
  if fam is null or length(fam) > 80 then return jsonb_build_object('ok',false,'error','שם משפחה'); end if;
  if ph is null or ph !~ '^0\d{8,9}$' then return jsonb_build_object('ok',false,'error','טלפון'); end if;
  if not public.valid_il_id(hid) or not public.valid_il_id(wid) then return jsonb_build_object('ok',false,'error','תעודת זהות'); end if;
  if nh is null or nh < 0 or nh > 1000000 or nw is null or nw < 0 or nw > 1000000 then return jsonb_build_object('ok',false,'error','הכנסה'); end if;
  if hh is null or hh < 1 or hh > 40 then return jsonb_build_object('ok',false,'error','מספר נפשות'); end if;
  if jsonb_typeof(coalesce(p->'children','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'children','[]'::jsonb)) > 30 then return jsonb_build_object('ok',false,'error','ילדים'); end if;
  if length(coalesce(p->>'address','')) > 200 or length(coalesce(p->>'extra_income','')) > 500 then return jsonb_build_object('ok',false,'error','טקסט ארוך מדי'); end if;
  select count(*) into recent from public.takanot_requests where phone = ph and created_at > now() - interval '24 hours';
  if recent >= 5 then return jsonb_build_object('ok',false,'error','rate_limited'); end if;
  code := 'TK-' || to_char(now(),'YYMMDD') || '-' || substr(md5(random()::text||clock_timestamp()::text), 1, 6);
  insert into public.takanot_requests(
    family_name, husband_name, husband_id, wife_name, wife_id, phone, email, address,
    children, household_size, net_husband, net_wife, net_total, extra_income, docs, request_code, status)
  values (
    fam, left(coalesce(p->>'husband_name',''),80), hid, left(coalesce(p->>'wife_name',''),80), wid, ph,
    nullif(p->>'email',''), left(coalesce(p->>'address',''),200),
    coalesce(p->'children','[]'::jsonb), hh, nh, nw, (nh+nw), left(coalesce(p->>'extra_income',''),500),
    coalesce(p->'docs','{}'::jsonb), code, 'התקבל');   -- net_total מחושב בשרת, לא נאמן מהלקוח
  return jsonb_build_object('ok', true, 'request_code', code);
end $$;
revoke all on function public.submit_takanot(jsonb) from public;
grant execute on function public.submit_takanot(jsonb) to anon, authenticated;

-- ── 🟠 H-1 · get_form מאפשר ל-anon למנות את כל הטפסים ──
-- ⚠️ בדוק שהקישור הכללי לחתימה עדיין מציג את הטופס. אם נשבר — הסר את השורה הבאה.
revoke execute on function public.get_form(bigint) from anon;
