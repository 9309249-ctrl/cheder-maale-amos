#!/usr/bin/env bash
# בדיקות RLS חיות (קריאה בלבד — אינן משנות נתונים) — מאמת שההרשאות אוכפות בשרת (Supabase),
# ולא רק בממשק. הרצה:  SUPABASE_PAT=sbp_xxx  bash tests/rls_check.sh
# ה-PAT נקרא ממשתנה סביבה כדי לא לדלוף ל-git.
set -u
PAT="${SUPABASE_PAT:-}"
[ -z "$PAT" ] && { echo "חסר SUPABASE_PAT בסביבה"; exit 2; }
URL="https://api.supabase.com/v1/projects/jpoxcwtigyvzjrlejzri/database/query"

GORFELD="5791ed3f-fd6e-4822-ac2a-cacbb4026718"   # מלמד, ללא שיוך כיתה
EMANUEL="05a21f28-3261-476c-97af-4c5c5b01e796"   # מנהל

# מריץ שאילתה ומחזיר את הערך הסקלרי הראשון (JSON) — עמיד יותר מ-grep.
scalar() { curl -s -X POST "$URL" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d "{\"query\":\"$1\"}" | python -c "import sys,json;d=json.load(sys.stdin);print(list(d[0].values())[0] if d else '')" 2>/dev/null; }
# מריץ SELECT בזהות משתמש מסוים (מדמה JWT). קריאה בלבד — ללא שינוי נתונים.
asuid() { scalar "select set_config('request.jwt.claims','{\\\"sub\\\":\\\"$1\\\",\\\"role\\\":\\\"authenticated\\\"}',true); set local role authenticated; $2"; }

PASS=0; FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; PASS=$((PASS+1)); else echo "  ✗ $1 — צפוי [$2], בפועל [$3]"; FAIL=$((FAIL+1)); fi; }
has() { case "$2" in *"$3"*) echo "  ✓ $1"; PASS=$((PASS+1));; *) echo "  ✗ $1"; FAIL=$((FAIL+1));; esac; }

TOTAL=$(scalar "select count(*) from students")
echo "סה\"כ תלמידים במוסד: $TOTAL"

echo "1) אכיפת RLS מופעלת על הטבלאות הרגישות:"
chk "RLS על students" True "$(scalar "select relrowsecurity from pg_class where relname='students'")"
chk "RLS על behavior_events" True "$(scalar "select relrowsecurity from pg_class where relname='behavior_events'")"

echo "2) מדיניות קריאת תלמידים מבוססת שיוך-כיתה (לא גישה גורפת):"
has "stu_read = has_class_access(class_id)" "$(scalar "select qual from pg_policies where tablename='students' and cmd='SELECT'")" "has_class_access"

echo "3) מלמד ללא שיוך כיתה — לא רואה אף תלמיד (מצב נוכחי):"
chk "גורפלד רואה 0 תלמידים" 0 "$(asuid "$GORFELD" 'select count(*) from students;')"

echo "4) מלמד רואה רק דיווחים שהוא עצמו רשם (לא של אחרים/הנהלה):"
chk "גורפלד רואה 0 דיווחי-זרים" 0 "$(asuid "$GORFELD" 'select count(*) from behavior_events where created_by is distinct from auth.uid();')"

echo "5) מנהל רואה את כל התלמידים:"
chk "עמנואל (מנהל) רואה הכל" "$TOTAL" "$(asuid "$EMANUEL" 'select count(*) from students;')"

echo "6) שינוי סיסמה בידי מנהל — פונקציה מאובטחת קיימת:"
DEF=$(scalar "select pg_get_functiondef(oid) from pg_proc where proname='admin_set_password'")
has "admin_set_password קיימת" "$DEF" "admin_set_password"
has "מוגנת ב-is_admin()" "$DEF" "is_admin"

echo "7) דיווח התנהגות — הזנה רק לתלמיד בכיתה של הרושם:"
has "beh_ins with_check = can_see_student" "$(scalar "select with_check from pg_policies where tablename='behavior_events' and cmd='INSERT'")" "can_see_student"

echo "----------------------------------------"
echo "עברו: $PASS · נכשלו: $FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
