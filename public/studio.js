/* Template studio: design the printed documents (colours, fonts, header, tables, sections, labels, page) with a live preview.
   The original template is built in and read-only; every other template is a copy that can be changed freely. */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var st = { sel: '', kind: 'quote', open: { colors: 1 } };
  var S = function () { return H.S(); };
  var list = function () { var s = S().settings; if (!s.templates) s.templates = []; if (!s.fonts) s.fonts = []; if (!s.tplDef) s.tplDef = { quote: '', contract: '', receipt: '' }; return s.templates; };
  var cur = function () { return list().filter(function (t) { return t.id === st.sel; })[0] || null; };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  var PRESETS = [
    ['رسس الكلاسيكي', { navy: '#17365D', light: '#D9EAF7', head: '#A6C9EC', band: '#DAE9F8', band2: '#EEF5FA', accent: '#2E6DA4', red: '#C00000', text: '#000000', line: '#000000' }],
    ['زمردي', { navy: '#0B5D4B', light: '#DDF1EA', head: '#A8D8C8', band: '#E6F4EE', band2: '#F3FAF7', accent: '#1B7F67', red: '#B42318', text: '#111111', line: '#1F2937' }],
    ['عنابي', { navy: '#6B1D2A', light: '#F6E4E7', head: '#E3B7BE', band: '#F8EBED', band2: '#FCF5F6', accent: '#9B2C3F', red: '#B42318', text: '#111111', line: '#3F3F46' }],
    ['رمادي أنيق', { navy: '#2B2F36', light: '#ECEEF1', head: '#CBD0D8', band: '#F1F3F5', band2: '#F8F9FA', accent: '#4B5563', red: '#B42318', text: '#111111', line: '#6B7280' }],
    ['ذهبي ملكي', { navy: '#1F2A44', light: '#F6EFD9', head: '#E2CF98', band: '#FAF5E4', band2: '#FDFAF0', accent: '#A67C00', red: '#9C1C1C', text: '#111111', line: '#4B5563' }],
    ['بترولي', { navy: '#0E4A5C', light: '#DCEEF3', head: '#A9D3DF', band: '#E4F2F6', band2: '#F2F9FB', accent: '#127A94', red: '#B42318', text: '#0B1F26', line: '#1F2937' }]
  ];
  var COLORS = [['navy', 'العناوين والأشرطة الرئيسية'], ['light', 'الشريط الفاتح'], ['head', 'رأس الجدول'], ['band', 'تظليل الصفوف'], ['band2', 'تظليل الإجماليات'], ['accent', 'لون التمييز'], ['red', 'لون التنبيه'], ['text', 'لون النص'], ['line', 'لون الحدود']];
  var SECT = { quote: { meta: 'بيانات العرض', thanks: 'عبارة الشكر', items: 'جدول البنود', summary: 'الإجماليات', foot2: 'الشروط والاعتماد والتوقيع' }, contract: { meta: 'بيانات العقد', intro: 'التمهيد', items: 'جدول البنود', summary: 'الإجماليات', pay: 'جدول الدفعات', paynote: 'ملاحظة الدفعات', terms: 'الشروط العامة', closing: 'الخاتمة', sigs: 'التوقيعات' } };
  var SHOWS = [['thanks', 'عبارة الشكر'], ['brandBar', 'الشريط العريض باسم الشركة'], ['terms', 'الشروط والملاحظات (العرض)'], ['approval', 'مربع اعتماد العميل (العرض)'], ['prep', 'خانة إعداد العرض والختم (العرض)'], ['stamp', 'الختم'], ['words', 'المبلغ كتابةً (العقد)'], ['footer', 'تذييل الصفحة']];
  var HEADS = [['classic', 'كلاسيكي (الأصلي)'], ['center', 'شعار في المنتصف'], ['minimal', 'مبسّط بخط سفلي'], ['band', 'شريط ملوّن']];

  function newTpl(base, name) {
    var t = clone(R.TPL0); t.id = H.uid(); t.name = name || 'قالب جديد'; delete t.__rt; delete t.custom;
    if (base) { var b = clone(base); b.id = t.id; b.name = name || (base.name + ' (نسخة)'); t = b; }
    return t;
  }
  function fontOpts(sel, s) {
    var o = Object.keys(R.FONTS).map(function (k) { return '<option value="' + k + '" ' + (sel === k ? 'selected' : '') + '>' + esc(R.FONTS[k].n) + '</option>'; });
    (s.fonts || []).forEach(function (f) { o.push('<option value="c:' + f.id + '" ' + (sel === 'c:' + f.id ? 'selected' : '') + '>' + esc(f.name) + ' (خطك الخاص)</option>'); });
    return o.join('');
  }
  var sw = function (k, t) { return '<div class="stu-chip" style="background:' + t.theme[k] + '"></div>'; };

  function mount() {
    var s = S().settings; list();
    if (st.sel && !cur()) st.sel = '';
    var t = cur(), ro = !t, rtpl = R.resolveTpl(t || null);
    var def = s.tplDef;
    var cards = '<button type="button" class="stu-card ' + (!st.sel ? 'on' : '') + '" data-st="pick" data-id=""><b>القالب الأصلي</b><span class="muted">مقفل، كما صُمّم أصلاً</span><div class="stu-chips">' + ['navy', 'light', 'head', 'band'].map(function (k) { return sw(k, R.resolveTpl(null)); }).join('') + '</div>' + badge('', def) + '</button>' +
      list().map(function (x) { var r = R.resolveTpl(x); return '<button type="button" class="stu-card ' + (st.sel === x.id ? 'on' : '') + '" data-st="pick" data-id="' + x.id + '"><b>' + esc(x.name) + '</b><span class="muted">' + (x.paper === 'a4' ? 'A4' : 'Letter') + ' · ' + esc((R.FONTS[x.font.body] || { n: 'خط خاص' }).n.split(' ')[0]) + '</span><div class="stu-chips">' + ['navy', 'light', 'head', 'band'].map(function (k) { return sw(k, r); }).join('') + '</div>' + badge(x.id, def) + '</button>'; }).join('') +
      '<button type="button" class="stu-card add" data-st="new"><b>＋ قالب جديد</b><span class="muted">يبدأ من نسخة الأصلي</span></button>';
    H.main.innerHTML = '<div class="title-row"><h1>استوديو القوالب</h1><div class="sp"></div><label class="btn sm" style="cursor:pointer">استيراد قالب<input type="file" id="stuImp" accept=".json,application/json" hidden></label></div>' +
      '<p class="muted" style="margin:0 0 12px">صمّم شكل المطبوعات بالكامل: الألوان والخطوط والترويسة والجداول وترتيب الأقسام والمسميات. القالب الأصلي محفوظ كما هو دائماً، وكل قالب جديد نسخة مستقلة تعدّلها كما تشاء.</p>' +
      '<div class="stu-cards">' + cards + '</div>' +
      '<div class="split stu"><section id="stuCtl">' + (ro ? orig() : controls(t, s)) + '</section><aside class="pv"><div class="bar"><div class="tabs2" style="margin:0;border:0">' + [['quote', 'عرض سعر'], ['contract', 'عقد'], ['receipt', 'سند قبض']].map(function (k) { return '<button type="button" class="tab ' + (st.kind === k[0] ? 'on' : '') + '" data-st="kind" data-k="' + k[0] + '">' + k[1] + '</button>'; }).join('') + '</div><span>معاينة حية</span></div><div class="pv-wrap"><div class="sheet" id="sheet"></div></div></aside></div>';
    bind(); preview();
    $('#stuImp').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) importTpl(f); e.target.value = ''; });
  }
  function badge(id, def) { var b = []; ['quote', 'contract', 'receipt'].forEach(function (k) { if ((def[k] || '') === id) b.push({ quote: 'العروض', contract: 'العقود', receipt: 'السندات' }[k]); }); return b.length ? '<div class="stu-def">افتراضي: ' + b.join('، ') + '</div>' : ''; }
  function orig() {
    var s = S().settings, def = s.tplDef;
    return '<div class="card"><h3>القالب الأصلي</h3><p class="muted" style="margin-top:0">هذا هو التصميم المطابق للملفات الأصلية (الألوان والخط والترويسة). لا يمكن تعديله حتى يبقى مرجعاً ثابتاً. لإنشاء تصميم خاص بك اضغط «قالب جديد» لتبدأ من نسخة منه.</p>' +
      '<div class="row"><button class="btn pri" type="button" data-st="new">إنشاء قالب من الأصلي</button></div>' +
      '<div class="note" style="margin-top:12px">القالب الافتراضي الحالي: العروض ← ' + esc(nm(def.quote)) + ' · العقود ← ' + esc(nm(def.contract)) + ' · السندات والتقارير ← ' + esc(nm(def.receipt)) + '</div></div>' + defCard('');
  }
  function nm(id) { if (!id) return 'الأصلي'; var t = list().filter(function (x) { return x.id === id; })[0]; return t ? t.name : 'الأصلي'; }
  function defCard(id) {
    var d = S().settings.tplDef;
    return '<div class="card"><h3>تعيين كقالب افتراضي</h3><p class="muted" style="margin-top:0">يُستخدم تلقائياً في المستندات الجديدة والقديمة التي لم يُحدَّد لها قالب. ويمكن تغييره لكل عرض أو عقد من شاشته.</p><div class="row">' +
      [['quote', 'العروض'], ['contract', 'العقود'], ['receipt', 'السندات والكشوف والتقارير']].map(function (k) { var on = (d[k[0]] || '') === id; return '<button type="button" class="btn sm ' + (on ? 'pri' : '') + '" data-st="def" data-k="' + k[0] + '" data-id="' + id + '">' + (on ? '✓ ' : '') + k[1] + '</button>'; }).join('') + '</div></div>';
  }

  function colorRow(t) {
    return '<div class="stu-colors">' + COLORS.map(function (c) {
      return '<label class="stu-col"><span>' + c[1] + '</span><span class="row" style="flex-wrap:nowrap"><input type="color" data-st="c" data-k="' + c[0] + '" value="' + t.theme[c[0]] + '"><input class="ltr" data-st="ch" data-k="' + c[0] + '" value="' + t.theme[c[0]] + '" maxlength="7" style="width:92px"></span></label>';
    }).join('') + '</div><div class="row" style="margin-top:10px"><span class="muted" style="font-size:12px">ألوان جاهزة:</span>' + PRESETS.map(function (p, i) { return '<button type="button" class="btn sm" data-st="preset" data-i="' + i + '"><span class="stu-dot" style="background:' + p[1].navy + '"></span>' + p[0] + '</button>'; }).join('') + '</div>';
  }
  function orderList(t, kind) {
    var ord = R.resolveTpl(t).order[kind];
    return '<ol class="stu-ord">' + ord.map(function (k, i) { return '<li><span>' + SECT[kind][k] + '</span><span><button type="button" class="ib" data-st="mv" data-kind="' + kind + '" data-i="' + i + '" data-d="-1" aria-label="للأعلى">▲</button><button type="button" class="ib" data-st="mv" data-kind="' + kind + '" data-i="' + i + '" data-d="1" aria-label="للأسفل">▼</button></span></li>'; }).join('') + '</ol>';
  }
  function labelsEditor(t) {
    var groups = {}, order = [];
    Object.keys(R.LABELS).forEach(function (k) { var g = R.LABELS[k][1]; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(k); });
    return order.map(function (g) {
      return '<div class="stu-lg"><b>' + g + '</b><div class="grid g2">' + groups[g].map(function (k) { return '<label class="fld"><span>' + esc(R.LABELS[k][0]) + '</span><input data-st="lb" data-k="' + k + '" value="' + esc(t.labels[k] || '') + '" placeholder="' + esc(R.LABELS[k][0]) + '"></label>'; }).join('') + '</div></div>';
    }).join('') + '<label class="fld" style="margin-top:8px"><span>نص الشريط العريض (بدل اسم الشركة بالإنجليزية)</span><input data-st="lb" data-k="brandBar" value="' + esc(t.labels.brandBar || '') + '" placeholder="' + esc(S().settings.brandEn) + '" class="ltr"></label>';
  }
  function sec(id, title, body) { return '<details class="card stu-sec" ' + (st.open[id] ? 'open' : '') + ' data-sec="' + id + '"><summary>' + title + '</summary><div class="stu-body">' + body + '</div></details>'; }
  function controls(t, s) {
    var r = R.resolveTpl(t);
    var rg = function (k, a, b, stp, v, extra) { return '<label class="fld"><span>' + extra + ' <b data-val="' + k + '">' + v + '</b></span><input type="range" data-st="rg" data-k="' + k + '" min="' + a + '" max="' + b + '" step="' + stp + '" value="' + v + '"></label>'; };
    var sel = function (k, opts, v) { return '<select data-st="sel" data-k="' + k + '">' + opts.map(function (o) { return '<option value="' + o[0] + '" ' + (v === o[0] ? 'selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };
    var cb = function (k, lbl, v) { return '<label class="row"><input type="checkbox" data-st="cb" data-k="' + k + '" ' + (v ? 'checked' : '') + ' style="width:auto"> ' + lbl + '</label>'; };
    var fonts = (s.fonts || []).map(function (f) { return '<div class="row" style="justify-content:space-between"><span style="font-family:\'RASSF_' + f.id + '\'">' + esc(f.name) + ' — عرض سعر 1234 Quote</span><button class="btn sm danger" type="button" data-st="fdel" data-id="' + f.id + '">حذف</button></div>'; }).join('');
    return '<div class="card"><div class="grid g2"><label class="fld"><span>اسم القالب</span><input data-st="name" value="' + esc(t.name) + '"></label><label class="fld"><span>مقاس الورق</span>' + sel('paper', [['letter', 'Letter (الأصلي)'], ['a4', 'A4']], r.paper) + '</label></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn sm" type="button" data-st="dup">تكرار</button><button class="btn sm" type="button" data-st="exp">تصدير JSON</button><button class="btn sm danger" type="button" data-st="del">حذف القالب</button></div></div>' +
      defCard(t.id) +
      sec('colors', 'الألوان', colorRow(r)) +
      sec('fonts', 'الخطوط', '<div class="grid g2"><label class="fld"><span>خط النص</span><select data-st="font" data-k="body">' + fontOpts(r.font.body, s) + '</select></label><label class="fld"><span>خط العناوين والأشرطة</span><select data-st="font" data-k="head">' + fontOpts(r.font.head, s) + '</select></label></div>' +
        rg('font.scale', 0.8, 1.3, 0.05, r.font.scale, 'حجم الخط العام (×)') +
        '<div class="stu-sample" id="fsamp">عرض سعر رقم 26-125 · توريد وتركيب نظام الإنذار · 12,345.67 ر.س — Quotation No. 26-125</div>' +
        '<div class="stu-lg"><b>خط خاص بالشركة</b><p class="muted" style="margin:0 0 8px;font-size:12px">ارفع ملف الخط (TTF أو OTF أو WOFF أو WOFF2، حتى 1.2 ميجابايت). يُحفظ مع إعداداتك ويُستخدم في الطباعة والمعاينة على كل الأجهزة.</p>' + fonts +
        '<div class="row"><label class="btn sm" style="cursor:pointer">رفع خط<input type="file" id="fontUp" accept=".ttf,.otf,.woff,.woff2" hidden></label></div></div>') +
      sec('head', 'الترويسة والأشرطة', '<div class="grid g2"><label class="fld"><span>شكل الترويسة</span>' + sel('head.style', HEADS, r.head.style) + '</label><label class="fld"><span>شكل الشريط العريض</span>' + sel('bar', [['solid', 'ممتلئ (الأصلي)'], ['line', 'خط سفلي'], ['none', 'بدون']], r.bar) + '</label></div>' +
        rg('head.logoH', 10, 45, 1, r.head.logoH, 'ارتفاع الشعار (مم)') + '<label class="fld"><span>سطر إضافي أسفل الترويسة (عنوان، فرع…)</span><input data-st="tx" data-k="head.note" value="' + esc(t.head ? t.head.note : '') + '"></label>' +
        '<label class="fld" style="margin-top:10px"><span>سطر إضافي في التذييل</span><input data-st="tx" data-k="footNote" value="' + esc(t.footNote || '') + '"></label>') +
      sec('table', 'الجداول', '<div class="grid g2"><label class="fld"><span>نمط الحدود</span>' + sel('table.border', [['thin', 'رفيعة (الأصلي)'], ['soft', 'ناعمة'], ['bold', 'عريضة'], ['none', 'أفقية فقط']], r.table.border) + '</label><label class="fld"><span>نمط عنوان القسم</span>' + sel('table.group', [['solid', 'ممتلئ (الأصلي)'], ['tint', 'فاتح'], ['line', 'خط سفلي']], r.table.group) + '</label></div>' +
        '<div class="row" style="margin-top:10px">' + cb('table.zebra', 'تظليل الصفوف بالتناوب', r.table.zebra) + cb('table.cols.no', 'عمود الرقم', r.table.cols.no) + cb('table.cols.brand', 'عمود النوع', r.table.cols.brand) + cb('table.cols.unit', 'عمود الوحدة', r.table.cols.unit) + '</div>') +
      sec('sections', 'الأقسام وترتيبها', '<div class="grid g2"><div><b>ترتيب أقسام عرض السعر</b>' + orderList(t, 'quote') + '</div><div><b>ترتيب أقسام العقد</b>' + orderList(t, 'contract') + '</div></div>' +
        '<div class="stu-lg"><b>إظهار / إخفاء</b><div class="grid g2">' + SHOWS.map(function (x) { return cb('show.' + x[0], x[1], r.show[x[0]] !== false); }).join('') + '</div></div>') +
      sec('labels', 'المسميات والعناوين', '<p class="muted" style="margin-top:0;font-size:12px">اترك الحقل فارغاً لاستخدام العنوان الأصلي. مثلاً: غيّر «عرض سعر» إلى «عرض فني ومالي»، أو احذف الجزء الإنجليزي لتصبح المطبوعات عربية بالكامل.</p>' + labelsEditor(t)) +
      sec('page', 'الصفحة والعلامة المائية', '<div class="grid g2">' + rg('margin.top', 0, 30, 1, r.margin.top, 'الهامش العلوي (مم)') + rg('margin.side', 0, 30, 1, r.margin.side, 'الهامش الجانبي (مم)') + '</div><label class="fld"><span>علامة مائية مائلة (مثل: مسودة، نسخة للعميل)</span><input data-st="tx" data-k="watermark" value="' + esc(t.watermark || '') + '"></label>');
  }

  /* ---------- preview ---------- */
  function sampleQuote() {
    var q = H.curQ();
    if (q && q.lines.length) return clone(q);
    var g = ['توريد وتركيب نظام الإنذار', 'توريد وتركيب نظام الإطفاء ومكافحة الحريق'], lines = [];
    g.forEach(function (gr, gi) { for (var i = 0; i < 4; i++) lines.push({ id: 's' + gi + i, group: gr, desc: i % 2 ? 'كاشف دخان غير معنون شامل تمديد مواسير وأسلاك' : 'لوحة إنذار غير معنونة 4 زون - شامل المواسير والأسلاك', brand: i % 2 ? 'Falcon' : '', unit: 'NO', qty: 4 + i * 3, price: 135 + i * 215 }); });
    return { no: '26-125', date: R.today(), client: 'شركة المثال للتطوير', project: 'مجمع المثال السكني', location: 'الرياض', validity: 30, status: 'draft', preparedBy: S().settings.preparedBy, lines: lines, discMode: 'pct', discPct: 5, discAmt: 0, vatRate: 15, notes: S().settings.notes };
  }
  function preview() {
    var s = S().settings, t = cur(), tp = R.resolveTpl(t || null), q = sampleQuote(), h = '';
    if (st.kind === 'quote') h = R.quoteDoc(s, q, tp);
    else if (st.kind === 'contract') { var k = q.contract || { date: R.today(), party2: q.client, duration: 30, override: '', items: true, stamp: true, intro: s.cintro, terms: s.cterms, paynote: s.cpaynote, close: s.cclose, payments: s.pay.map(function (p) { return { id: p.id, label: p.label, pct: p.pct, due: '' }; }) }; q.contract = k; h = R.contractDoc(s, q, tp); }
    else h = H.receiptDoc({ id: 'x', no: 'RC-26-001', date: R.today(), custId: q.custId || '', qid: '', amount: 12345.67, method: 'تحويل بنكي', ref: '', notes: 'دفعة مستلمة', void: false }, tp);
    var sh = $('#sheet'); if (!sh) return; sh.innerHTML = h; var w = $('.pv-wrap'); if (w) sh.style.zoom = Math.min(1, (w.clientWidth - 24) / 816);
    H.syncFonts();
  }

  /* ---------- editing ---------- */
  function setPath(o, p, v) { var a = p.split('.'), x = o; for (var i = 0; i < a.length - 1; i++) { if (!x[a[i]] || typeof x[a[i]] !== 'object') x[a[i]] = {}; x = x[a[i]]; } x[a[a.length - 1]] = v; }
  function touch() { H.saveS(); preview(); }
  function bind() {
    var root = H.main;
    root.onclick = function (e) {
      var b = e.target.closest('[data-st]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
      var a = b.dataset.st, t = cur(), s = S().settings;
      if (a === 'pick') { st.sel = b.dataset.id; mount(); }
      else if (a === 'new') { var n = newTpl(t || null, t ? undefined : 'قالب جديد'); list().push(n); st.sel = n.id; H.saveS(); mount(); H.toast('أُنشئ القالب، عدّل ما تشاء'); }
      else if (a === 'dup' && t) { var d = newTpl(t); list().push(d); st.sel = d.id; H.saveS(); mount(); }
      else if (a === 'del' && t) { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'تأكيد الحذف'; setTimeout(function () { if (b.isConnected) { b.classList.remove('armed'); b.textContent = 'حذف القالب'; } }, 3000); return; } s.templates = list().filter(function (x) { return x.id !== t.id; }); ['quote', 'contract', 'receipt'].forEach(function (k) { if (s.tplDef[k] === t.id) s.tplDef[k] = ''; }); H.S().quotes.forEach(function (q) { if (q.tpl === t.id) q.tpl = ''; if (q.contract && q.contract.tpl === t.id) q.contract.tpl = ''; }); st.sel = ''; H.saveS(); mount(); }
      else if (a === 'def') { var id = b.dataset.id; s.tplDef[b.dataset.k] = id; H.saveS(); mount(); H.toast('تم تعيين القالب الافتراضي'); }
      else if (a === 'kind') { st.kind = b.dataset.k; $$('[data-st=kind]').forEach(function (x) { x.classList.toggle('on', x === b); }); preview(); }
      else if (a === 'preset' && t) { Object.assign(t.theme, PRESETS[+b.dataset.i][1]); H.saveS(); st.open.colors = 1; mount(); }
      else if (a === 'mv' && t) { var o = R.resolveTpl(t).order[b.dataset.kind].slice(), i = +b.dataset.i, j = i + +b.dataset.d; if (j < 0 || j >= o.length) return; var x = o[i]; o[i] = o[j]; o[j] = x; if (!t.order) t.order = {}; t.order[b.dataset.kind] = o; H.saveS(); st.open.sections = 1; mount(); }
      else if (a === 'fdel' && t) { var fid = 'c:' + b.dataset.id; s.fonts = (s.fonts || []).filter(function (f) { return f.id !== b.dataset.id; }); list().forEach(function (x) { if (x.font && x.font.body === fid) x.font.body = 'classic'; if (x.font && x.font.head === fid) x.font.head = 'classic'; }); H.saveS(); st.open.fonts = 1; mount(); }
      else if (a === 'exp' && t) { var blob = new Blob([JSON.stringify(Object.assign({ rassTemplate: 1 }, t), null, 2)], { type: 'application/json' }), l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'template-' + t.name.replace(/[^\w؀-ۿ-]+/g, '_') + '.json'; l.click(); setTimeout(function () { URL.revokeObjectURL(l.href); }, 2000); }
    };
    root.oninput = function (e) {
      var el = e.target, a = el.dataset.st, t = cur(); if (!a || !t) return;
      if (a === 'name') { t.name = el.value; H.saveS(); return; }
      if (a === 'c') { t.theme[el.dataset.k] = el.value; var tx = $('[data-st=ch][data-k=' + el.dataset.k + ']'); if (tx) tx.value = el.value; touch(); }
      else if (a === 'ch') { if (/^#[0-9a-fA-F]{6}$/.test(el.value)) { t.theme[el.dataset.k] = el.value; var cp = $('[data-st=c][data-k=' + el.dataset.k + ']'); if (cp) cp.value = el.value; touch(); } }
      else if (a === 'rg') { var v = parseFloat(el.value); setPath(t, el.dataset.k, v); var lb = $('[data-val="' + el.dataset.k + '"]'); if (lb) lb.textContent = v; touch(); }
      else if (a === 'tx') { setPath(t, el.dataset.k, el.value); touch(); }
      else if (a === 'lb') { if (!t.labels) t.labels = {}; if (el.value.trim()) t.labels[el.dataset.k] = el.value; else delete t.labels[el.dataset.k]; touch(); }
    };
    root.onchange = function (e) {
      var el = e.target, a = el.dataset.st, t = cur(); if (!a || !t) return;
      if (a === 'sel') { setPath(t, el.dataset.k, el.value); touch(); }
      else if (a === 'font') { setPath(t, 'font.' + el.dataset.k, el.value); touch(); var fs = $('#fsamp'); if (fs) fs.style.fontFamily = R.fontStack(R.resolveTpl(t).font.body, S().settings); }
      else if (a === 'cb') { setPath(t, el.dataset.k, el.checked); touch(); }
    };
    $$('details.stu-sec', root).forEach(function (d) { d.addEventListener('toggle', function () { st.open[d.dataset.sec] = d.open ? 1 : 0; }); });
    var fu = $('#fontUp'); if (fu) fu.addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) addFont(f); });
    var fs = $('#fsamp'); if (fs && cur()) fs.style.fontFamily = R.fontStack(R.resolveTpl(cur()).font.body, S().settings);
  }
  function addFont(file) {
    var s = S().settings, ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [])[1] || '';
    if (!/^(ttf|otf|woff2?)$/i.test(ext)) return H.toast('صيغة الخط غير مدعومة، استخدم TTF أو OTF أو WOFF');
    if (file.size > 1.2 * 1024 * 1024) return H.toast('حجم الخط كبير، الحد 1.2 ميجابايت');
    if ((s.fonts || []).length >= 4) return H.toast('الحد الأقصى 4 خطوط خاصة');
    var rd = new FileReader();
    rd.onload = function () {
      var mime = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext.toLowerCase()], b64 = String(rd.result).split(',')[1] || '';
      var f = { id: H.uid().slice(0, 10), name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), data: 'data:' + mime + ';base64,' + b64 };
      s.fonts.push(f); H.syncFonts();
      var t = cur(); if (t) t.font.body = 'c:' + f.id;
      H.saveS(); st.open.fonts = 1; mount(); H.toast('أُضيف الخط واستُخدم كخط للنص');
    };
    rd.readAsDataURL(file);
  }
  function importTpl(file) {
    var rd = new FileReader();
    rd.onload = function () {
      try { var o = JSON.parse(rd.result); if (!o || !o.rassTemplate) throw 0; delete o.rassTemplate; o.id = H.uid(); o.name = (o.name || 'قالب') + ' (مستورد)'; list().push(o); st.sel = o.id; H.saveS(); mount(); H.toast('تم استيراد القالب'); }
      catch (e) { H.toast('الملف ليس قالباً صالحاً'); }
    };
    rd.readAsText(file);
  }
  window.STU = { mount: mount };
})();
