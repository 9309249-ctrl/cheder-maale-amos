// admin.js — חלק 7: הגדרות והרשאות (מנהל), שכר לימוד, בקשות תיקון, יומן פעולות.
(function () {
  'use strict';
  const DEMO = !window.sb;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);

  // כל הנתונים (משתמשים/יומן/בקשות/שכר-לימוד) דרך המאגר המרכזי store.js — אין נתונים מקומיים.

  async function renderSettings(page) {
    const [classes, users, access, audit, feedbacks, cats] = await Promise.all([
      window.cv3Students ? window.cv3Students.getClasses() : [],
      (async () => { const u = await window.store.list('users'); return u.length ? u : window.store.list('profiles'); })(),
      window.store.list('user_class_access'),
      window.store.list('audit_log'), window.store.list('feedback'),
      window.store.list('categories'),
    ]);
    let readCats = await window.store.list('reading_categories');
    // ⚠️ סיסמאות הצוות בטקסט קריא — לבקשה מפורשת של יוסף (23/08/2026), אחרי שהוצגה לו המשמעות.
    // הטבלה `staff_passwords` פתוחה ל-**מנהל בלבד** ב-RLS, ומסך זה בלאו הכי adminOnly.
    // סיסמאות שנקבעו לפני התכונה אינן ניתנות לשחזור ויוצגו כ"לא ידועה".
    let pwMap = {};
    try { (await window.store.list('staff_passwords') || []).forEach(r => { pwMap[r.user_id] = r.password; }); } catch (_) {}
    let pwShown = false;
    const clsName = id => { const c = classes.find(x => x.id == id); return c ? c.name : ''; };
    const userClasses = uid => access.filter(a => a.user_id == uid).map(a => a.class_id);
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>הגדרות והרשאות</h2></div>' +
      '<div class="qr-card"><h3><i class="bi bi-mortarboard"></i> כיתות</h3><p class="login-hint" style="margin:0 0 8px">ניתן להוסיף, לשנות שם ולמחוק כיתות. מחיקת כיתה אינה מוחקת תלמידים — היא רק מנתקת אותם מהכיתה.</p><div id="clsList"></div>' +
        '<div class="qr-grid" style="grid-template-columns:1fr auto;margin-top:10px"><input class="inp mb0" id="newCls" placeholder="שם כיתה חדשה"><button class="btn-primary sm" id="addCls"><i class="bi bi-plus-lg"></i> הוסף</button></div></div>' +
      '<div class="qr-card"><h3><i class="bi bi-tags"></i> קטגוריות התנהגות</h3><p class="login-hint" style="margin:0 0 8px">הקטגוריות מופיעות בבחירה בעת דיווח התנהגות. ניתן להוסיף, לערוך ולמחוק.</p><div id="catList"></div>' +
        '<div class="qr-grid" style="grid-template-columns:1fr auto;margin-top:10px"><input class="inp mb0" id="newCat" placeholder="שם קטגוריה חדשה"><button class="btn-primary sm" id="addCat"><i class="bi bi-plus-lg"></i> הוסף</button></div></div>' +
      '<div class="qr-card"><div class="card-h-row"><h3><i class="bi bi-book-half"></i> פריטי מעקב קריאה</h3><button class="btn-primary sm" id="raCatsBtn"><i class="bi bi-sliders"></i> עריכת פריטים</button></div>' +
        '<p class="login-hint" style="margin:0 0 8px">מבנה מעקב הקריאה לפי מפרט הרבנית חרלפ: כותרת ראשית ← כותרת משנה ← פריט, בנפרד לכיתות א׳–ב׳ ולכיתות ג׳ ומעלה. על כל <b>פריט</b> מסמנים תקין/לא תקין + תאריך העברה, ואפשר להוסיף ציון 1–100.</p><div id="raCatsList"></div></div>' +
      '<div class="qr-card"><div class="card-h-row"><h3><i class="bi bi-people"></i> צוות והרשאות</h3><button class="btn-primary sm" id="usrAdd"><i class="bi bi-person-plus"></i> משתמש חדש</button></div>' +
        '<div id="usrOrphan"></div>' +
        '<div class="toolbar" style="grid-template-columns:auto 1fr;margin-bottom:8px">' +
          '<button class="btn-ghost sm always-on" id="pwToggle"><i class="bi bi-eye"></i> הצג סיסמאות</button>' +
          '<span class="tl-note" style="align-self:center;font-size:.8rem">הסיסמאות גלויות למנהל בלבד. סיסמה שנקבעה לפני שהתכונה נוספה אינה ניתנת לשחזור — קבע חדשה בעריכת המשתמש.</span>' +
        '</div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>שם</th><th>טלפון</th><th>סיסמה</th><th>תפקיד</th><th>כיתות</th><th></th></tr></thead><tbody id="usrBody"></tbody></table></div></div>' +
      '<div class="qr-card"><h3><i class="bi bi-clock-history"></i> יומן פעולות</h3><div id="audList"></div></div>' +
      '<div class="qr-card"><h3><i class="bi bi-bug"></i> בקשות תיקון</h3><div class="qr-grid" style="grid-template-columns:auto 2fr auto"><select class="inp mb0" id="fbKind"><option value="bug">באג</option><option value="idea">רעיון</option></select><input class="inp mb0" id="fbBody" placeholder="תיאור…"><button class="btn-primary sm" id="fbSave"><i class="bi bi-send"></i> שלח</button></div><div id="fbList" style="margin-top:10px"></div></div>' +
      '<div class="qr-card"><h3><i class="bi bi-info-circle"></i> אודות</h3><ul class="about-list"><li>מערכת מעקב — תלמוד תורה · גרסה 0.2</li><li>ארכיטקטורה: GitHub Pages + Supabase (RLS)</li><li>מוסד: <b id="aboutInst"></b></li></ul></div>';

    function drawCls() {
      page.querySelector('#clsList').innerHTML = classes.length ? classes.map(c =>
        '<div class="tl-item"><span class="sev-dot mid"></span><div class="tl-main">' + esc(c.name) + '</div>' +
        '<button class="mini" data-cledit="' + c.id + '" title="שינוי שם"><i class="bi bi-pencil"></i></button>' +
        '<button class="mini danger" data-cldel="' + c.id + '" title="מחיקה"><i class="bi bi-trash"></i></button></div>').join('')
        : '<div class="tl-note" style="padding:8px">אין כיתות עדיין</div>';
      page.querySelectorAll('[data-cledit]').forEach(b => b.addEventListener('click', () => clsForm(classes.find(c => c.id == b.dataset.cledit))));
      page.querySelectorAll('[data-cldel]').forEach(b => b.addEventListener('click', async () => {
        const c = classes.find(x => x.id == b.dataset.cldel); if (!c) return;
        if (!(await window.UI.confirm('למחוק את הכיתה "' + esc(c.name) + '"? התלמידים יישמרו אך ינותקו מהכיתה, ושיוכי הצוות לכיתה זו יימחקו.'))) return;
        const r = await window.cv3Students.removeClass(c.id);
        if (!r.ok) { window.UI.toast('שגיאה במחיקה: ' + (r.error || ''), 'err'); return; }
        const i = classes.indexOf(c); if (i >= 0) classes.splice(i, 1);
        for (let j = access.length - 1; j >= 0; j--) if (access[j].class_id == c.id) access.splice(j, 1);
        drawCls(); drawUsers(); window.UI.toast('הכיתה נמחקה');
      }));
    }
    function clsForm(existing) {
      const c = existing || {};
      window.UI.modal({
        title: existing ? 'שינוי שם כיתה' : 'כיתה חדשה', saveLabel: 'שמירה',
        bodyHTML: '<div class="form-grid"><label class="fld fld-wide"><span>שם הכיתה *</span><input class="inp mb0" id="cls_name" value="' + esc(c.name) + '"></label></div>',
        onSave: async (mel) => {
          const name = mel.querySelector('#cls_name').value.trim();
          if (!name) { window.UI.toast('שם חובה', 'err'); return false; }
          if (existing) {
            const r = await window.cv3Students.updateClass(c.id, name);
            if (!r.ok) { window.UI.toast('שגיאה: ' + (r.error || ''), 'err'); return false; }
            c.name = name;
          } else {
            const r = await window.cv3Students.addClass(name);
            if (!r.ok) { window.UI.toast('שגיאה: ' + (r.error || ''), 'err'); return false; }
            classes.push({ id: r.id || Date.now(), name });
          }
          drawCls(); drawUsers(); window.UI.toast('נשמר'); return true;
        },
      });
    }
    function drawCats() {
      page.querySelector('#catList').innerHTML = cats.length ? cats.map(c =>
        '<div class="tl-item"><span class="sev-dot mid"></span><div class="tl-main">' + esc(c.name) + '</div>' +
        '<button class="mini" data-cedit="' + c.id + '" title="עריכה"><i class="bi bi-pencil"></i></button>' +
        '<button class="mini danger" data-cdel="' + c.id + '" title="מחיקה"><i class="bi bi-trash"></i></button></div>').join('')
        : '<div class="tl-note" style="padding:8px">אין קטגוריות עדיין</div>';
      page.querySelectorAll('[data-cedit]').forEach(b => b.addEventListener('click', () => catForm(cats.find(c => c.id == b.dataset.cedit))));
      page.querySelectorAll('[data-cdel]').forEach(b => b.addEventListener('click', async () => {
        const c = cats.find(x => x.id == b.dataset.cdel); if (!c) return;
        if (!(await window.UI.confirm('למחוק את הקטגוריה "' + esc(c.name) + '"? דיווחים קיימים יישמרו.'))) return;
        await window.store.remove('categories', c.id); const i = cats.indexOf(c); if (i >= 0) cats.splice(i, 1);
        drawCats(); window.UI.toast('הקטגוריה נמחקה');
      }));
    }
    function catForm(existing) {
      const c = existing || {};
      window.UI.modal({
        title: existing ? 'עריכת קטגוריה' : 'קטגוריה חדשה', saveLabel: 'שמירה',
        bodyHTML: '<div class="form-grid"><label class="fld fld-wide"><span>שם הקטגוריה *</span><input class="inp mb0" id="cat_name" value="' + esc(c.name) + '"></label></div>',
        onSave: async (mel) => {
          const name = mel.querySelector('#cat_name').value.trim();
          if (!name) { window.UI.toast('שם חובה', 'err'); return false; }
          if (existing) { await window.store.update('categories', c.id, { name }); c.name = name; }
          else { const r = await window.store.add('categories', { name, kind: 'behavior' }); cats.push((r.data && r.data[0]) || { id: Date.now(), name, kind: 'behavior' }); }
          drawCats(); window.UI.toast('נשמר'); return true;
        },
      });
    }
    // מאז 21/08/2026 פריטי מעקב הקריאה הם עץ בן 3 רמות ומחולקים לשתי שכבות גיל —
    // תצוגה שטוחה של 64 שורות הייתה בלתי קריאה, ולכן מוצג כאן העץ עם הזחה, לפי שכבה.
    function drawReadCats() {
      const host = page.querySelector('#raCatsList'); if (!host) return;
      const bt = window.cv3ReadAssess && window.cv3ReadAssess.buildTree;
      if (!bt) { host.innerHTML = '<div class="tl-note" style="padding:8px">מודול מעקב הקריאה לא נטען</div>'; return; }
      const bands = [{ k: 'low', t: 'כיתות א׳–ב׳' }, { k: 'high', t: 'כיתות ג׳ ומעלה' }];
      const walk = (nodes) => nodes.map(n =>
        '<div class="tl-item" style="margin-right:' + (n.depth * 16) + 'px">' +
        '<span class="sev-dot ' + (n.depth === 0 ? 'high' : n.depth === 1 ? 'mid' : 'low') + '"></span>' +
        '<div class="tl-main"' + (n.depth === 0 ? ' style="font-weight:800"' : '') + '>' + esc(n.name) +
        (n.children.length ? '' : ' <span class="det-badge">פריט</span>') + '</div></div>' + walk(n.children)).join('');
      const html = bands.map(b => {
        const roots = bt(readCats || [], b.k);
        if (!roots.length) return '';
        return '<div class="tl-note" style="padding:8px 2px 2px;font-weight:800">' + b.t + '</div>' + walk(roots);
      }).join('');
      host.innerHTML = html || '<div class="tl-note" style="padding:8px">אין פריטי מעקב עדיין</div>';
    }

    // ⚠️ מסך "יתום" = מודול שקיים ב-MODULES אבל אף איש צוות פעיל (שאינו מנהל) לא רואה אותו.
    // כך בדיוק נעלם "מעקב קריאה" מכל המורים ב-17–21/08: המסך נוסף אחרי שההרשאות כבר נקבעו,
    // ומערך perms קיים לא מקבל מודולים חדשים אוטומטית. עכשיו זה צף למנהל במקום להתגלות בתלונה.
    function drawOrphanModules() {
      const host = page.querySelector('#usrOrphan'); if (!host) return;
      const assignable = (window.MODULES || []).filter(m => !m.adminOnly);
      const staff = users.filter(u => u.active !== false && u.role !== 'מנהל');
      const sees = (u, id) => !u.perms || !u.perms.length || u.perms.indexOf(id) !== -1;
      const orphans = staff.length ? assignable.filter(m => !staff.some(u => sees(u, m.id))) : [];
      host.innerHTML = orphans.length
        ? '<div class="tl-note" style="padding:8px 10px;margin-bottom:8px;border-radius:10px;background:#fef3c7;color:#7c4a03">' +
          '<i class="bi bi-exclamation-triangle-fill"></i> <b>שים לב:</b> אף איש צוות לא רואה את המסכים הבאים — ' +
          orphans.map(m => esc(m.label)).join(', ') +
          '. אם המסך נוסף למערכת אחרי שההרשאות נקבעו, צריך לסמן אותו ידנית בעריכת כל משתמש.</div>'
        : '';
    }

    function drawUsers() {
      drawOrphanModules();
      page.querySelector('#usrBody').innerHTML = users.map(u => {
        const modIds = (window.MODULES || []).map(m => m.id);
        const modCount = (u.perms || []).filter(p => modIds.includes(p)).length;
        const hasLimited = (u.perms || []).some(p => p === 'stu_names' || p === 'card_own');
        const cls = (u.role === 'מנהל' ? '<span class="tl-note">כל הכיתות</span>' : (userClasses(u.id).map(clsName).filter(Boolean).join(', ') || '—')) +
          (u.role !== 'מנהל' && modCount ? ' <span class="det-badge">' + modCount + ' מסכים</span>' : '') +
          (hasLimited ? ' <span class="det-badge">גישה מוגבלת</span>' : '');
        // משתמש מושבת נראה עד היום זהה לפעיל — והמנהל לא הבין למה הוא "לא רואה כלום".
        // עכשיו הוא מסומן במפורש, ואפשר להחזיר אותו לפעילות בלחיצה.
        const off = u.active === false;
        const pw = pwMap[u.id];
        const phone = String(u.phone || u.tz || '');
        const pwCell = pw
          ? (pwShown
              ? '<code style="font-size:.85rem">' + esc(pw) + '</code>' +
                (pw === phone ? ' <span class="det-badge" title="הסיסמה זהה למספר הטלפון — מומלץ לשנות">ברירת מחדל</span>' : '')
              : '<span style="letter-spacing:2px;color:var(--muted)">••••••</span>' +
                (pw === phone ? ' <span class="det-badge">ברירת מחדל</span>' : ''))
          : '<span class="tl-note" style="font-size:.78rem">לא ידועה</span>';
        return '<tr' + (off ? ' style="opacity:.62"' : '') + '><td>' + esc(u.name) + (off ? ' <span class="det-badge">מושבת</span>' : '') + '</td><td>' + esc(phone) + '</td><td>' + pwCell + '</td><td><span class="chip ' + (u.role === 'מנהל' ? 'ok' : 'off') + '">' + esc(u.role) + '</span></td><td>' + cls + '</td>' +
          '<td class="row-act"><button class="mini" data-ucard="' + u.id + '" title="כרטיס איש צוות"><i class="bi bi-person-vcard"></i></button><button class="mini" data-uedit="' + u.id + '" title="עריכה"><i class="bi bi-pencil"></i></button>' +
          (off ? '<button class="mini" data-uon="' + u.id + '" title="החזרה לפעילות"><i class="bi bi-person-check"></i></button>'
               : '<button class="mini danger" data-udel="' + u.id + '" title="השבתה"><i class="bi bi-trash"></i></button>') + '</td></tr>';
      }).join('');
      const pt = page.querySelector('#pwToggle');
      if (pt) pt.onclick = () => { pwShown = !pwShown; pt.innerHTML = pwShown ? '<i class="bi bi-eye-slash"></i> הסתר סיסמאות' : '<i class="bi bi-eye"></i> הצג סיסמאות'; drawUsers(); };
      page.querySelectorAll('[data-ucard]').forEach(b => b.addEventListener('click', () => { if (window.cv3StaffCard) window.cv3StaffCard.open(b.dataset.ucard); }));
      page.querySelectorAll('[data-uedit]').forEach(b => b.addEventListener('click', () => openUserForm(users.find(u => u.id == b.dataset.uedit))));
      page.querySelectorAll('[data-udel]').forEach(b => b.addEventListener('click', async () => {
        const u = users.find(x => x.id == b.dataset.udel); if (!u) return;
        if (u.role === 'מנהל' && users.filter(x => x.role === 'מנהל').length <= 1) { window.UI.toast('חייב להישאר מנהל אחד לפחות', 'err'); return; }
        const LIVE = !!window.sb;
        if (!(await window.UI.confirm(LIVE ? ('להשבית את המשתמש "' + esc(u.name) + '"? (לא ניתן למחוק לגמרי משתמש מאומת — הוא יושבת ולא יוכל להיכנס)') : ('למחוק את המשתמש "' + esc(u.name) + '"?')))) return;
        if (LIVE) {
          // לא מסירים מהרשימה — משאירים מסומן "מושבת" כדי שיהיה אפשר להחזיר אותו
          const r = await window.store.update('profiles', u.id, { active: false });
          if (!r || r.ok === false) { window.UI.toast('ההשבתה נכשלה' + (r && r.error ? ': ' + r.error : ''), 'err'); return; }
          u.active = false;
        }
        else { await window.store.remove('users', u.id); const i = users.indexOf(u); if (i >= 0) users.splice(i, 1); }
        drawUsers(); window.UI.toast(LIVE ? 'המשתמש הושבת — הוא לא יוכל להיכנס עד להחזרתו לפעילות' : 'נמחק');
      }));
      page.querySelectorAll('[data-uon]').forEach(b => b.addEventListener('click', async () => {
        const u = users.find(x => x.id == b.dataset.uon); if (!u) return;
        const r = await window.store.update('profiles', u.id, { active: true });
        if (!r || r.ok === false) { window.UI.toast('ההפעלה נכשלה' + (r && r.error ? ': ' + r.error : ''), 'err'); return; }
        u.active = true; drawUsers(); window.UI.toast('המשתמש הוחזר לפעילות');
      }));
    }
    function openUserForm(existing) {
      const u = existing || {};
      const uc = existing ? userClasses(u.id) : [];
      const clsBoxes = classes.map(c => '<label class="cb"><input type="checkbox" value="' + c.id + '"' + (uc.includes(c.id) ? ' checked' : '') + '> ' + esc(c.name) + '</label>').join('');
      const assignable = (window.MODULES || []).filter(m => !m.adminOnly);
      // ברירת מחדל של מסכים לפי התפקיד (null = כל המסכים, כמו מנהל/מפקח); ניתן להתאמה אישית
      const roleDefPerms = r => { try { const c = window.roleCaps && window.roleCaps(r); return c ? c.perms : null; } catch (_) { return null; } };
      const up = (existing && u.perms && u.perms.length) ? u.perms : (roleDefPerms(u.role || 'מחנך') || assignable.map(m => m.id));
      const permBoxes = assignable.map(m => '<label class="cb"><input type="checkbox" value="' + m.id + '"' + (up.includes(m.id) ? ' checked' : '') + '> ' + esc(m.label) + '</label>').join('');
      // הרשאות מיוחדות (אסימונים בתוך perms, לא מסכים) — גישה מוגבלת לתלמידים למורה שאין לו את מסך "תלמידים" המלא
      const SPECIAL = [['stu_names', 'רשימת שמות התלמידים — לצפייה ולבחירה בדיווח'], ['card_own', 'כרטיס תלמיד — פרטים בלבד + רק הדיווחים שהוא עצמו רשם']];
      const curPerms = (existing && u.perms) ? u.perms : [];
      const specBoxes = SPECIAL.map(s => '<label class="cb"><input type="checkbox" value="' + s[0] + '"' + (curPerms.includes(s[0]) ? ' checked' : '') + '> ' + esc(s[1]) + '</label>').join('');
      const mm = window.UI.modal({
        title: existing ? 'עריכת משתמש והרשאות' : 'משתמש חדש', saveLabel: 'שמירה',
        bodyHTML:
          '<div class="form-grid">' +
          '<label class="fld"><span>שם מלא * <small style="font-weight:400;color:var(--muted)">(שם הכניסה)</small></span><input class="inp mb0" id="u_name" value="' + esc(u.name) + '"></label>' +
          '<label class="fld"><span>טלפון * <small style="font-weight:400;color:var(--muted)">(סיסמה ראשונית)</small></span><input class="inp mb0" id="u_phone" value="' + esc(u.phone || u.tz || '') + '"></label>' +
          '<label class="fld"><span>סיסמה ' + (existing ? '(ריק = טלפון/ללא שינוי)' : '(ריק = הטלפון)') + '</span>' +
            '<div style="display:flex;gap:6px"><input class="inp mb0" id="u_pw" type="password" placeholder="סיסמה" style="flex:1" value="' + esc(existing ? (u.password || pwMap[u.id] || '') : '') + '">' +
            '<button type="button" class="btn-ghost sm" id="u_pw_show" title="הצג/הסתר"><i class="bi bi-eye"></i></button></div></label>' +
          '<label class="fld"><span>תפקיד</span><select class="inp mb0" id="u_role">' +
            ['מנהל', 'מחנך', 'מלמד', 'מפקח', 'מזכירה'].map(r => '<option' + ((u.role === r || (!u.role && r === 'מחנך')) ? ' selected' : '') + '>' + r + '</option>').join('') +
            '</select></label>' +
          '<label class="fld"><span>רמת גישה <small style="font-weight:400;color:var(--muted)">— מה מותר לו לעשות</small></span><select class="inp mb0" id="u_mode">' +
            [['', 'ברירת מחדל (לפי תפקיד)'], ['full', 'גישה מלאה — צפייה + עריכה'], ['readonly', 'צפייה בלבד — בלי לערוך'], ['writeonly', 'הזנה בלבד — בלי לצפות']].map(o => '<option value="' + o[0] + '"' + (((u.access_mode || '') === o[0]) ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
            '</select></label>' +
          '<div class="fld fld-wide"><span>כיתות מורשות <small style="font-weight:400;color:var(--muted)">— בלי שיוך כיתה, לא רואה אף תלמיד</small></span><div class="cb-grid" id="classGrid">' + (clsBoxes || '<span class="tl-note">אין כיתות — הוסף כיתה קודם</span>') + '</div>' +
            (clsBoxes ? '<div style="margin-top:7px;display:flex;gap:6px"><button type="button" class="btn-ghost sm" id="clsAll">כל הכיתות</button><button type="button" class="btn-ghost sm" id="clsNone">נקה הכל</button></div>' : '') + '</div>' +
          '<div class="fld fld-wide"><span>מסכים מורשים <small style="font-weight:400;color:var(--muted)">— מנהל רואה הכל</small></span>' +
            '<div class="cb-grid" id="permGrid">' + permBoxes + '</div>' +
            '<div style="margin-top:7px;display:flex;gap:6px"><button type="button" class="btn-ghost sm" id="permAll">סמן הכל</button><button type="button" class="btn-ghost sm" id="permNone">נקה הכל</button></div></div>' +
          '<div class="fld fld-wide"><span>גישה מוגבלת לתלמידים <small style="font-weight:400;color:var(--muted)">— למורה בלי מסך "תלמידים" מלא</small></span>' +
            '<div class="cb-grid" id="specGrid">' + specBoxes + '</div></div>' +
          '</div>',
        onSave: async (mel) => {
          const name = mel.querySelector('#u_name').value.trim(), phone = mel.querySelector('#u_phone').value.trim(), pw = mel.querySelector('#u_pw').value, role = mel.querySelector('#u_role').value;
          const access_mode = mel.querySelector('#u_mode').value || null;   // null = ברירת מחדל לפי תפקיד
          if (!name || !phone) { window.UI.toast('שם וטלפון חובה', 'err'); return false; }
          const chosenPerms = [...mel.querySelectorAll('#permGrid input:checked')].map(c => c.value);
          const specialTokens = [...mel.querySelectorAll('#specGrid input:checked')].map(c => c.value);
          const allIds = assignable.map(m => m.id);
          // perms=null → ברירת-מחדל לפי התפקיד (roleCaps); רק אם המנהל צמצם ידנית נשמור רשימה
          // שמירה מפורשת: מה שסומן = מה שהמשתמש רואה (מנהל=null=הכל). כך שליטה מדויקת מסך-מסך.
          // אסימוני גישה-מוגבלת (stu_names/card_own) נשמרים לצד מזהי המסכים באותו מערך perms.
          const perms = (role === 'מנהל') ? null : chosenPerms.concat(specialTokens);
          const LIVE = !!window.sb;
          let uid;
          if (!LIVE) {
            // ── מצב הדגמה: טבלת users בזיכרון ──
            const row = { name, phone, role, perms, access_mode, password: pw || phone };
            if (existing) { await window.store.update('users', u.id, row); Object.assign(u, row); uid = u.id; }
            else { const r = await window.store.add('users', row); const nu = (r.data && r.data[0]) || Object.assign({ id: Date.now() }, row); uid = nu.id; users.push(nu); }
          } else if (existing) {
            // ── חי: עדכון פרופיל קיים (שם/תפקיד/הרשאות) ──
            await window.store.update('profiles', u.id, { name, role, tz: phone, perms, access_mode });
            // איפוס סיסמה בידי המנהל — רק אם הוזנה סיסמה. דורש 6+ תווים (מגבלת Supabase).
            if (pw) {
              if (pw.length < 6) { window.UI.toast('הסיסמה קצרה — נדרשים 6 תווים לפחות. שאר הפרטים נשמרו', 'err'); }
              else {
                const { data, error } = await window.sb.rpc('admin_set_password', { p_user: u.id, p_password: pw });
                if (error || data === false) { window.UI.toast('הפרטים נשמרו אך שינוי הסיסמה נכשל' + (error ? ': ' + error.message : ''), 'err'); }
                else { pwMap[u.id] = pw; window.UI.toast('הסיסמה עודכנה'); }
              }
            }
            Object.assign(u, { name, role, tz: phone, perms, access_mode }); uid = u.id;
          } else {
            // ── חי: יצירת משתמש אמיתי דרך Supabase Auth (client זמני שלא נוגע בסשן המנהל) ──
            const C = window.CV3 || {};
            const tmp = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
            const email = phone + '@bht.co.il';
            const password = (pw && pw.length >= 6) ? pw : phone;   // Supabase דורש 6+ תווים; ברירת מחדל = הטלפון
            if (password.length < 6) { window.UI.toast('הטלפון חייב לפחות 6 ספרות (או הזן סיסמה 6+ תווים)', 'err'); return false; }
            // משתמש שהושבת בעבר עדיין קיים ב-Auth → signUp ייכשל. במקום "לא נוצר", מחזירים אותו לפעילות.
            const prev = users.find(x => String(x.email || '').toLowerCase() === email.toLowerCase());
            const { data, error } = await tmp.auth.signUp({ email, password, options: { data: { name } } });
            uid = data && data.user && data.user.id;
            // העותק הקריא למנהל (החלטת יוסף 23/08/2026) — נרשם אחרי היצירה, ה-hash כבר נקבע ע"י Auth
            if (uid) { try { await window.sb.rpc('admin_record_password', { p_user: uid, p_password: password }); pwMap[uid] = password; } catch (_) {} }
            if ((error || !uid) && prev) {
              const upd0 = await window.store.update('profiles', prev.id, { name, role, tz: phone, perms, access_mode, active: true });
              if (!upd0 || upd0.ok === false) { window.UI.toast('שחזור המשתמש הקיים נכשל: ' + ((upd0 && upd0.error) || ''), 'err'); return false; }
              uid = prev.id;
              Object.assign(prev, { name, role, tz: phone, phone, perms, access_mode, active: true });
              window.UI.toast('המספר כבר היה קיים — המשתמש הוחזר לפעילות (הסיסמה הקודמת נשמרה)');
            } else if (error) { window.UI.toast('שגיאה ביצירת משתמש: ' + error.message, 'err'); return false; }
            else if (!uid) { window.UI.toast('המשתמש לא נוצר (אולי המספר כבר קיים)', 'err'); return false; }
            else {
              await new Promise(r => setTimeout(r, 500));   // המתנה לטריגר שיוצר את הפרופיל
              const upd = await window.store.update('profiles', uid, { name, role, tz: phone, perms, access_mode, active: true });
              if (upd && upd.ok === false) { window.UI.toast('המשתמש נוצר אך עדכון הפרופיל נכשל: ' + (upd.error || ''), 'err'); }
              users.push({ id: uid, email, name, phone, tz: phone, role, perms, access_mode, active: true });
            }
          }
          const chosen = [...mel.querySelectorAll('#classGrid input:checked')].map(c => Number(c.value));
          // user_class_access = מפתח מורכב (user_id, class_id) ללא עמודת id → מוחקים לפי user_id ולא לפי id
          await window.store.removeBy('user_class_access', { user_id: uid });
          for (let i = access.length - 1; i >= 0; i--) if (access[i].user_id == uid) access.splice(i, 1);
          for (const cid of chosen) { const r = await window.store.add('user_class_access', { user_id: uid, class_id: cid }); access.push((r.data && r.data[0]) || { user_id: uid, class_id: cid }); }
          drawUsers();
          window.UI.toast(existing ? 'המשתמש עודכן' : ('משתמש נוסף — כניסה: ' + phone + ' · סיסמה: ' + ((pw && pw.length >= 6) ? pw : phone)));
          return true;
        },
      });
      // כפתורי הכל/נקה + השבתת הרשאות למנהל (רואה הכל)
      const pg = mm.el.querySelector('#permGrid'), roleSel = mm.el.querySelector('#u_role');
      mm.el.querySelector('#permAll').addEventListener('click', () => pg.querySelectorAll('input').forEach(c => c.checked = true));
      mm.el.querySelector('#permNone').addEventListener('click', () => pg.querySelectorAll('input').forEach(c => c.checked = false));
      const cg = mm.el.querySelector('#classGrid');
      const clsAll = mm.el.querySelector('#clsAll'), clsNone = mm.el.querySelector('#clsNone');
      if (clsAll) clsAll.addEventListener('click', () => cg.querySelectorAll('input').forEach(c => c.checked = true));
      if (clsNone) clsNone.addEventListener('click', () => cg.querySelectorAll('input').forEach(c => c.checked = false));
      const toggleAdmin = () => { const dis = roleSel.value === 'מנהל'; mm.el.querySelectorAll('#permGrid input, #classGrid input, #specGrid input, #permAll, #permNone, #clsAll, #clsNone').forEach(el => { el.disabled = dis; }); };
      // בשינוי תפקיד — עדכן את הסימונים לברירת-המחדל של התפקיד החדש (המנהל יכול אחר-כך להתאים ידנית)
      roleSel.addEventListener('change', () => {
        toggleAdmin();
        if (roleSel.value !== 'מנהל') {
          const rd = roleDefPerms(roleSel.value) || assignable.map(m => m.id);
          pg.querySelectorAll('input').forEach(c => { c.checked = rd.includes(c.value); });
        }
      });
      toggleAdmin();
      // הצג/הסתר סיסמה (המנהל רשאי לראות ולערוך את סיסמת המשתמש)
      const pwInp = mm.el.querySelector('#u_pw'), pwBtn = mm.el.querySelector('#u_pw_show');
      if (pwBtn) pwBtn.addEventListener('click', () => { const t = pwInp.type === 'password'; pwInp.type = t ? 'text' : 'password'; pwBtn.innerHTML = '<i class="bi bi-eye' + (t ? '-slash' : '') + '"></i>'; });
    }
    page.querySelector('#audList').innerHTML = (audit.length ? audit.slice().reverse() : []).map(a => '<div class="tl-item"><span class="sev-dot lo"></span><div class="tl-main">' + esc(a.detail) + '</div><div class="tl-meta">' + esc(a.created_at) + '</div></div>').join('') || '<div class="tl-note" style="padding:8px">אין פעולות</div>';
    const drawFb = () => { page.querySelector('#fbList').innerHTML = feedbacks.slice().reverse().map(f => '<div class="tl-item"><span class="sev-dot ' + (f.kind === 'bug' ? 'hi' : 'lo') + '"></span><div class="tl-main">' + (f.kind === 'bug' ? 'באג' : 'רעיון') + ' — ' + esc(f.body) + '</div></div>').join(''); };
    const ai = document.getElementById('aboutInst'); if (ai) ai.textContent = (window.CV3 || {}).INSTANCE_NAME || '';

    page.querySelector('#usrAdd').addEventListener('click', () => openUserForm(null));
    page.querySelector('#addCls').addEventListener('click', async () => {
      const n = page.querySelector('#newCls').value.trim(); if (!n) return;
      const r = await window.cv3Students.addClass(n); if (r.ok) { classes.push({ id: r.id || Date.now(), name: n }); page.querySelector('#newCls').value = ''; drawCls(); window.UI.toast('כיתה נוספה'); }
    });
    page.querySelector('#addCat').addEventListener('click', async () => {
      const n = page.querySelector('#newCat').value.trim(); if (!n) return;
      const r = await window.store.add('categories', { name: n, kind: 'behavior' });
      cats.push((r.data && r.data[0]) || { id: Date.now(), name: n, kind: 'behavior' });
      page.querySelector('#newCat').value = ''; drawCats(); window.UI.toast('קטגוריה נוספה');
    });
    page.querySelector('#fbSave').addEventListener('click', async () => {
      const body = page.querySelector('#fbBody').value.trim(); if (!body) return;
      const kind = page.querySelector('#fbKind').value;
      const r = await window.store.add('feedback', { kind, body });
      feedbacks.push((r.data && r.data[0]) || { kind, body }); page.querySelector('#fbBody').value = ''; drawFb(); window.UI.toast('נשלח, תודה');
    });
    const raBtn = page.querySelector('#raCatsBtn');
    if (raBtn) raBtn.addEventListener('click', () => {
      if (!window.cv3ReadAssess) { window.UI.toast('מודול מעקב הקריאה לא נטען', 'err'); return; }
      window.cv3ReadAssess.editCategories(async () => { readCats = await window.store.list('reading_categories'); drawReadCats(); });
    });

    drawCls(); drawCats(); drawReadCats(); drawUsers(); drawFb();
  }

  const PAY_METHODS = ['מזומן', 'העברה', 'בית ספר', 'נדרים פלוס'];
  async function renderTuition(page) {
    const [studs, tuition, classes] = await Promise.all([
      window.cv3Students ? window.cv3Students.getStudents() : [], window.store.list('tuition'),
      window.cv3Students ? window.cv3Students.getClasses() : [],
    ]);
    const nameOf = id => { const s = studs.find(x => x.id == id); return s ? s.name : '—'; };
    const clsOf = id => { const s = studs.find(x => x.id == id); const c = s && classes.find(x => x.id == s.class_id); return c ? c.name : ''; };
    const ym = today().slice(0, 7);
    const clsFilter = classes.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
    const methodOpts = PAY_METHODS.map(m => '<option>' + m + '</option>').join('');
    const pickHtml = await window.cv3Picker.html('tui');
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>שכר לימוד</h2>' +
      '<div class="head-actions"><button class="btn-ghost sm" id="tCsv"><i class="bi bi-download"></i> ייצוא לאקסל</button></div></div>' +
      '<div class="qr-card"><h3><i class="bi bi-cash-coin"></i> רישום תשלום/חוב</h3><div class="qr-grid" style="grid-template-columns:repeat(3,1fr) auto">' +
        pickHtml +
        '<input class="inp mb0" id="tMonth" type="month" value="' + ym + '" title="חודש">' +
        '<input class="inp mb0" id="tDate" type="date" value="' + today() + '" title="תאריך תשלום">' +
        '<input class="inp mb0" id="tAmt" type="number" placeholder="סכום ₪">' +
        '<select class="inp mb0" id="tMethod"><option value="">אמצעי תשלום…</option>' + methodOpts + '</select>' +
        '<select class="inp mb0" id="tStatus"><option value="paid">שולם</option><option value="due">חוב</option></select>' +
        '<input class="inp mb0" id="tNote" placeholder="הערה (רשות)">' +
        '<button class="btn-primary sm" id="tSave"><i class="bi bi-plus-lg"></i> הוסף</button>' +
      '</div></div>' +
      '<div class="toolbar" style="grid-template-columns:auto auto 1fr"><select class="inp mb0" id="tClsF"><option value="">כל הכיתות</option>' + clsFilter + '</select>' +
        '<select class="inp mb0" id="tGroup" title="תצוגה לפי"><option value="">ללא קיבוץ</option><option value="student">לפי תלמיד</option><option value="class">לפי כיתה</option><option value="status">לפי סטטוס</option></select>' +
        '<span class="count-line" id="tSum" style="align-self:center"></span></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>תלמיד</th><th>כיתה</th><th>חודש</th><th>תאריך</th><th>סכום</th><th>אמצעי</th><th>סטטוס</th><th>הערה</th><th></th></tr></thead><tbody id="tBody"></tbody></table></div>';
    const pick = window.cv3Picker.wire(page, 'tui');
    const rows = () => { const cf = page.querySelector('#tClsF').value; return tuition.filter(t => !cf || String((studs.find(s => s.id == t.student_id) || {}).class_id) === cf); };
    const rowHtml = t =>
      '<tr><td>' + esc(nameOf(t.student_id)) + '</td><td>' + esc(clsOf(t.student_id)) + '</td><td>' + esc(t.month || '') + '</td><td>' + esc(t.pay_date || '') + '</td>' +
      '<td>' + (t.amount ? '₪' + esc(t.amount) : '') + '</td><td>' + esc(t.method || '') + '</td>' +
      '<td><button class="chip ' + (t.status === 'paid' ? 'ok' : 'off') + '" data-tog="' + t.id + '">' + (t.status === 'paid' ? 'שולם' : 'חוב') + '</button></td>' +
      '<td>' + esc(t.note || '') + '</td>' +
      '<td class="row-act"><button class="mini danger" data-del="' + t.id + '"><i class="bi bi-trash"></i></button></td></tr>';
    const gKey = (t, g) => g === 'student' ? nameOf(t.student_id) : g === 'class' ? (clsOf(t.student_id) || 'ללא כיתה') : (t.status === 'paid' ? 'שולם' : 'חוב');
    function draw() {
      const rs = rows();
      const g = page.querySelector('#tGroup').value;
      let html;
      if (!g) { html = rs.map(rowHtml).join(''); }
      else {
        const groups = {};
        rs.forEach(t => { const k = gKey(t, g); (groups[k] = groups[k] || []).push(t); });
        html = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'he')).map(k => {
          const sum = groups[k].reduce((s, t) => s + (Number(t.amount) || 0), 0);
          return '<tr class="grp-hdr"><td colspan="9" style="background:var(--bg2,#f1f4f8);font-weight:700;padding:8px 10px">' +
            esc(k) + ' <span style="color:var(--muted);font-weight:400">(' + groups[k].length + ' · ₪' + sum + ')</span></td></tr>' +
            groups[k].map(rowHtml).join('');
        }).join('');
      }
      page.querySelector('#tBody').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:20px">אין רישומים</td></tr>';
      const paid = rs.filter(t => t.status === 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const due = rs.filter(t => t.status !== 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      page.querySelector('#tSum').textContent = 'שולם ₪' + paid + ' · חוב ₪' + due + ' · ' + rs.length + ' רישומים';
      page.querySelectorAll('[data-tog]').forEach(b => b.addEventListener('click', async () => { const t = tuition.find(x => x.id == b.dataset.tog); t.status = t.status === 'paid' ? 'due' : 'paid'; await window.store.update('tuition', t.id, { status: t.status }); draw(); }));
      page.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { await window.store.remove('tuition', Number(b.dataset.del)); const i = tuition.findIndex(x => x.id == b.dataset.del); if (i >= 0) tuition.splice(i, 1); draw(); window.UI.toast('נמחק'); }));
    }
    page.querySelector('#tSave').addEventListener('click', async () => {
      const sid = pick.value(); if (!sid) { window.UI.toast('בחר תלמיד', 'err'); return; }
      const row = { student_id: Number(sid), month: page.querySelector('#tMonth').value, pay_date: page.querySelector('#tDate').value, amount: page.querySelector('#tAmt').value, method: page.querySelector('#tMethod').value, status: page.querySelector('#tStatus').value, note: page.querySelector('#tNote').value.trim() };
      const r = await window.store.add('tuition', row);
      tuition.push((r.data && r.data[0]) || row);
      page.querySelector('#tAmt').value = ''; page.querySelector('#tNote').value = '';
      draw(); window.UI.toast('נוסף');
    });
    page.querySelector('#tClsF').addEventListener('change', draw);
    page.querySelector('#tGroup').addEventListener('change', draw);
    page.querySelector('#tCsv').addEventListener('click', () => {
      const head = ['תלמיד', 'כיתה', 'חודש', 'תאריך תשלום', 'סכום', 'אמצעי', 'סטטוס', 'הערה'];
      const lines = [head.join(',')].concat(rows().map(t => [nameOf(t.student_id), clsOf(t.student_id), t.month, t.pay_date, t.amount, t.method, t.status === 'paid' ? 'שולם' : 'חוב', t.note].map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tuition.csv'; a.click();
    });
    draw();
  }

  const R = window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  R.settings = renderSettings;
  R.tuition = renderTuition;
})();
