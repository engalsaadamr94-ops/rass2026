/* Take-off screen (part 1): state, files & sheets, viewer, tools. Part 2 (tk-panel.js) renders results / measurements / push-to-quote. */
(function () {
  'use strict';
  const TKC = window.TKC, V = window.TKV, VIS = window.TKVIS;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const H = () => window.TKHOST;
  const PAL = ['#d6336c', '#1c7ed6', '#2f9e44', '#9c36b5', '#f08c00', '#0b7285', '#c2255c', '#5f3dc4', '#e8590c', '#495057'];
  const uid = () => H().uid();

  const st = {
    tk: null, sheet: null, R: null, F: null, tool: 'pan', varId: '', view: { x: 0, y: 0, z: 1 }, W: 0, Hh: 0, dpr: 1,
    draft: [], cal: [], rect: null, cand: null, undo: [], space: false, tab: 'res', saveT: null, saveState: '', rot: false, loading: '', hoverMeas: null,
    files: {}, mounted: false, busy: false,
  };
  const TKU = window.TKU = { st, esc, $, $$, PAL };
  const data = () => st.tk.data;
  const sheets = () => data().sheets;
  const vars = () => data().vars;
  const varById = id => vars().find(v => v.id === id);
  const varColor = id => PAL[Math.max(0, vars().findIndex(v => v.id === id)) % PAL.length];
  TKU.data = data; TKU.varById = varById; TKU.varColor = varColor;

  /* ---------- persistence ---------- */
  function markDirty() {
    st.saveState = 'غير محفوظ'; paintSave();
    clearTimeout(st.saveT); st.saveT = setTimeout(save, 900);
    TKU.renderSide && TKU.renderSide();
  }
  async function save() {
    clearTimeout(st.saveT);
    if (!st.tk || st.busy) return;
    st.busy = true; st.saveState = 'جارٍ الحفظ…'; paintSave();
    try {
      const r = await H().api('PUT', '/takeoffs/' + st.tk.id, { v: st.tk.v, name: st.tk.name, quoteId: st.tk.quoteId || '', data: data() });
      st.tk.v = r.v; st.saveState = 'محفوظ على الخادم';
    } catch (e) {
      st.saveState = 'تعذر الحفظ'; if (e.code === 'conflict') { H().toast('تم تعديل هذا الملف من مكان آخر. أعد فتحه.'); st.saveState = 'تعارض'; } else H().fail(e);
    } finally { st.busy = false; paintSave(); }
  }
  function paintSave() { const el = $('#tkSave'); if (el) { el.textContent = st.saveState; el.style.color = /تعذر|تعارض/.test(st.saveState) ? 'var(--bad)' : ''; } }
  TKU.markDirty = markDirty; TKU.save = save;

  /* ---------- list view ---------- */
  async function mount() {
    const main = H().main;
    st.tk = null;
    main.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    let list = [];
    try { list = (await H().api('GET', '/takeoffs')).takeoffs; } catch (e) { H().fail(e); main.innerHTML = '<div class="empty">تعذر تحميل ملفات الحصر</div>'; return; }
    const S = H().S();
    const qn = id => { const q = S.quotes.find(x => x.id === id); return q ? q.no + (q.project ? ' - ' + q.project : '') : ''; };
    main.innerHTML = `<div class="title-row"><h1>حصر الكميات</h1><span class="chip">${list.length} ملف</span><div class="sp"></div><button class="btn pri" type="button" data-tk="new">ملف حصر جديد</button></div>
    <div class="card"><p class="muted" style="margin:0 0 12px">ارفع مخططات PDF أو ملفات AutoCAD (DWG / DXF) أو صوراً، عاير المقياس، وعدّ الرموز وقِس الأطوال والمساحات، ثم رحّل الكميات المعتمدة إلى عرض السعر مباشرة.</p>
    <div class="tablewrap"><table class="t" style="min-width:640px"><thead><tr><th>الاسم</th><th>عرض السعر</th><th>المستخدم</th><th style="width:140px">آخر تعديل</th><th style="width:70px"></th></tr></thead><tbody>${list.map(t => `<tr data-id="${t.id}"><td><a href="#" data-tk="open">${esc(t.name)}</a></td><td>${esc(qn(t.quoteId))}</td><td>${esc(t.ownerName)}</td><td>${esc(H().when(t.updated))}</td><td><button class="ib" type="button" data-tk="del" aria-label="حذف">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد ملفات حصر بعد.</td></tr>'}</tbody></table></div></div>`;
  }
  TKU.mount = mount;

  function newModal() {
    const S = H().S();
    const qs = S.quotes.filter(q => H().canQ(q));
    H().modal(`<h3 style="margin-top:0">ملف حصر جديد</h3>
      <label class="fld"><span>الاسم</span><input id="tkn-name" placeholder="مثال: مشروع عمارة سكنية - الإنذار والإطفاء"></label>
      <label class="fld"><span>ربطه بعرض سعر (اختياري)</span><select id="tkn-q"><option value="">— بدون —</option>${qs.map(q => `<option value="${q.id}">${esc(q.no)} ${esc(q.project || q.client || '')}</option>`).join('')}</select></label>
      <div class="fld"><span>قوالب الأنظمة (تُنشئ المتغيرات تلقائياً ويمكن تعديلها)</span>
      ${TKC.TEMPLATES.map(t => `<label class="chk" style="display:flex;margin:4px 0"><input type="checkbox" name="tkn-t" value="${t.id}"> ${esc(t.name)}</label>`).join('')}</div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-tk="m-cancel">إلغاء</button><button class="btn pri" type="button" data-tk="m-create">إنشاء</button></div>`);
  }
  async function createTakeoff() {
    const ids = $$('input[name=tkn-t]:checked').map(x => x.value);
    const tv = TKC.templateVars(ids);
    const S = H().S(), g = (S.settings.tk || {});
    const vs = tv.vars.length ? tv.vars : (g.vars || []).map(v => ({ ...v }));
    try {
      const r = await H().api('POST', '/takeoffs', { name: $('#tkn-name').value.trim() || 'حصر جديد', quoteId: $('#tkn-q').value, data: { vars: vs, consts: { ...(g.consts || {}), ...tv.consts }, files: [], sheets: [], marks: [], meas: [], assign: {}, adopt: {}, manual: {} } });
      H().closeModal(); await openTk(r.id, r);
    } catch (e) { H().fail(e); }
  }

  /* ---------- editor ---------- */
  async function openTk(id, pre) {
    const main = H().main;
    main.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    try { st.tk = pre || await H().api('GET', '/takeoffs/' + id); } catch (e) { H().fail(e); return mount(); }
    const d = st.tk.data = st.tk.data || {};
    ['files', 'sheets', 'marks', 'meas', 'vars'].forEach(k => { d[k] = d[k] || []; }); ['assign', 'adopt', 'manual', 'consts'].forEach(k => { d[k] = d[k] || {}; });
    Object.assign(st, { sheet: null, R: null, F: null, tool: 'pan', varId: (d.vars[0] || {}).id || '', draft: [], cal: [], rect: null, cand: null, undo: [], tab: 'res', saveState: 'محفوظ على الخادم', files: {} });
    renderShell();
    if (d.sheets.length) activate(d.sheets[0].id); else showMsg('ابدأ برفع ملف مخطط (PDF أو DWG أو DXF أو صورة)');
    TKU.renderSide();
  }
  TKU.openTk = openTk;

  function renderShell() {
    const S = H().S(), qs = S.quotes.filter(q => H().canQ(q) || q.id === st.tk.quoteId);
    H().main.innerHTML = `<div class="tk">
    <div class="title-row"><button class="btn sm" type="button" data-tk="back">← الملفات</button><input id="tkName" class="tk-name" value="${esc(st.tk.name)}" aria-label="اسم ملف الحصر">
      <select id="tkQuote" aria-label="عرض السعر المرتبط"><option value="">— غير مرتبط بعرض —</option>${qs.map(q => `<option value="${q.id}" ${q.id === st.tk.quoteId ? 'selected' : ''}>${esc(q.no)} ${esc(q.project || q.client || '')}</option>`).join('')}</select>
      <span class="muted" id="tkSave" style="font-size:12px">${esc(st.saveState)}</span><div class="sp"></div>
      <button class="btn pri" type="button" data-tk="push">ترحيل إلى عرض السعر</button></div>
    <div class="card tk-viewer"><div class="tk-bar" id="tkBar"></div>
      <div class="tk-stage" id="tkStage" dir="ltr"><canvas id="tkB"></canvas><canvas id="tkO"></canvas><div class="tk-msg" id="tkMsg" hidden></div><div class="tk-cand" id="tkCand" hidden></div></div>
      <div class="tk-foot" id="tkFoot"></div></div>
    <div class="card tk-side"><div class="tabs2" id="tkTabs"></div><div id="tkSide"></div></div></div>`;
    paintBar(); bindStage();
  }

  function paintBar() {
    const tools = [['pan', 'تحريك'], ['count', 'عدّ'], ['len', 'طول'], ['area', 'مساحة'], ['match', 'مطابقة رمز'], ['cal', 'معايرة'], ['del', 'حذف علامة']];
    const sh = sheets();
    $('#tkBar').innerHTML = `<label class="btn sm" style="cursor:pointer">رفع ملفات<input id="tkFiles" type="file" multiple hidden accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"></label>
      <select id="tkSheet" aria-label="الورقة">${sh.length ? sh.map(s => `<option value="${s.id}" ${st.sheet && s.id === st.sheet.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('') : '<option>لا توجد أوراق</option>'}</select>
      <span class="tk-sep"></span>
      ${tools.map(t => `<button class="btn sm tl ${st.tool === t[0] ? 'on' : ''}" type="button" data-tk="tool" data-t="${t[0]}">${t[1]}</button>`).join('')}
      <select id="tkVar" aria-label="المتغير الحالي" title="المتغير الذي تُسجَّل عليه العلامات">${vars().map(v => `<option value="${v.id}" ${v.id === st.varId ? 'selected' : ''}>${esc(v.name)} (${v.kind === 'count' ? 'عدد' : v.kind === 'len' ? 'طول' : 'مساحة'})</option>`).join('') || '<option value="">أضف متغيراً أولاً</option>'}</select>
      <label class="chk" title="يبحث عن الرمز بعد تدويره 90/180/270 درجة"><input id="tkRot" type="checkbox" ${st.rot ? 'checked' : ''}> مع التدوير</label>
      <span class="tk-sep"></span>
      <button class="btn sm" type="button" data-tk="ai">اقتراح ذكي</button><button class="btn sm" type="button" data-tk="undo">تراجع</button><button class="btn sm" type="button" data-tk="fit">ملاءمة</button><button class="btn sm" type="button" data-tk="layers">الطبقات</button>`;
  }
  function showMsg(t) { const m = $('#tkMsg'); if (!m) return; m.hidden = !t; m.innerHTML = t || ''; }
  TKU.showMsg = showMsg;

  /* ---------- files / sheets ---------- */
  async function addFiles(list) {
    const errs = [];
    for (const f of list) {
      try {
        showMsg('جارٍ قراءة ' + esc(f.name) + '…');
        const buf = await f.arrayBuffer(); const kind = V.sniff(f.name, buf);
        if (!kind) { H().toast('صيغة غير مدعومة: ' + f.name); continue; }
        if (buf.byteLength > 150e6) { H().toast('الملف كبير جداً (أكثر من 150 ميغابايت)'); continue; }
        const fid = uid(); await V.fileStore.put(st.tk.id + '/' + fid, buf);
        const rec = { id: fid, name: f.name, kind, size: buf.byteLength };
        let F; try { F = await loadFile(rec, buf); } catch (er) { V.fileStore.del(st.tk.id + '/' + fid); throw er; }
        data().files.push(rec);
        if (kind === 'pdf') { for (let p = 1; p <= Math.min(F.pages, 80); p++) sheets().push({ id: uid(), fileId: fid, page: p, name: F.pages > 1 ? f.name + ' — صفحة ' + p : f.name, kind, scale: 0, scaleSrc: '' }); }
        else sheets().push({ id: uid(), fileId: fid, page: 1, name: f.name, kind: kind === 'img' ? 'img' : 'cad', scale: 0, scaleSrc: '' });
      } catch (e) { console.error(e); errs.push('<b>' + esc(f.name) + '</b><br>' + esc(e.message || 'تعذر فتح الملف')); }
    }
    showMsg(''); markDirty(); paintBar();
    const first = sheets().find(s => !s.ex); if (first) activate(first.id);
    if (errs.length) showMsg(errs.join('<hr>') + '<br><button class="btn sm" type="button" data-tk="msg-close" style="margin-top:10px">حسناً</button>');
  }
  async function loadFile(rec, buf) {
    if (st.files[rec.id]) return st.files[rec.id];
    if (!buf) buf = await V.fileStore.get(st.tk.id + '/' + rec.id);
    if (!buf) return null;
    let F;
    if (rec.kind === 'pdf') F = await V.openPdf(buf);
    else if (rec.kind === 'img') F = await V.imgOpen(buf, rec.name);
    else F = await V.cadOpen(buf, rec.kind);
    st.files[rec.id] = F; return F;
  }
  async function activate(sid) {
    const sh = sheets().find(s => s.id === sid); if (!sh) return;
    if (st.R && st.R.dispose) st.R.dispose();
    Object.assign(st, { sheet: sh, R: null, F: null, draft: [], cal: [], rect: null, cand: null });
    paintBar(); paintFoot(); redraw();
    const rec = data().files.find(f => f.id === sh.fileId);
    showMsg('جارٍ فتح الورقة…');
    let F = null;
    try { F = await loadFile(rec); } catch (e) { console.error(e); showMsg('تعذر فتح الملف: ' + esc(e.message || e) + (rec.kind === 'dwg' ? '<br>جرّب حفظه من AutoCAD بصيغة DXF وإعادة رفعه.' : '')); return; }
    if (st.sheet !== sh) return;
    if (!F) { missingFile(rec); return; }
    try {
      let R;
      if (rec.kind === 'pdf') R = await V.pdfSheet(F, sh.page); else if (rec.kind === 'img') R = V.imgSheet(F);
      else { if (!sh.scale) { const g = V.guessUnit(F); sh.scale = g.m; sh.scaleSrc = g.src === 'cad' ? 'ملف' : 'تقدير'; } R = V.cadSheet(F, sh.scale); }
      st.F = F; st.R = R; sh.w = R.w; sh.h = R.h;
      if (!sh.ex) await autoMeasure(sh, F, R);
      showMsg(''); fitView(); paintFoot(); paintBar(); redraw(); TKU.renderSide();
    } catch (e) { console.error(e); showMsg('تعذر عرض الورقة: ' + esc(e.message || e)); }
  }
  function missingFile(rec) {
    showMsg(`الملف الأصلي «${esc(rec.name)}» غير محفوظ على هذا الجهاز (الملفات الكبيرة تُحفظ في المتصفح فقط، أما القياسات والعلامات فهي محفوظة على الخادم).<br><label class="btn sm" style="cursor:pointer;margin-top:10px">اختر الملف نفسه لإعادة فتحه<input id="tkReup" type="file" hidden data-fid="${rec.id}"></label>`);
  }
  async function autoMeasure(sh, F, R) {
    data().meas = data().meas.filter(m => m.sheet !== sh.id);
    let rows = [];
    if (sh.kind === 'cad') rows = V.cadAutoMeas(F);
    else if (sh.kind === 'pdf') { const r = await V.pdfAutoMeas(F, sh.page, R); rows = r.meas; if (!sh.scale && r.scaleDen) { sh.scale = 25.4 / 72 / 1000 * r.scaleDen; sh.scaleSrc = 'نص 1:' + r.scaleDen; } }
    rows.forEach(m => data().meas.push({ ...m, sheet: sh.id }));
    sh.ex = true; rescale(sh); markDirty();
  }
  function rescale(sh) {
    for (const m of data().meas) if (m.sheet === sh.id) { if (m.kind === 'len') m.value = Math.round(m.raw * (sh.scale || 0) * 1000) / 1000; else if (m.kind === 'area') m.value = Math.round(m.raw * (sh.scale || 0) ** 2 * 1000) / 1000; }
  }
  TKU.rescale = rescale;

  /* ---------- view ---------- */
  function fitView() {
    if (!st.R) return; const b = st.R.bounds, w = b[2] - b[0], h = b[3] - b[1];
    const z = Math.min(st.W / w, st.Hh / h) * 0.96 || 1; st.view.z = z;
    st.view.x = (st.W - w * z) / 2 - b[0] * z;
    st.view.y = st.R.flip ? (st.Hh - h * z) / 2 + b[3] * z : (st.Hh - h * z) / 2 - b[1] * z;
    redraw(true);
  }
  const toScr = p => [p[0] * st.view.z + st.view.x, (st.R && st.R.flip ? -p[1] : p[1]) * st.view.z + st.view.y];
  const toSheet = (sx, sy) => [(sx - st.view.x) / st.view.z, (st.R && st.R.flip ? -(sy - st.view.y) : (sy - st.view.y)) / st.view.z];
  let raf = 0, idleT = 0;
  function redraw(refresh) {
    if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paintAll(); });
    if (refresh || (st.R && st.R.refresh)) { clearTimeout(idleT); idleT = setTimeout(() => { if (st.R && st.R.refresh) st.R.refresh(st.W, st.Hh, { ...st.view }, st.dpr, () => redraw()); }, refresh ? 10 : 180); }
  }
  function sizeStage() {
    const s = $('#tkStage'); if (!s) return;
    const w = s.clientWidth, h = s.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === st.W && h === st.Hh && dpr === st.dpr) return;
    st.W = w; st.Hh = h; st.dpr = dpr;
    for (const c of [$('#tkB'), $('#tkO')]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
    if (st.R) { st.R.layer = null; fitView(); }
  }
  function paintAll() {
    const b = $('#tkB'); if (!b) return;
    const bc = b.getContext('2d');
    if (st.R) st.R.draw(bc, st.W, st.Hh, st.view, st.dpr); else { bc.fillStyle = '#f4f5f7'; bc.fillRect(0, 0, b.width, b.height); }
    paintOverlay();
  }
  function paintOverlay() {
    const o = $('#tkO'); if (!o) return; const c = o.getContext('2d'), d = st.dpr; c.clearRect(0, 0, o.width, o.height);
    if (!st.sheet || !st.R) return;
    c.save(); c.scale(d, d); c.lineJoin = 'round'; c.lineCap = 'round'; c.font = '11px Arial';
    const poly = (pts, close) => { c.beginPath(); pts.forEach((p, i) => { const s = toScr(p); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }); if (close) c.closePath(); };
    for (const k of data().marks) {
      if (k.sheet !== st.sheet.id || k.off) continue;
      const col = varColor(k.var);
      if (k.kind === 'count') {
        const s = toScr(k.pts[0]); c.lineWidth = 2; c.strokeStyle = col; c.fillStyle = col + '33';
        c.beginPath();
        if (k.by === 'ai') { c.setLineDash([3, 2]); c.moveTo(s[0], s[1] - 8); c.lineTo(s[0] + 8, s[1]); c.lineTo(s[0], s[1] + 8); c.lineTo(s[0] - 8, s[1]); c.closePath(); }
        else if (k.by === 'tpl') { c.rect(s[0] - 7, s[1] - 7, 14, 14); } else { c.arc(s[0], s[1], 7, 0, 7); }
        c.fill(); c.stroke(); c.setLineDash([]);
      } else {
        c.lineWidth = 2.5; c.strokeStyle = col; c.fillStyle = col + '2a'; poly(k.pts, k.kind === 'area'); if (k.kind === 'area') c.fill(); c.stroke();
        const m = k.pts[Math.floor(k.pts.length / 2)], s = toScr(m), sc = st.sheet.scale || 0;
        const val = k.kind === 'len' ? TKC.polyLen(k.pts) * sc : TKC.polyArea(k.pts) * sc * sc;
        if (sc) { c.fillStyle = '#000'; c.fillText(val.toFixed(2) + (k.kind === 'len' ? ' م' : ' م²'), s[0] + 4, s[1] - 4); }
      }
    }
    if (st.draft.length) { c.lineWidth = 2; c.strokeStyle = varColor(st.varId); c.setLineDash([6, 4]); poly(st.draft, st.tool === 'area' && st.draft.length > 2); c.stroke(); c.setLineDash([]); st.draft.forEach(p => { const s = toScr(p); c.fillStyle = varColor(st.varId); c.fillRect(s[0] - 3, s[1] - 3, 6, 6); }); }
    if (st.cal.length) { c.lineWidth = 2; c.strokeStyle = '#e03131'; poly(st.cal, false); c.stroke(); st.cal.forEach(p => { const s = toScr(p); c.fillStyle = '#e03131'; c.fillRect(s[0] - 4, s[1] - 4, 8, 8); }); }
    if (st.rect) { const a = toScr(st.rect[0]), b = toScr(st.rect[1]); c.setLineDash([5, 3]); c.strokeStyle = '#0b7285'; c.lineWidth = 2; c.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); c.setLineDash([]); }
    if (st.cand) {
      const t = st.cand.thr; c.lineWidth = 2; c.strokeStyle = '#0b7285'; c.fillStyle = 'rgba(11,114,133,.15)';
      for (const m of st.cand.list) { if (m.score < t || (st.cand.excl && m.self)) continue; const a = toScr([m.x0, m.y0]), b = toScr([m.x1, m.y1]); const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), h = Math.abs(a[1] - b[1]); c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); }
    }
    c.restore();
  }
  TKU.redraw = redraw; TKU.paintOverlay = paintOverlay;

  function paintFoot() {
    const f = $('#tkFoot'); if (!f) return; const sh = st.sheet;
    if (!sh) { f.innerHTML = '<span class="muted">لا توجد ورقة مفتوحة</span>'; return; }
    const sc = sh.scale, src = sh.scaleSrc;
    const unitSel = sh.kind === 'cad' ? `<select id="tkUnit" aria-label="وحدة الرسم">${[['0.001', 'مليمتر'], ['0.01', 'سنتيمتر'], ['1', 'متر'], ['0.0254', 'بوصة'], ['0.3048', 'قدم']].map(u => `<option value="${u[0]}" ${Math.abs((sc || 0) - +u[0]) < 1e-9 ? 'selected' : ''}>وحدة الرسم: ${u[1]}</option>`).join('')}</select>` : '';
    const ratio = sh.kind === 'pdf' ? `<label class="fld-inline">المقياس 1:<input id="tkDen" type="number" min="1" step="1" style="width:90px" value="${sc ? Math.round(sc * 72 / 25.4 * 1000) : ''}" placeholder="مثال: 100"></label>` : '';
    f.innerHTML = `<span class="chip ${sc ? '' : 'warn'}">${sc ? (sh.kind === 'cad' ? 'وحدة الرسم معروفة' : 'المقياس معاير') + (src ? ' (' + esc(src) + ')' : '') : 'المقياس غير محدد — عاير الورقة قبل قياس الأطوال والمساحات'}</span>${unitSel}${ratio}<span class="muted" id="tkCoord" style="margin-inline-start:auto"></span>`;
  }
  TKU.paintFoot = paintFoot;

  /* ---------- stage interactions ---------- */
  function bindStage() {
    const stage = $('#tkStage');
    sizeStage(); new ResizeObserver(sizeStage).observe(stage);
    let drag = null;
    const pos = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    stage.addEventListener('wheel', e => {
      if (!st.R) return; e.preventDefault();
      const [sx, sy] = pos(e), k = Math.exp(-e.deltaY * 0.0015), p = toSheet(sx, sy);
      st.view.z = Math.max(1e-6, st.view.z * k); const q = toScr(p); st.view.x += sx - q[0]; st.view.y += sy - q[1]; redraw();
    }, { passive: false });
    stage.addEventListener('pointerdown', e => {
      if (!st.R || e.target.closest('.tk-cand,.tk-msg')) return;
      stage.setPointerCapture(e.pointerId); const [sx, sy] = pos(e);
      const panning = st.tool === 'pan' || e.button === 1 || st.space;
      drag = { sx, sy, x: st.view.x, y: st.view.y, moved: false, pan: panning, rect: st.tool === 'match' && !panning };
      if (drag.rect) st.rect = [toSheet(sx, sy), toSheet(sx, sy)];
    });
    stage.addEventListener('pointermove', e => {
      const [sx, sy] = pos(e);
      const co = $('#tkCoord'); if (co && st.R) { const p = toSheet(sx, sy), sc = st.sheet.scale; co.textContent = sc ? `X ${(p[0] * sc).toFixed(2)} م   Y ${(p[1] * sc).toFixed(2)} م` : ''; }
      if (!drag) { if ((st.tool === 'len' || st.tool === 'area' || st.tool === 'cal') && (st.draft.length || st.cal.length)) { st.hover = toSheet(sx, sy); } return; }
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
      if (drag.pan) { st.view.x = drag.x + sx - drag.sx; st.view.y = drag.y + sy - drag.sy; redraw(); }
      else if (drag.rect) { st.rect[1] = toSheet(sx, sy); paintOverlay(); }
    });
    stage.addEventListener('pointerup', e => {
      if (!drag) return; const d = drag; drag = null; const [sx, sy] = pos(e);
      if (d.pan && d.moved) return;
      if (d.rect) { const r = st.rect; st.rect = null; if (d.moved && Math.hypot(sx - d.sx, sy - d.sy) > 8) runMatch(r); else paintOverlay(); return; }
      if (!d.moved) click(toSheet(sx, sy), [sx, sy]);
    });
    stage.addEventListener('dblclick', e => { if (st.tool === 'len' || st.tool === 'area') { e.preventDefault(); finishPoly(true); } });
    document.addEventListener('keydown', keys); document.addEventListener('keyup', e => { if (e.code === 'Space') st.space = false; });
  }
  function keys(e) {
    if (!$('#tkStage')) { document.removeEventListener('keydown', keys); return; }
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if (e.code === 'Space') { st.space = true; e.preventDefault(); }
    else if (e.key === 'Escape') { st.draft = []; st.cal = []; st.rect = null; st.cand = null; hideCand(); paintOverlay(); }
    else if (e.key === 'Enter') finishPoly(false);
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  }
  function curVar() { return varById(st.varId); }
  function click(p, scr) {
    const sh = st.sheet; if (!sh) return;
    if (st.tool === 'cal') { st.cal.push(p); if (st.cal.length === 2) calibrate(); else paintOverlay(); return; }
    if (st.tool === 'del') { delAt(scr); return; }
    if (!['count', 'len', 'area'].includes(st.tool)) return;
    const v = curVar(); if (!v) { H().toast('أضف متغيراً واخترْه أولاً'); return; }
    if (v.kind !== st.tool) { H().toast(`المتغير «${v.name}» من نوع ${v.kind === 'count' ? 'عدد' : v.kind === 'len' ? 'طول' : 'مساحة'}، اختر الأداة المناسبة أو متغيراً آخر`); return; }
    if (st.tool === 'count') { addMark({ kind: 'count', pts: [p] }); return; }
    if ((st.tool === 'len' || st.tool === 'area') && !sh.scale) { H().toast('عاير الورقة أولاً (أداة «معايرة» أو أدخل المقياس)'); return; }
    st.draft.push(p); paintOverlay();
  }
  function addMark(m) { const k = { id: uid(), sheet: st.sheet.id, var: st.varId, by: 'man', ...m }; data().marks.push(k); st.undo.push([k.id]); markDirty(); paintOverlay(); }
  function finishPoly() {
    const need = st.tool === 'area' ? 3 : 2;
    if (st.draft.length >= need) { addMark({ kind: st.tool, pts: st.draft.slice() }); }
    st.draft = []; paintOverlay();
  }
  function undo() {
    if (st.draft.length) { st.draft.pop(); paintOverlay(); return; }
    const ids = st.undo.pop(); if (!ids) return;
    data().marks = data().marks.filter(m => !ids.includes(m.id)); markDirty(); paintOverlay();
  }
  function delAt(scr) {
    let best = null, bd = 12;
    for (const k of data().marks) {
      if (k.sheet !== st.sheet.id) continue;
      let d = 1e9;
      if (k.kind === 'count') { const s = toScr(k.pts[0]); d = Math.hypot(s[0] - scr[0], s[1] - scr[1]); }
      else for (let i = 1; i < k.pts.length; i++) { d = Math.min(d, segDist(scr, toScr(k.pts[i - 1]), toScr(k.pts[i]))); }
      if (d < bd) { bd = d; best = k; }
    }
    if (best) { data().marks = data().marks.filter(m => m !== best); markDirty(); paintOverlay(); }
  }
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };

  function calibrate() {
    const [a, b] = st.cal; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    H().modal(`<h3 style="margin-top:0">معايرة المقياس</h3><p class="muted">أدخل المسافة الحقيقية بين النقطتين اللتين حددتهما (مثلاً عرض ممر أو بُعد مكتوب على المخطط).</p>
      <div class="row"><input id="tkCalV" type="number" min="0" step="any" style="width:140px" autofocus><select id="tkCalU"><option value="1">متر</option><option value="0.01">سنتيمتر</option><option value="0.001" selected>مليمتر</option></select></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-tk="cal-cancel">إلغاء</button><button class="btn pri" type="button" data-tk="cal-ok" data-d="${d}">اعتماد</button></div>`);
  }
  function calOk(d) {
    const v = parseFloat($('#tkCalV').value), u = parseFloat($('#tkCalU').value);
    if (!(v > 0) || !(d > 0)) { H().toast('أدخل مسافة صحيحة'); return; }
    const sh = st.sheet; sh.scale = v * u / d; sh.scaleSrc = 'معايرة يدوية'; rescale(sh); st.cal = []; H().closeModal(); markDirty(); paintFoot(); paintOverlay(); H().toast('تمت المعايرة');
  }

  /* ---------- template matching ---------- */
  async function runMatch(rect) {
    const v = curVar(); if (!v || v.kind !== 'count') { H().toast('اختر متغيراً من نوع «عدد» قبل المطابقة'); return; }
    const R = st.R, b = R.bounds;
    showMsg('جارٍ تجهيز الورقة للبحث عن الرمز…');
    try {
      const snap = await R.snapshot(b, 2600); const cv = snap.canvas, k = snap.k;
      const ctx = cv.getContext('2d'); const id = ctx.getImageData(0, 0, cv.width, cv.height);
      const img = VIS.fromRGBA(id.data, cv.width, cv.height);
      const cx = x => (x - b[0]) * k, cy = y => (R.flip ? (b[3] - y) : (y - b[1])) * k;
      const x0 = Math.min(cx(rect[0][0]), cx(rect[1][0])), x1 = Math.max(cx(rect[0][0]), cx(rect[1][0])), y0 = Math.min(cy(rect[0][1]), cy(rect[1][1])), y1 = Math.max(cy(rect[0][1]), cy(rect[1][1]));
      if (x1 - x0 < 8 || y1 - y0 < 8) { showMsg(''); H().toast('الرمز صغير جداً، كبّر الورقة ثم حدّد الرمز'); return; }
      const tpl = VIS.crop(img, x0, y0, x1 - x0, y1 - y0);
      showMsg('جارٍ البحث عن الرمز في الورقة…');
      await new Promise(r => setTimeout(r, 30));
      const t0 = Date.now();
      const found = await VIS.findSymbols(img, tpl, { rotations: st.rot, minScore: 0.5 });
      const toS = (px, py) => [px / k + b[0], R.flip ? b[3] - py / k : py / k + b[1]];
      const tcx = (x0 + x1) / 2, tcy = (y0 + y1) / 2;
      const list = found.map(f => { const a = toS(f.x, f.y), c2 = toS(f.x + f.w, f.y + f.h); return { x0: a[0], y0: a[1], x1: c2[0], y1: c2[1], score: f.score, cx: (a[0] + c2[0]) / 2, cy: (a[1] + c2[1]) / 2, self: Math.abs(f.x + f.w / 2 - tcx) < f.w * 0.5 && Math.abs(f.y + f.h / 2 - tcy) < f.h * 0.5 }; });
      st.cand = { var: v.id, list, thr: 0.8, ms: Date.now() - t0, excl: true };
      showMsg(''); showCand(); paintOverlay();
    } catch (e) { console.error(e); showMsg(''); H().toast('تعذر البحث عن الرمز: ' + (e.message || e)); }
  }
  function showCand() {
    const c = $('#tkCand'); if (!c || !st.cand) return; const cd = st.cand;
    const n = cd.list.filter(m => m.score >= cd.thr && !(cd.excl && m.self)).length;
    c.hidden = false;
    c.innerHTML = `<b>نتيجة المطابقة: <span id="tkCn">${n}</span> رمز</b> <span class="muted" style="font-size:11px">(${esc((varById(cd.var) || {}).name)})</span>
      <label class="fld-inline">درجة التشابه <input id="tkThr" type="range" min="50" max="99" value="${Math.round(cd.thr * 100)}"><b id="tkThrV">${Math.round(cd.thr * 100)}%</b></label>
      <label class="chk" style="font-size:12px"><input id="tkSelf" type="checkbox" ${cd.excl ? 'checked' : ''}> استبعاد العينة نفسها (إن أخذتها من مفتاح الرموز)</label>
      <div class="row" style="gap:6px"><button class="btn sm pri" type="button" data-tk="cand-ok">اعتماد</button><button class="btn sm" type="button" data-tk="cand-no">إلغاء</button></div>
      <div class="muted" style="font-size:11px">ارفع الدرجة لتقليل التطابقات الخاطئة، وخفّضها إن فاتت رموز.</div>`;
  }
  function hideCand() { const c = $('#tkCand'); if (c) { c.hidden = true; c.innerHTML = ''; } }
  function candOk() {
    const cd = st.cand; if (!cd) return; const ids = [];
    const old = data().marks.filter(m => m.sheet === st.sheet.id && m.var === cd.var && m.by === 'tpl'); if (old.length && !confirm('يوجد ' + old.length + ' تطابق سابق لهذا المتغير في الورقة. استبدالها بالنتيجة الحالية؟')) return;
    data().marks = data().marks.filter(m => !(m.sheet === st.sheet.id && m.var === cd.var && m.by === 'tpl'));
    for (const m of cd.list) if (m.score >= cd.thr && !(cd.excl && m.self)) { const k = { id: uid(), sheet: st.sheet.id, var: cd.var, kind: 'count', by: 'tpl', pts: [[m.cx, m.cy]], sc: Math.round(m.score * 100) / 100 }; data().marks.push(k); ids.push(k.id); }
    st.undo.push(ids); st.cand = null; hideCand(); markDirty(); paintOverlay(); H().toast(`أُضيف ${ids.length} رمز إلى «${(varById(cd.var) || {}).name}»`);
  }

  /* ---------- AI suggestions ---------- */
  async function aiModal() {
    let status = { enabled: false }; try { status = await H().api('GET', '/takeoff-ai/status'); } catch (e) { /* ignore */ }
    if (!status.enabled) { H().modal(`<h3 style="margin-top:0">الاقتراح الذكي غير مفعّل</h3><p>لتفعيله أضف المتغير <b dir="ltr">ANTHROPIC_API_KEY</b> في إعدادات Vercel (Environment Variables) ثم أعد النشر. تُرسل إلى الخدمة صورة الورقة فقط ولا تُحفظ فيها.</p><div class="row" style="justify-content:flex-end"><button class="btn pri" type="button" data-tk="m-cancel">حسناً</button></div>`); return; }
    if (!st.R) { H().toast('افتح ورقة أولاً'); return; }
    const cv = vars().filter(v => v.kind === 'count');
    H().modal(`<h3 style="margin-top:0">اقتراح ذكي للحصر</h3>
      <p class="muted">يقرأ الذكاء الاصطناعي مفتاح الرموز (Legend) في الصورة ويقترح عدّ العناصر المحددة. النتيجة <b>اقتراح</b> تقارنه بالقياس اليدوي والمطابقة قبل اعتماده، وتُعرض بعلامات معينة متقطعة يمكن حذف الخاطئ منها.</p>
      <div class="fld"><span>المتغيرات المطلوب حصرها</span>${cv.map(v => `<label class="chk" style="display:flex;margin:3px 0"><input type="checkbox" name="tkai" value="${v.id}" ${v.id === st.varId ? 'checked' : ''}> ${esc(v.name)}</label>`).join('') || '<span class="muted">أضف متغيرات من نوع عدد</span>'}</div>
      <label class="fld"><span>دقة التحليل</span><select id="tkAiTiles"><option value="1">عادية (طلب واحد للورقة)</option><option value="4">عالية (تقسيم الورقة إلى 4 أجزاء)</option></select></label>
      <label class="fld"><span>ملاحظات للمحلل (اختياري)</span><textarea id="tkAiNote" rows="2" placeholder="مثال: الرمز الدائري الأحمر = كاشف دخان، تجاهل الطابق الأرضي"></textarea></label>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-tk="m-cancel">إلغاء</button><button class="btn pri" type="button" data-tk="ai-run">تشغيل</button></div>`);
  }
  async function aiRun() {
    const ids = $$('input[name=tkai]:checked').map(x => x.value); if (!ids.length) { H().toast('اختر متغيراً واحداً على الأقل'); return; }
    const tiles = +$('#tkAiTiles').value, note = $('#tkAiNote').value; H().closeModal();
    const R = st.R, b = R.bounds;
    const rects = []; if (tiles === 1) rects.push(b); else { const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2; rects.push([b[0], b[1], mx, my], [mx, b[1], b[2], my], [b[0], my, mx, b[3]], [mx, my, b[2], b[3]]); }
    const vs = ids.map(id => varById(id)).map(v => ({ id: v.id, name: v.name, hint: v.hint || '', kind: v.kind }));
    let added = 0; const warns = []; const byVar = {}; let legend = false, scaleText = '';
    data().marks = data().marks.filter(m => !(m.sheet === st.sheet.id && m.by === 'ai' && ids.includes(m.var)));
    for (let i = 0; i < rects.length; i++) {
      showMsg(`جارٍ التحليل الذكي… (${i + 1}/${rects.length}) قد يستغرق دقيقة`);
      try {
        const rc = rects[i]; const snap = await R.snapshot(rc, 1900);
        let url = snap.canvas.toDataURL('image/jpeg', 0.85); if (url.length > 3_600_000) url = snap.canvas.toDataURL('image/jpeg', 0.6);
        const r = await H().api('POST', '/takeoff-ai', { image: url, vars: vs, note });
        legend = legend || r.legend_found; scaleText = scaleText || r.scale_text; (r.warnings || []).forEach(w => warns.push(w));
        for (const it of r.items) for (const p of it.points) {
          const sx = rc[0] + p[0] * (rc[2] - rc[0]), sy = R.flip ? rc[3] - p[1] * (rc[3] - rc[1]) : rc[1] + p[1] * (rc[3] - rc[1]);
          data().marks.push({ id: uid(), sheet: st.sheet.id, var: it.var, kind: 'count', by: 'ai', pts: [[sx, sy]], sc: it.confidence }); added++; byVar[it.var] = (byVar[it.var] || 0) + 1;
        }
        // keep counts even when the model did not return coordinates
        for (const it of r.items) if (!it.points.length && it.count) { warns.push(`«${(varById(it.var) || {}).name}»: ${it.count} عنصر بدون إحداثيات (لم تُرسم)`); }
      } catch (e) { H().fail(e); break; }
    }
    showMsg(''); markDirty(); paintOverlay();
    H().modal(`<h3 style="margin-top:0">نتيجة الاقتراح الذكي</h3><p>أُضيفت <b>${added}</b> علامة مقترحة (معيّنة متقطعة). ${legend ? 'عُثر على مفتاح رموز في الصورة.' : 'لم يُعثر على مفتاح رموز واضح، فالاعتماد على الرموز القياسية.'} ${scaleText ? 'نص المقياس المقروء: <b dir="ltr">' + esc(scaleText) + '</b>' : ''}</p>
      <table class="t"><tbody>${Object.entries(byVar).map(([k, n]) => `<tr><td>${esc((varById(k) || {}).name)}</td><td>${n}</td></tr>`).join('')}</tbody></table>
      ${warns.length ? '<ul class="muted">' + warns.slice(0, 8).map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : ''}
      <p class="muted">قارن العدد في تبويب «النتائج والمقارنة» مع القياس اليدوي أو المطابقة، ثم اعتمد الأدق لكل بند.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn pri" type="button" data-tk="m-cancel">حسناً</button></div>`);
    TKU.renderSide();
  }

  /* ---------- layers popup ---------- */
  function layersModal() {
    const R = st.R; if (!R || !R.layers) { H().toast('الطبقات متاحة لملفات AutoCAD فقط'); return; }
    H().modal(`<h3 style="margin-top:0">طبقات الرسم</h3><div class="tablewrap" style="max-height:55vh"><table class="t"><thead><tr><th style="width:50px">إظهار</th><th>الطبقة</th><th>الطول (وحدة الرسم)</th></tr></thead><tbody>${R.layers.map((l, i) => `<tr><td><input type="checkbox" data-tk="layer" data-i="${i}" ${l.hidden ? '' : 'checked'}></td><td><span style="display:inline-block;width:12px;height:12px;background:${l.color};margin-inline-end:6px;border:1px solid #888"></span>${esc(l.name)}</td><td>${Math.round(l.len * 100) / 100}</td></tr>`).join('')}</tbody></table></div><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn pri" type="button" data-tk="m-cancel">إغلاق</button></div>`);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-tk]'); if (!b || !H()) return;
    const a = b.dataset.tk;
    switch (a) {
      case 'new': newModal(); break;
      case 'm-cancel': H().closeModal(); break;
      case 'm-create': createTakeoff(); break;
      case 'open': e.preventDefault(); openTk(b.closest('tr').dataset.id); break;
      case 'del': { const tr = b.closest('tr'); if (!confirm('حذف ملف الحصر نهائياً؟ (لا يؤثر على عروض الأسعار)')) break; try { await H().api('DELETE', '/takeoffs/' + tr.dataset.id); mount(); } catch (er) { H().fail(er); } break; }
      case 'back': await save(); mount(); break;
      case 'tool': st.tool = b.dataset.t; st.draft = []; st.cal = []; st.rect = null; $$('.tl').forEach(x => x.classList.toggle('on', x.dataset.t === st.tool)); paintOverlay();
        if (st.tool === 'cal') H().toast('حدّد نقطتين على المخطط تعرف المسافة الحقيقية بينهما'); if (st.tool === 'match') H().toast('ارسم مستطيلاً حول رمز واحد (من مفتاح الرموز أو من الرسم)'); break;
      case 'fit': fitView(); break;
      case 'msg-close': showMsg(''); break;
      case 'undo': undo(); break;
      case 'ai': aiModal(); break;
      case 'ai-run': aiRun(); break;
      case 'layers': layersModal(); break;
      case 'layer': { const l = st.R.layers[+b.dataset.i]; l.hidden = !b.checked; redraw(); break; }
      case 'cal-cancel': st.cal = []; H().closeModal(); paintOverlay(); break;
      case 'cal-ok': calOk(+b.dataset.d); break;
      case 'cand-ok': candOk(); break;
      case 'cand-no': st.cand = null; hideCand(); paintOverlay(); break;
      case 'push': TKU.pushModal && TKU.pushModal(); break;
      default: TKU.onClick && TKU.onClick(a, b, e);
    }
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!H() || !st.tk || !$('#tkStage')) return;
    if (t.id === 'tkFiles') { addFiles([...t.files]); t.value = ''; }
    else if (t.id === 'tkReup') { const f = t.files[0], fid = t.dataset.fid, rec = data().files.find(x => x.id === fid); if (f && rec) f.arrayBuffer().then(async buf => { await V.fileStore.put(st.tk.id + '/' + fid, buf); delete st.files[fid]; activate(st.sheet.id); }); }
    else if (t.id === 'tkSheet') activate(t.value);
    else if (t.id === 'tkVar') { st.varId = t.value; const v = curVar(); if (v && ['count', 'len', 'area'].includes(st.tool) && st.tool !== v.kind) { st.tool = v.kind; $$('.tl').forEach(x => x.classList.toggle('on', x.dataset.t === st.tool)); } paintOverlay(); }
    else if (t.id === 'tkRot') st.rot = t.checked;
    else if (t.id === 'tkSelf' && st.cand) { st.cand.excl = t.checked; $('#tkCn').textContent = st.cand.list.filter(m => m.score >= st.cand.thr && !(st.cand.excl && m.self)).length; paintOverlay(); }
    else if (t.id === 'tkName') { st.tk.name = t.value; markDirty(); }
    else if (t.id === 'tkQuote') { st.tk.quoteId = t.value; markDirty(); }
    else if (t.id === 'tkUnit') { st.sheet.scale = +t.value; st.sheet.scaleSrc = 'اختيار يدوي'; rescale(st.sheet); markDirty(); paintFoot(); }
    else if (t.id === 'tkDen') { const d = +t.value; if (d > 0) { st.sheet.scale = 25.4 / 72 / 1000 * d; st.sheet.scaleSrc = 'مقياس 1:' + d; rescale(st.sheet); markDirty(); paintFoot(); } }
    else TKU.onChange && TKU.onChange(t, e);
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!H() || !st.tk || !$('#tkStage')) return;
    if (t.id === 'tkThr' && st.cand) { st.cand.thr = t.value / 100; $('#tkThrV').textContent = t.value + '%'; $('#tkCn').textContent = st.cand.list.filter(m => m.score >= st.cand.thr && !(st.cand.excl && m.self)).length; paintOverlay(); }
    else TKU.onInput && TKU.onInput(t, e);
  });
  TKU.activate = activate; TKU.autoMeasure = autoMeasure;
  TKU.hl = (hl) => { if (st.R && st.R.kind === 'cad') { st.R.hl = hl; redraw(); } };
})();
