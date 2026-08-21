-- migration_reading_tree_charlap.sql — 21/08/2026
-- מבנה מעקב הקריאה לפי מפרט הרבנית חרלפ (ראה READING_ASSESS_SPEC.md).
-- 1) reading_categories הופכת לעץ (parent_id) עם שיוך לשכבת גיל (band).
-- 2) classes מקבלת reading_band — איזה עץ מוצג לכיתה.
-- 3) זריעת העץ המלא לשתי השכבות.
-- החלטת מוצר (יוסף, 21/08): תקין/לא תקין **לצד** הציון 1–100, לא במקומו.
-- הציונים הישנים לא נמחקים; חמש העמודות השטוחות הישנות מושבתות (active=false) ולא נמחקות.

alter table reading_categories add column if not exists parent_id bigint references reading_categories(id) on delete cascade;
alter table reading_categories add column if not exists band text not null default 'all';
do $mig$ begin
  alter table reading_categories add constraint reading_categories_band_chk check (band in ('all','low','high'));
exception when duplicate_object then null; end $mig$;
create index if not exists reading_categories_parent_idx on reading_categories(parent_id);

alter table classes add column if not exists reading_band text;
do $mig$ begin
  alter table classes add constraint classes_reading_band_chk check (reading_band in ('low','high'));
exception when duplicate_object then null; end $mig$;

-- כיתות א-ב = השכבה הצעירה; כל השאר = הגבוהה. ניתן לשינוי ידני בהמשך.
update classes set reading_band = case when name like '%כיתה א%' or name like '%כיתה ב%' then 'low' else 'high' end
where reading_band is null;

-- העמודות השטוחות הישנות (שטף/דיוק/ניקוד/הבנה/מהירות) — מושבתות, לא נמחקות.
update reading_categories set active = false where parent_id is null and band = 'all';

-- ── זריעת העץ (idempotent: מדלגת אם כבר נזרע) ──
do $mig$
declare
  main_id bigint; sub_id bigint;
begin
  if exists (select 1 from reading_categories where band in ('low','high')) then
    raise notice 'tree already seeded — skipping';
    return;
  end if;

  -- ═══ שכבה צעירה (כיתות א-ב) ═══
  insert into reading_categories(name, sort_order, active, band) values ('הבנת עיקרון אלפביתי', 10, true, 'low') returning id into main_id;
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('שיום אותיות', 11, true, 'low', main_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('מודעות פונולוגית', 12, true, 'low', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('עיצור פותח', 13, true, 'low', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('עיצור סוגר', 14, true, 'low', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('צירוף פותח', 15, true, 'low', sub_id);

  insert into reading_categories(name, sort_order, active, band) values ('הבנת טקסט מושמע ומודעות לשונית', 20, true, 'low') returning id into main_id;
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('הבנת הנשמע', 21, true, 'low', main_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('מודעות לשונית', 22, true, 'low', main_id);

  insert into reading_categories(name, sort_order, active, band) values ('ידע אלפביתי', 30, true, 'low') returning id into main_id;
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאת צירופים', 31, true, 'low', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 32, true, 'low', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 33, true, 'low', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאת מילים מוכרות', 34, true, 'low', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 35, true, 'low', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 36, true, 'low', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאת מילים לא מוכרות', 37, true, 'low', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 38, true, 'low', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 39, true, 'low', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאה קולית של סיפור', 40, true, 'low', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 41, true, 'low', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 42, true, 'low', sub_id);

  -- "הכתבה" הופיעה במקור בשורה נפרדת בלי הדגשה — נזרעת ככותרת ראשית שהיא עצמה פריט מדיד.
  insert into reading_categories(name, sort_order, active, band) values ('הכתבה', 50, true, 'low');

  insert into reading_categories(name, sort_order, active, band) values ('הבנת הנקרא', 60, true, 'low') returning id into main_id;
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('רמת משפט וקטע קצר', 61, true, 'low', main_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('רמת סיפור', 62, true, 'low', main_id);

  -- ═══ שכבה גבוהה (כיתות ג ומעלה) ═══
  -- לרשימה הראשונה לא הייתה כותרת ראשית במקור — נבחר השם "שטף קריאה" (מסומן כפער ב-READING_ASSESS_SPEC.md).
  insert into reading_categories(name, sort_order, active, band) values ('שטף קריאה', 10, true, 'high') returning id into main_id;
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאת טקסט סיפורי (מנוקד)', 11, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 12, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 13, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאת טקסט סיפורי (לא מנוקד)', 14, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 15, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 16, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאת טקסט מידעי (מנוקד)', 17, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 18, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 19, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאת טקסט מידעי (לא מנוקד)', 20, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 21, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 22, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קריאת קודש', 23, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 24, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 25, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('מילים מוכרות', 26, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 27, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 28, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('מילות תפל', 29, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 30, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 31, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('צירופים', 32, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 33, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 34, true, 'high', sub_id);

  insert into reading_categories(name, sort_order, active, band) values ('הבנת הנקרא', 40, true, 'high') returning id into main_id;
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('חול', 41, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('איתור מידע', 42, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('אוצר מילים', 43, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('הסקת מסקנות', 44, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('שיחזור הטקסט', 45, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('קודש', 46, true, 'high', main_id);

  insert into reading_categories(name, sort_order, active, band) values ('כתיבה', 50, true, 'high') returning id into main_id;
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('הכתבת מילים', 51, true, 'high', main_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('הכתבת טקסט', 52, true, 'high', main_id) returning id into sub_id;
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('מהירות', 53, true, 'high', sub_id);
      insert into reading_categories(name, sort_order, active, band, parent_id) values ('דיוק', 54, true, 'high', sub_id);
    insert into reading_categories(name, sort_order, active, band, parent_id) values ('זיהוי הכתיב הנכון', 55, true, 'high', main_id);
end $mig$;
