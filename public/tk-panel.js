/* Take-off screen (part 2): results & comparison, automatic measurements & mapping, sheets & constants, push to quote. */
(function () {
  'use strict';
  const TKC = window.TKC, U = window.TKU;
  const { st, esc, $, $$ } = U;
  const H = () => window.TKHOST;
  const gtk = () => { const s = H().S().settings; if (!s.tk) s.tk = { consts: {}, vars: [], rules: [] }; ['consts'].forEach(k => { s.tk[k] = s.tk[k] || {}; }); ['vars', 'rules'].forEach(k => { s.tk[k] = s.tk[k] || []; }); return s.tk; };
  const itemOf = v => { const it = H().S().items; return it.find(i => i.id === v.item) || it.find(i => i.std && i.std === v.item) || null; };
  const KIND = { count: 'عدد', len: 'طول (م)', area: 'مساحة (م²)' };
  const SRC = { block: 'كتلة CAD', layer: 'طبقة CAD', color: 'لون PDF', text: 'نص في المخطط' };
  const fmtQ = (x, kind) => kind === 'count' ? String(Math.round(x)) : (Math.round(x * 100) / 100).toLocaleString('en-US');
  const isAdmin = () => H().ME().role === 'admin';
  let filt = '';

  function compute() { return TKC.compute(U.data(), gtk().rules, gtk().consts); }
  U.compute = compute;

  U.renderSide = function () {
    const tabs = $('#tkTabs'); if (!tabs) return;
    const T = [['res', 'النتائج والمقارنة'], ['meas', 'القياسات التلقائية'], ['set', 'الأوراق والثوابت والقواعد']];
    tabs.innerHTML = T.map(t => `<button type="button" class="tab ${st.tab === t[0] ? 'on' : ''}" data-tk="tab" data-t="${t[0]}">${t[1]}</button>`).join('');
    const box = $('#tkSide'); const keep = document.activeElement && document.activeElement.id;
    box.innerHTML = st.tab === 'res' ? tabRes() : st.tab === 'meas' ? tabMeas() : tabSet();
    if (keep && $('#' + keep)) { const el = $('#' + keep); el.focus(); if (el.setSelectionRange && /text|search/.test(el.type)) { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ } } }
  };

  /* ---------- results ---------- */
  function tabRes() {
    const d = U.data(), res = compute(), S = H().S();
    let total = 0, estN = 0;
    const rowsH = res.rows.map(r => {
      const v = r.v, it = itemOf(v), price = it ? it.price : 0, tot = r.q * price; total += tot; if (it && it.est && r.q > 0) estN++;
      const vals = TKC.METHODS.map(m => r.by[m]).filter(x => x > 0);
      const diff = vals.length > 1 && Math.max(...vals) > Math.min(...vals) * 1.05;
      const cell = m => `<td class="mc ${r.method === m ? 'sel' : ''}"><label><input type="radio" name="ad-${v.id}" data-tk="adopt" data-v="${v.id}" data-m="${m}" ${r.method === m ? 'checked' : ''} ${r.by[m] > 0 ? '' : 'disabled'}> ${r.by[m] > 0 ? fmtQ(r.by[m], v.kind) : '—'}</label></td>`;
      return `<tr data-id="${v.id}" class="${v.id === st.varId ? 'cur' : ''}">
        <td><button type="button" class="lnk" data-tk="selvar" data-v="${v.id}" title="اجعله المتغير الحالي">${esc(v.name)}</button><div class="muted" style="font-size:11px">${KIND[v.kind]}${v.sys ? ' · ' + esc(v.sys) : ''} ${diff ? '<span class="estb" title="اختلاف بين الطرق أكثر من 5%">فرق</span>' : ''}</div></td>
        ${cell('auto')}${cell('man')}${cell('tpl')}${cell('ai')}
        <td class="mc ${r.method === 'typed' ? 'sel' : ''}"><label><input type="radio" name="ad-${v.id}" data-tk="adopt" data-v="${v.id}" data-m="typed" ${r.method === 'typed' ? 'checked' : ''}> <input type="number" step="any" min="0" class="ltr" style="width:70px" data-tk="typed" data-v="${v.id}" value="${esc(d.manual[v.id] ?? '')}" aria-label="إدخال يدوي"></label></td>
        <td><input class="ltr ${r.err ? 'bad' : ''}" style="width:150px" data-tk="formula" data-v="${v.id}" value="${esc(v.formula || 'q')}" title="${esc(r.err || 'q = الكمية المعتمدة؛ ويمكن استخدام ثوابت ومتغيرات أخرى')}" aria-label="المعادلة"></td>
        <td><b>${fmtQ(r.q, v.kind)}</b></td>
        <td><input list="tkItems" data-tk="item" data-v="${v.id}" value="${esc(it ? it.desc : '')}" placeholder="اختر صنفاً من المكتبة" style="min-width:320px" aria-label="الصنف">${it && it.est ? ' <span class="estb">تقريبي</span>' : ''}</td>
        <td class="num">${it ? H().fmt(price) : '—'}</td><td class="num">${it ? H().fmt(tot) : '—'}</td>
        <td><button class="ib" type="button" data-tk="delvar" data-v="${v.id}" aria-label="حذف المتغير">✕</button></td></tr>`;
    }).join('');
    const tpl = `<select id="tkTpl"><option value="">إضافة قالب نظام…</option>${TKC.TEMPLATES.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>`;
    return `<datalist id="tkItems">${S.items.slice(0, 1500).map(i => `<option value="${esc(i.desc)}">${esc(i.brand || '')} — ${esc(i.cat)}</option>`).join('')}</datalist>
      <p class="muted" style="margin:0 0 8px">لكل بند عدة طرق للحصر. <b>اعتمد</b> ما تراه الأدق بالنقر على الخيار، وعند وجود «فرق» بين الطرق راجع المخطط. الكمية النهائية = المعادلة مطبّقة على المعتمد (مثال: <span dir="ltr">q*(1+waste/100)</span> لإضافة هالك).</p>
      <div class="tablewrap"><table class="t tk-res" style="min-width:1180px"><thead><tr><th>المتغير</th><th>${esc(TKC.M_LBL.auto)}</th><th>${esc(TKC.M_LBL.man)}</th><th>${esc(TKC.M_LBL.tpl)}</th><th>${esc(TKC.M_LBL.ai)}</th><th>إدخال</th><th>المعادلة</th><th>الكمية</th><th>الصنف في المكتبة</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
      <tbody>${rowsH || '<tr><td colspan="12" class="empty">لا توجد متغيرات. أضف قالباً أو متغيراً جديداً.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="10" style="text-align:left"><b>الإجمالي قبل الضريبة</b>${estN ? ` <span class="estb">${estN} بند بسعر تقريبي</span>` : ''}</td><td class="num"><b>${H().fmt(total)}</b></td><td></td></tr></tfoot></table></div>
      <div class="row" style="margin-top:12px;flex-wrap:wrap">${tpl}
        <input id="tkNvName" placeholder="اسم متغير جديد" style="max-width:200px"><select id="tkNvKind"><option value="count">عدد</option><option value="len">طول</option><option value="area">مساحة</option></select><button class="btn sm" type="button" data-tk="addvar">إضافة متغير</button></div>`;
  }

  /* ---------- measurements ---------- */
  function aggMeas() {
    const m = new Map();
    for (const x of U.data().meas) {
      const k = x.src + '\u0001' + x.key; let g = m.get(k);
      if (!g) { g = { src: x.src, key: x.key, kind: x.kind, value: 0, n: 0, off: true, note: x.note || '', color: x.color }; m.set(k, g); }
      g.value += +x.value || 0; g.n++; if (!x.off) g.off = false;
    }
    return [...m.values()];
  }
  function tabMeas() {
    const d = U.data(), rules = gtk().rules, f = TKC.norm(filt);
    const rows = aggMeas().filter(g => !f || TKC.norm(g.key + ' ' + SRC[g.src]).includes(f)).sort((a, b) => (a.src === b.src ? b.value - a.value : a.src.localeCompare(b.src)));
    const opt = (cur, kind) => `<option value="~" ${cur === '~' ? 'selected' : ''}>— تلقائي (حسب القواعد) —</option><option value="" ${cur === '' ? 'selected' : ''}>— غير مرتبط —</option>${U.data().vars.filter(v => v.kind === kind).map(v => `<option value="${v.id}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}`;
    return `<p class="muted" style="margin:0 0 8px">قياسات استُخرجت تلقائياً من الملفات: <b>عدد الكتل</b> وأطوال/مساحات <b>الطبقات</b> لملفات CAD، و<b>ألوان الخطوط</b> والنصوص المتكررة لملفات PDF. اربط كل بند بمتغير ليدخل في الحصر. مرّر الفأرة على الصف لإبرازه على الرسم.</p>
      <div class="row" style="margin-bottom:10px"><input id="tkMF" type="search" placeholder="بحث في القياسات" value="${esc(filt)}" style="max-width:300px"><button class="btn sm" type="button" data-tk="reextract">إعادة القياس التلقائي للورقة الحالية</button></div>
      <div class="tablewrap" style="max-height:60vh"><table class="t" style="min-width:780px"><thead><tr><th style="width:50px">يشمل</th><th style="width:110px">المصدر</th><th>الاسم</th><th style="width:110px">القيمة</th><th style="width:280px">المتغير</th>${isAdmin() ? '<th style="width:120px"></th>' : ''}</tr></thead><tbody>${rows.map(g => {
        const ak = g.src + ':' + g.key; const has = Object.prototype.hasOwnProperty.call(d.assign, ak); const cur = has ? d.assign[ak] : '~';
        const eff = TKC.varFor(g.src, g.key, d.assign, rules); const fromRule = !has && eff; const gv = !has && !eff ? TKC.guess(g, d.vars) : '';
        const kind = g.kind;
        return `<tr data-k="${esc(ak)}" data-src="${g.src}" data-key="${esc(g.key)}" ${g.src === 'block' || g.src === 'layer' ? 'data-hl="1"' : ''}><td><input type="checkbox" data-tk="mincl" ${g.off ? '' : 'checked'}></td><td>${SRC[g.src]}</td><td class="ltr" style="direction:ltr;text-align:right">${g.color ? `<span style="display:inline-block;width:12px;height:12px;background:${esc(g.color)};border:1px solid #888;margin-inline-end:6px"></span>` : ''}${esc(g.key)}${g.note ? ` <span class="muted">(${esc(g.note)})</span>` : ''}</td><td>${fmtQ(g.value, kind)} ${kind === 'len' ? 'م' : kind === 'area' ? 'م²' : ''}${kind !== 'count' && !g.value ? ' <span class="estb" title="عاير الورقة">يحتاج معايرة</span>' : ''}</td>
          <td><select data-tk="massign">${opt(cur, kind)}</select>${fromRule ? ' <span class="muted" style="font-size:11px">(قاعدة عامة)</span>' : ''}${gv ? ` <span class="muted" style="font-size:11px">← ${esc((d.vars.find(v => v.id === gv) || {}).name)} (تخمين من الاسم)</span>` : ''}</td>${isAdmin() ? `<td>${eff && has ? '<button class="btn sm" type="button" data-tk="rule-save">حفظ كقاعدة عامة</button>' : ''}</td>` : ''}</tr>`;
      }).join('') || '<tr><td colspan="6" class="empty">لا توجد قياسات تلقائية. ارفع ملفاً أو استخدم أدوات القياس اليدوي.</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- sheets, constants, rules ---------- */
  function tabSet() {
    const d = U.data(), g = gtk(), consts = Object.assign({}, TKC.DEFAULT_CONSTS, g.consts, d.consts);
    return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;align-items:start">
      <div><h3 style="margin-top:0">الأوراق</h3><div class="tablewrap"><table class="t"><thead><tr><th>الاسم</th><th>النوع</th><th>المقياس (م لكل وحدة)</th><th></th></tr></thead><tbody>${d.sheets.map(s => `<tr data-sid="${s.id}"><td><input data-tk="sname" value="${esc(s.name)}"></td><td>${({ pdf: 'PDF', cad: 'CAD', img: 'صورة' })[s.kind] || s.kind}</td><td class="ltr">${s.scale ? Number(s.scale.toPrecision(5)) : '—'} <span class="muted">${esc(s.scaleSrc || '')}</span></td><td><button class="ib" type="button" data-tk="sdel" aria-label="حذف الورقة">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">لا توجد أوراق</td></tr>'}</tbody></table></div></div>
      <div><h3 style="margin-top:0">الثوابت (تُستخدم في المعادلات)</h3><p class="muted" style="margin:0 0 6px">مثال: <span dir="ltr">waste</span> نسبة الهالك %، <span dir="ltr">avgrun</span> متوسط طول الكابل لكل جهاز بالمتر.</p>
      <table class="t"><tbody>${Object.entries(consts).map(([k, v]) => `<tr><td class="ltr" style="direction:ltr;text-align:right">${esc(k)}</td><td><input type="number" step="any" class="ltr" style="width:100px" data-tk="const" data-k="${esc(k)}" value="${esc(v)}"></td><td><button class="ib" type="button" data-tk="cdel" data-k="${esc(k)}" aria-label="حذف">✕</button></td></tr>`).join('')}</tbody></table>
      <div class="row" style="margin-top:8px"><input id="tkCk" placeholder="اسم ثابت (إنجليزي)" style="max-width:150px;direction:ltr"><input id="tkCv" type="number" step="any" placeholder="القيمة" style="max-width:90px"><button class="btn sm" type="button" data-tk="cadd">إضافة</button></div>
      ${isAdmin() ? '<div style="margin-top:12px"><button class="btn sm" type="button" data-tk="defaults-save">حفظ المتغيرات والثوابت الحالية كإعداد افتراضي لكل المستخدمين</button></div>' : ''}</div>
      <div><h3 style="margin-top:0">القواعد العامة لربط الرموز</h3><p class="muted" style="margin:0 0 6px">قاعدة تربط اسم كتلة أو طبقة (يقبل <span dir="ltr">*</span>) بمتغير، فتُطبَّق تلقائياً على كل ملف حصر. ${isAdmin() ? 'تُنشأ من تبويب «القياسات التلقائية».' : 'يضيفها المدير.'}</p>
      <table class="t"><tbody>${g.rules.map((r, i) => `<tr><td>${SRC[r.src]}</td><td class="ltr" style="direction:ltr;text-align:right">${esc(r.pat)}</td><td>${esc((d.vars.find(v => v.id === r.var) || {}).name || r.var)}</td>${isAdmin() ? `<td><button class="ib" type="button" data-tk="rdel" data-i="${i}" aria-label="حذف">✕</button></td>` : ''}</tr>`).join('') || '<tr><td class="empty">لا توجد قواعد عامة</td></tr>'}</tbody></table></div></div>`;
  }

  /* ---------- handlers ---------- */
  const toast = t => H().toast(t);
  U.onClick = function (a, b) {
    const d = U.data();
    switch (a) {
      case 'tab': st.tab = b.dataset.t; U.renderSide(); break;
      case 'selvar': st.varId = b.dataset.v; { const sel = $('#tkVar'); if (sel) sel.value = st.varId; const v = U.varById(st.varId); if (v && ['count', 'len', 'area'].includes(st.tool) && st.tool !== v.kind) { st.tool = v.kind; $$('.tl').forEach(x => x.classList.toggle('on', x.dataset.t === st.tool)); } } U.renderSide(); U.paintOverlay(); break;
      case 'delvar': { const v = U.varById(b.dataset.v); if (!v) break; if (!confirm(`حذف المتغير «${v.name}» وجميع علاماته؟`)) break; d.vars = d.vars.filter(x => x !== v); d.marks = d.marks.filter(m => m.var !== v.id); if (st.varId === v.id) st.varId = (d.vars[0] || {}).id || ''; U.markDirty(); U.paintOverlay(); refreshBar(); break; }
      case 'addvar': { const name = $('#tkNvName').value.trim(); if (!name) { toast('اكتب اسم المتغير'); break; } let id = 'v' + Math.random().toString(36).slice(2, 7); d.vars.push({ id, name, kind: $('#tkNvKind').value, item: '', formula: 'q', sys: '' }); st.varId = id; U.markDirty(); refreshBar(); break; }
      case 'sdel': { const sid = b.closest('tr').dataset.sid; if (!confirm('حذف الورقة وجميع علاماتها وقياساتها؟')) break; d.sheets = d.sheets.filter(s => s.id !== sid); d.marks = d.marks.filter(m => m.sheet !== sid); d.meas = d.meas.filter(m => m.sheet !== sid); if (st.sheet && st.sheet.id === sid) { st.sheet = null; st.R = null; if (d.sheets[0]) U.activate(d.sheets[0].id); else { U.showMsg('لا توجد أوراق. ارفع ملفاً.'); U.redraw(true); } } U.markDirty(); refreshBar(); break; }
      case 'cadd': { const k = $('#tkCk').value.replace(/[^A-Za-z0-9_]/g, ''); if (!/^[A-Za-z_]/.test(k)) { toast('اسم الثابت إنجليزي ويبدأ بحرف'); break; } d.consts[k] = parseFloat($('#tkCv').value) || 0; U.markDirty(); break; }
      case 'cdel': delete d.consts[b.dataset.k]; delete gtk().consts[b.dataset.k]; U.markDirty(); break;
      case 'rdel': gtk().rules.splice(+b.dataset.i, 1); H().saveS(); U.renderSide(); break;
      case 'rule-save': { const tr = b.closest('tr'), vid = d.assign[tr.dataset.src + ':' + tr.dataset.key]; if (!vid) break; const g = gtk(); g.rules = g.rules.filter(r => !(r.src === tr.dataset.src && TKC.norm(r.pat) === TKC.norm(tr.dataset.key))); g.rules.push({ id: 'r' + Math.random().toString(36).slice(2, 8), src: tr.dataset.src, pat: tr.dataset.key, var: vid }); H().saveS(); toast('حُفظت القاعدة العامة'); U.renderSide(); break; }
      case 'defaults-save': { const g = gtk(); g.vars = d.vars.map(v => ({ ...v })); g.consts = { ...g.consts, ...d.consts }; H().saveS(); toast('حُفظت كإعداد افتراضي'); break; }
      case 'reextract': if (st.sheet) { st.sheet.ex = false; U.activate(st.sheet.id); } break;
      case 'push-ok': doPush(); break;
    }
  };
  function refreshBar() { const sel = $('#tkVar'); if (sel) { const d = U.data(); sel.innerHTML = d.vars.map(v => `<option value="${v.id}" ${v.id === st.varId ? 'selected' : ''}>${esc(v.name)} (${v.kind === 'count' ? 'عدد' : v.kind === 'len' ? 'طول' : 'مساحة'})</option>`).join('') || '<option value="">أضف متغيراً أولاً</option>'; } }
  U.onChange = function (t) {
    const d = U.data(), tr = t.closest('tr');
    switch (t.dataset.tk) {
      case 'adopt': d.adopt[t.dataset.v] = t.dataset.m; U.markDirty(); break;
      case 'typed': d.manual[t.dataset.v] = t.value === '' ? '' : parseFloat(t.value) || 0; d.adopt[t.dataset.v] = 'typed'; U.markDirty(); break;
      case 'formula': { const v = U.varById(t.dataset.v); const e = TKC.check(t.value || 'q'); if (e) { toast('معادلة غير صحيحة: ' + e); break; } v.formula = t.value || 'q'; U.markDirty(); break; }
      case 'item': { const v = U.varById(t.dataset.v), it = H().S().items.find(i => i.desc === t.value); if (it) { v.item = it.id; U.markDirty(); } else if (!t.value) { v.item = ''; U.markDirty(); } else toast('اختر صنفاً من القائمة المقترحة'); break; }
      case 'massign': { const k = tr.dataset.k; if (t.value === '~') delete d.assign[k]; else d.assign[k] = t.value; U.markDirty(); break; }
      case 'mincl': { const src = tr.dataset.src, key = tr.dataset.key; d.meas.forEach(m => { if (m.src === src && m.key === key) { if (t.checked) delete m.off; else m.off = true; } }); U.markDirty(); break; }
      case 'sname': { const s = d.sheets.find(x => x.id === tr.dataset.sid); if (s) { s.name = t.value; U.markDirty(); const o = $('#tkSheet'); if (o) { const op = [...o.options].find(x => x.value === s.id); if (op) op.textContent = s.name; } } break; }
      case 'const': d.consts[t.dataset.k] = parseFloat(t.value) || 0; U.markDirty(); break;
      default:
        if (t.id === 'tkTpl' && t.value) { const tv = TKC.templateVars([t.value]); const have = new Set(d.vars.map(v => v.id)); tv.vars.forEach(v => { let id = v.id; while (have.has(id)) id += '_'; have.add(id); d.vars.push({ ...v, id }); }); Object.keys(tv.consts).forEach(k => { if (d.consts[k] === undefined) d.consts[k] = tv.consts[k]; }); if (!st.varId) st.varId = d.vars[0].id; U.markDirty(); refreshBar(); }
    }
  };
  U.onInput = function (t) {
    if (t.id === 'tkMF') { filt = t.value; const box = $('#tkSide'); const keep = t.selectionStart; box.innerHTML = tabMeas(); const n = $('#tkMF'); n.focus(); n.setSelectionRange(keep, keep); }
  };
  // hover highlight of automatic measurements on the CAD drawing
  document.addEventListener('mouseover', e => { const tr = e.target.closest && e.target.closest('tr[data-hl]'); if (!tr || !$('#tkStage')) return; U.hl(tr.dataset.src === 'block' ? { block: tr.dataset.key } : { layer: tr.dataset.key.replace(/ \[مساحة\]$/, '') }); });
  document.addEventListener('mouseout', e => { const tr = e.target.closest && e.target.closest('tr[data-hl]'); if (tr && $('#tkStage')) U.hl(null); });

  /* ---------- push to quote ---------- */
  U.pushModal = function () {
    const S = H().S(), res = compute(), tk = st.tk;
    const qs = S.quotes.filter(q => H().canQ(q));
    const items = res.rows.filter(r => r.q > 0).map(r => ({ r, it: itemOf(r.v) }));
    if (!items.length) { toast('لا توجد كميات لترحيلها بعد'); return; }
    const miss = items.filter(x => !x.it);
    H().modal(`<h3 style="margin-top:0">ترحيل الكميات إلى عرض السعر</h3>
      <label class="fld"><span>عرض السعر</span><select id="tkPq">${H().canCreate() ? '<option value="__new">+ إنشاء عرض سعر جديد</option>' : ''}${qs.map(q => `<option value="${q.id}" ${q.id === tk.quoteId ? 'selected' : ''}>${esc(q.no)} ${esc(q.project || q.client || '')}</option>`).join('')}</select></label>
      <div class="fld"><span>طريقة الإضافة</span><label class="chk" style="display:flex"><input type="radio" name="tkpm" value="update" checked> تحديث الكميات للبنود الموجودة (المرحّلة سابقاً أو المطابقة للمكتبة) وإضافة الباقي</label><label class="chk" style="display:flex"><input type="radio" name="tkpm" value="add"> إضافة جميع البنود كأسطر جديدة</label></div>
      <div class="tablewrap" style="max-height:38vh"><table class="t"><thead><tr><th>البند</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.filter(x => x.it).map(x => `<tr><td>${esc(x.it.desc)}${x.it.est ? ' <span class="estb">تقريبي</span>' : ''}</td><td>${fmtQ(x.r.q, x.r.v.kind)} ${esc(x.it.unit)}</td><td class="num">${H().fmt(x.it.price)}</td><td class="num">${H().fmt(x.r.q * x.it.price)}</td></tr>`).join('')}</tbody></table></div>
      ${miss.length ? `<p class="muted">⚠ لن تُرحَّل ${miss.length} بنود لعدم ربطها بصنف من المكتبة: ${miss.map(x => esc(x.r.v.name)).join('، ')}</p>` : ''}
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-tk="m-cancel">إلغاء</button><button class="btn pri" type="button" data-tk="push-ok">ترحيل</button></div>`);
  };
  async function doPush() {
    const S = H().S(), tk = st.tk, res = compute(); const sel = $('#tkPq').value, mode = ($('input[name=tkpm]:checked') || {}).value || 'update';
    let q;
    try {
      if (sel === '__new') q = await H().newQuote({ project: tk.name }); else q = S.quotes.find(x => x.id === sel);
    } catch (e) { H().fail(e); return; }
    if (!q) { toast('اختر عرض سعر'); return; }
    let n = 0;
    for (const r of res.rows) {
      const it = itemOf(r.v); if (!it || !(r.q > 0)) continue;
      const src = 'tk:' + tk.id.slice(0, 8) + ':' + r.v.id;
      let l = q.lines.find(x => x.src === src) || (mode === 'update' ? q.lines.find(x => x.lib === it.id && !x.src) : null);
      if (l) { l.qty = r.q; l.src = src; }
      else {
        l = { id: H().uid(), lib: it.id, group: it.cat, desc: it.desc, brand: it.brand, unit: it.unit, qty: r.q, price: it.price, src }; if (it.est) l.est = true;
        let idx = -1; q.lines.forEach((x, i) => { if (x.group === l.group) idx = i; }); if (idx >= 0) q.lines.splice(idx + 1, 0, l); else q.lines.push(l);
      }
      n++;
    }
    tk.quoteId = q.id; U.markDirty(); H().closeModal(); H().saveS(); await U.save(); H().toast(`رُحّلت ${n} بنود إلى عرض السعر ${q.no}`); H().go('quote', q.id);
  }
})();
