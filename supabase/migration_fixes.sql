-- ═══════════════════════════════════════════════════════════════
-- מיגרציית תיקונים ושדרוגים (2026-07-21). הרץ ב-SQL Editor. בטוח להריץ שוב.
-- ═══════════════════════════════════════════════════════════════

-- 1) מבחנים: עמודת "שם הבוחן" (בקשת עמנואל)
alter table public.tests add column if not exists examiner text;

-- 2) טפסים גמישים: הגדרת שדות (JSON) + תשובות + חתימה ידנית (data-URL)
alter table public.forms          add column if not exists fields jsonb;      -- מערך שדות: [{key,label,type,options,required}]
alter table public.form_responses add column if not exists answers jsonb;     -- {key: value}
alter table public.form_responses add column if not exists signature text;    -- ציור חתימה (data:image/png;base64,...)

-- 3) פונקציות החתימה הציבוריות — לעדכן שיחזירו/יקבלו גם fields/answers/signature
create or replace function public.get_signing(p_token text)
  returns table(form_id bigint, title text, body text, fields jsonb, status text, signer_name text, signed_at date, answers jsonb, signature text)
  language sql stable security definer set search_path = public as
$$ select f.id, f.title, f.body, f.fields, r.status, r.signer_name, r.signed_at, r.answers, r.signature
     from public.form_responses r join public.forms f on f.id = r.form_id
    where r.token = p_token $$;

create or replace function public.get_form(p_form_id bigint)
  returns table(form_id bigint, title text, body text, fields jsonb)
  language sql stable security definer set search_path = public as
$$ select id, title, body, fields from public.forms where id = p_form_id $$;

create or replace function public.submit_signature(p_token text, p_name text, p_answers jsonb default null, p_signature text default null)
  returns boolean language plpgsql security definer set search_path = public as
$$ declare n int;
begin
  if length(coalesce(p_name,'')) < 2 then return false; end if;
  update public.form_responses
     set status='signed', signer_name=p_name, signed_at=current_date,
         answers=coalesce(p_answers, answers), signature=coalesce(p_signature, signature)
   where token = p_token and status <> 'signed';
  get diagnostics n = row_count; return n > 0;
end $$;

grant execute on function public.get_signing(text)                                         to anon, authenticated;
grant execute on function public.get_form(bigint)                                          to anon, authenticated;
grant execute on function public.submit_signature(text, text, jsonb, text)                 to anon, authenticated;

-- 4) אינדקסים שימושיים לתצוגות "לפי"
create index if not exists idx_students_status on public.students(status);
create index if not exists idx_tuition_student on public.tuition(student_id);
