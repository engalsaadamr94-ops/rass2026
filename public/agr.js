/* Agreements: contracts, subcontracts, supply, maintenance, NDA, addenda and handover minutes built from an editable clause library. */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc, n0 = R.n0, r2 = R.r2, fmt = R.fmt, fmtDate = R.fmtDate, norm = R.norm;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var S = function () { return H.S(); };
  var st = { list: null, sel: null, q: '', dirty: false, saving: false, t: null, again: false };
  var STATUS = { draft: ['مسودة', ''], sent: ['مرسلة للتوقيع', 'warn'], signed: ['موقّعة', 'ok'], void: ['ملغاة', 'bad'] };
  var K = R.AGK;
  var common = ['c01', 'c05', 'c06', 'c07', 'l01', 'l02'];
  var PRESET = {
    main: { title: 'عقد تنفيذ أعمال أنظمة الأمن والسلامة', intro: 'بعون الله تعالى، اتفق الطرفان على قيام الطرف الأول بتوريد وتنفيذ الأعمال الموضحة في هذا العقد للمشروع المبيّن أعلاه، وفق البنود والكميات والأسعار المعتمدة والشروط والأحكام التالية.', closing: 'حُرّر هذا العقد من نسختين وبهذا تم الاتفاق بين الطرفين، والله ولي التوفيق.', pay: true,
      clauses: ['c01', 'c02', 'c03', 'c04', 'f01', 'f02', 'f03', 'f04', 'f05', 'f06', 'f07', 't01', 't02', 't03', 't04', 't05', 't06', 't07', 'w01', 'w02', 'o01', 'o02', 'o04', 'o05', 'd01', 'd02', 'd03', 'n04', 'c05', 'c06', 'c07', 'l01', 'l02'] },
    sub: { title: 'اتفاقية مقاول من الباطن', intro: 'بعون الله تعالى، اتفق الطرفان على أن يقوم الطرف الثاني (المقاول من الباطن) بتنفيذ الأعمال الموضحة في هذه الاتفاقية لصالح الطرف الأول (المقاول الرئيسي) في المشروع المبيّن أعلاه، وفق الشروط والأحكام التالية.', closing: 'حُررت هذه الاتفاقية من نسختين بيد كل طرف نسخة، وبهذا تم الاتفاق، والله ولي التوفيق.', pay: true,
      clauses: ['c01', 'c02', 'c03', 'c04', 'f01', 'f02', 'f03', 'f05', 'f06', 'f07', 'f08', 't01', 't02', 't03', 't05', 't06', 'w01', 'w02', 'o03', 'o04', 'o05', 'o06', 'o07', 'd01', 'd02', 'd03', 'n04', 'c05', 'c06', 'c07', 'l01', 'l02'] },
    supply: { title: 'عقد توريد معدات وأنظمة', intro: 'اتفق الطرفان على قيام الطرف الأول (البائع) بتوريد المواد والمعدات الموضحة في جدول الكميات المرفق إلى الطرف الثاني (المشتري)، وفق الشروط التالية.', closing: 'حُرر هذا العقد من نسختين وبهذا تم الاتفاق بين الطرفين.', pay: true,
      clauses: ['c01', 'f01', 'f02', 'f03', 'f06', 't01', 't02', 't08', 't09', 'w01', 'w02', 'd01', 'd02', 'd03', 'c05', 'c06', 'c07', 'l01', 'l02'] },
    amc: { title: 'عقد صيانة أنظمة الإنذار والإطفاء', intro: 'اتفق الطرفان على قيام الطرف الأول (مقدّم الخدمة) بصيانة أنظمة الإنذار ومكافحة الحريق في الموقع المبيّن أعلاه خلال مدة العقد، وفق الشروط التالية.', closing: 'حُرر هذا العقد من نسختين وبهذا تم الاتفاق بين الطرفين.', pay: true,
      clauses: ['c01', 'm01', 'm02', 'm03', 'm04', 'f01', 'f02', 'f03', 'f06', 't05', 'o04', 'o05', 'w02', 'd02', 'd03', 'd04', 'm05', 'c05', 'c06', 'c07', 'l01', 'l02'] },
    nda: { title: 'اتفاقية سرية وعدم إفصاح', intro: 'نظراً لرغبة الطرفين في تبادل معلومات ومستندات تتعلق بالمشروع المبيّن أعلاه، فقد اتفقا على الالتزام بسرية المعلومات التي يطّلع عليها كل منهما وفق الأحكام التالية.', closing: 'حُررت هذه الاتفاقية من نسختين وبهذا تم الاتفاق.', pay: false,
      clauses: ['n01', 'n02', 'n03', 'n04', 'c05', 'c07', 'l01', 'l02'] },
    addendum: { title: 'ملحق عقد', intro: 'إشارةً إلى الاتفاقية الأصلية الموضحة بياناتها أعلاه، اتفق الطرفان على إجراء التعديل الموضح في هذا الملحق، وفق ما يلي.', closing: 'حُرر هذا الملحق من نسختين وبهذا تم الاتفاق، وتبقى بقية شروط الاتفاقية الأصلية سارية.', pay: false,
      clauses: ['a01', 'a02', 'f03', 'c05', 'c07', 'l01'] },
    handover: { title: 'محضر استلام', intro: 'في التاريخ المبيّن أعلاه تم استلام الأعمال / المعدات المبيّنة أدناه بحضور الطرفين.', closing: 'حُرر هذا المحضر من نسختين بيد كل طرف نسخة.', pay: false, clauses: ['h01', 'h02', 'c07'] },
    custom: { title: 'اتفاقية', intro: '', closing: '', pay: false, clauses: common }
  };
  var libOf = function () { return S().settings.clauses || []; };
  var cur = function () { return (st.list || []).filter(function (a) { return a.id === st.sel; })[0] || null; };
  var canW = function () { return ['all', 'own'].indexOf(H.P().agreements) >= 0; };
  var setState = function (t, bad) { var e = $('#agState'); if (e) { e.textContent = t; e.style.color = bad ? 'var(--bad)' : ''; } };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ---------- list ---------- */
  function mount() {
    if (st.sel && st.list) return editor();
    H.main.innerHTML = '<div class="title-row"><h1>الاتفاقيات والعقود</h1><div class="sp"></div><button class="btn" type="button" id="agLib">مكتبة البنود</button>' + (canW() ? '<button class="btn pri" type="button" id="agNew">اتفاقية جديدة</button>' : '') + '</div>' +
      '<div class="note" style="margin-bottom:12px">تُبنى الاتفاقية من مكتبة بنود قابلة للتعديل. البنود الجاهزة صياغات عامة مساعدة وليست استشارة قانونية؛ يُنصح بعرض الصيغة النهائية على مستشار قانوني قبل التوقيع.</div>' +
      '<div class="card"><div class="row" style="margin-bottom:12px"><input id="agQ" placeholder="ابحث بالرقم أو الطرف الثاني أو المشروع" style="max-width:380px"></div><div class="tablewrap"><table class="t" style="min-width:820px"><thead><tr><th>الرقم</th><th>النوع</th><th>الطرف الثاني</th><th>المشروع</th><th class="num">القيمة</th><th>الحالة</th>' + (H.P().ownOnly ? '' : '<th>المسؤول</th>') + '<th></th></tr></thead><tbody id="agR"><tr><td colspan="8" class="empty">جارٍ التحميل…</td></tr></tbody></table></div></div>';
    var draw = function () {
      if (!st.list) return; var f = norm($('#agQ').value);
      var rows = st.list.filter(function (a) { return !f || norm(a.no + ' ' + (a.party2 && a.party2.name) + ' ' + a.project + ' ' + a.title).indexOf(f) >= 0; });
      $('#agR').innerHTML = rows.length ? rows.map(function (a) { var s = STATUS[a.status] || STATUS.draft; return '<tr data-id="' + a.id + '"><td><b><bdi dir="ltr">' + esc(a.no) + '</bdi></b></td><td>' + esc((K[a.kind] || K.custom).n) + '</td><td>' + esc(a.party2 && a.party2.name) + '</td><td>' + esc(a.project) + '</td><td class="num">' + (a.value ? fmt(a.kind === 'addendum' ? n0(a.value) + n0(a.delta) : a.value) : '') + '</td><td><span class="chip ' + s[1] + '">' + s[0] + '</span></td>' + (H.P().ownOnly ? '' : '<td>' + esc(a._ownerName || '') + '</td>') + '<td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" type="button" data-a="open">فتح</button>' + (canW() ? '<button class="btn sm" type="button" data-a="dup">نسخ</button>' : '') + (canW() && (H.P().agreements === 'all' || a.status === 'draft') ? '<button class="btn sm danger" type="button" data-a="del">حذف</button>' : '') + '</div></td></tr>'; }).join('') : '<tr><td colspan="8" class="empty">لا توجد اتفاقيات. ابدأ باتفاقية جديدة.</td></tr>';
    };
    $('#agQ').addEventListener('input', draw);
    $('#agLib').onclick = libModal; if ($('#agNew')) $('#agNew').onclick = kindModal;
    $('#agR').onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return; var a = st.list.filter(function (x) { return x.id === b.closest('tr').dataset.id; })[0];
      if (b.dataset.a === 'open') { st.sel = a.id; editor(); }
      else if (b.dataset.a === 'dup') create(Object.assign(clone(strip(a)), { title: a.title }), true);
      else if (b.dataset.a === 'del') { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'تأكيد الحذف'; setTimeout(function () { if (b.isConnected) { b.classList.remove('armed'); b.textContent = 'حذف'; } }, 3000); return; } H.api('DELETE', '/agreements/' + a.id).then(function () { st.list = st.list.filter(function (x) { return x.id !== a.id; }); draw(); }).catch(H.fail); }
    };
    if (st.list) draw(); else H.api('GET', '/agreements').then(function (r) { st.list = r.agreements; draw(); }).catch(function (e) { H.fail(e); $('#agR').innerHTML = '<tr><td colspan="8" class="empty">تعذر التحميل</td></tr>'; });
  }
  function strip(a) { var o = {}; Object.keys(a).forEach(function (k) { if (k[0] !== '_' && ['id', 'no', 'status'].indexOf(k) < 0) o[k] = a[k]; }); return o; }
  function create(data, quiet) {
    H.api('POST', '/agreements', { agreement: data }).then(function (r) { if (!st.list) st.list = []; st.list.unshift(r.agreement); st.sel = r.agreement.id; if (!quiet) H.toast('أُنشئت الاتفاقية ' + r.agreement.no); H.syncCounters && H.syncCounters(); editor(); }).catch(H.fail);
  }
  function kindModal() {
    H.modal('<h3>اتفاقية جديدة</h3><p class="muted" style="margin-top:0;font-size:12.5px">اختر النوع، وستُحمَّل البنود المناسبة له من المكتبة ويمكنك تعديلها بالكامل.</p><div class="stu-cards" style="grid-template-columns:1fr 1fr">' + Object.keys(K).map(function (k) { return '<button type="button" class="stu-card" data-kind="' + k + '"><b>' + K[k].n + '</b><span class="muted">' + (PRESET[k].clauses.length ? PRESET[k].clauses.length + ' بند جاهز' : 'فارغة') + '</span></button>'; }).join('') + '</div><div class="row" style="margin-top:12px"><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      m.onclick = function (e) { var b = e.target.closest('[data-kind]'); if (!b) return; H.closeModal(); create(blank(b.dataset.kind)); };
    });
  }
  function blank(kind) {
    var p = PRESET[kind], lib = libOf(), s = S().settings;
    return {
      kind: kind, title: p.title, date: R.today(), party2: { name: '', cr: '', vat: '', rep: '', repTitle: '', address: '', phone: '' }, rep1: s.preparedBy || '', rep1Title: '',
      project: '', location: '', duration: 0, value: 0, delta: 0, refNo: '', valueNote: '', intro: p.intro, closing: p.closing, notes: '', tpl: '', custId: '', quoteId: '', stamp: true,
      payments: p.pay ? (s.pay || []).map(function (x) { return { id: H.uid(), label: x.label, pct: x.pct, due: '' }; }) : [],
      clauses: p.clauses.map(function (id) { return lib.filter(function (k) { return k.id === id; })[0]; }).filter(Boolean).map(function (k) { return { id: H.uid(), title: k.title, text: k.text, on: true }; })
    };
  }

  /* ---------- editor ---------- */
  function editor() {
    var a = cur(); if (!a) { st.sel = null; return mount(); }
    var ro = !canW() || (H.P().agreements === 'own' && false), s = S().settings;
    var F = function (k, l, ex) { return '<label class="fld"><span>' + l + '</span><input data-gf="' + k + '" value="' + esc(k.indexOf('.') > 0 ? (a[k.split('.')[0]] || {})[k.split('.')[1]] : a[k]) + '" ' + (ex || '') + '></label>'; };
    var tpls = '<option value="">الافتراضي</option><option value="classic" ' + (a.tpl === 'classic' ? 'selected' : '') + '>القالب الأصلي</option>' + (s.templates || []).map(function (t) { return '<option value="' + t.id + '" ' + (a.tpl === t.id ? 'selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
    var quotes = S().quotes.filter(function (q) { return a.kind === 'addendum' ? q.contract : true; });
    H.main.innerHTML = '<div class="split ag"><section><div class="title-row"><button class="btn sm" type="button" data-a="back">← الاتفاقيات</button><h1><bdi dir="ltr">' + esc(a.no) + '</bdi></h1><div class="sp"></div><span class="muted" id="agState" style="font-size:12px">محفوظ</span></div>' +
      '<div class="card"><h3>بيانات الوثيقة</h3><div class="grid">' + '<label class="fld"><span>النوع</span><select data-gf="kind">' + Object.keys(K).map(function (k) { return '<option value="' + k + '" ' + (a.kind === k ? 'selected' : '') + '>' + K[k].n + '</option>'; }).join('') + '</select></label>' + F('title', 'عنوان الوثيقة') + F('date', 'التاريخ', 'type="date"') +
      '<label class="fld"><span>الحالة</span><select data-gf="status">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '" ' + (a.status === k ? 'selected' : '') + '>' + STATUS[k][0] + '</option>'; }).join('') + '</select></label><label class="fld"><span>قالب الطباعة</span><select data-gf="tpl">' + tpls + '</select></label></div></div>' +
      '<div class="card"><h3>الأطراف</h3><div class="grid g2"><label class="fld" style="grid-column:1/-1"><span>تعبئة من عميل مسجل / عرض سعر</span><select id="agLink"><option value="">— اختر —</option><optgroup label="عملاء">' + S().customers.map(function (c) { return '<option value="c:' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</optgroup><optgroup label="عروض وعقود (تعبئة المشروع والقيمة والدفعات)">' + quotes.map(function (q) { return '<option value="q:' + q.id + '">' + esc(q.no + ' - ' + (q.client || '') + (q.project ? ' - ' + q.project : '')) + '</option>'; }).join('') + '</optgroup></select></label>' +
      F('rep1', 'ممثل الطرف الأول (' + esc((K[a.kind] || K.custom).r1) + ')') + F('rep1Title', 'صفته') + F('party2.name', 'الطرف الثاني (' + esc((K[a.kind] || K.custom).r2) + ')') + F('party2.rep', 'ممثل الطرف الثاني') + F('party2.repTitle', 'صفته') + F('party2.cr', 'السجل التجاري', 'class="ltr"') + F('party2.vat', 'الرقم الضريبي', 'class="ltr"') + F('party2.phone', 'الجوال', 'class="ltr"') + F('party2.address', 'العنوان') + '</div></div>' +
      '<div class="card"><h3>المشروع والقيمة</h3><div class="grid">' + F('project', 'المشروع') + F('location', 'الموقع') + F('duration', 'المدة (يوم)', 'type="number" min="0"') + (a.kind === 'addendum' ? F('refNo', 'رقم الاتفاقية الأصلية', 'class="ltr"') : '') + F('value', a.kind === 'addendum' ? 'قيمة الاتفاقية الأصلية (شاملة الضريبة)' : 'قيمة الاتفاقية (شاملة الضريبة)', 'type="number" min="0" step="any"') + (a.kind === 'addendum' ? F('delta', 'قيمة الملحق (+ زيادة / − تخفيض)', 'type="number" step="any"') : '') + '</div>' + F('valueNote', 'ملاحظة على القيمة', 'placeholder="مثال: لا تشمل القيمة أعمال التشطيب"') + (a.kind === 'addendum' ? '' : '<div id="agPay"></div>') + '</div>' +
      '<div class="card"><h3>النصوص</h3><label class="fld"><span>التمهيد</span><textarea data-gf="intro" rows="3">' + esc(a.intro) + '</textarea></label><label class="fld" style="margin-top:10px"><span>الخاتمة</span><textarea data-gf="closing" rows="2">' + esc(a.closing) + '</textarea></label><label class="fld" style="margin-top:10px"><span>ملاحظات إضافية</span><textarea data-gf="notes" rows="2">' + esc(a.notes) + '</textarea></label><label class="row" style="margin-top:10px"><input type="checkbox" data-gf="stamp" ' + (a.stamp !== false ? 'checked' : '') + ' style="width:auto"> إظهار الختم</label></div>' +
      '<div class="card"><h3>البنود <span class="chip" id="agCnt"></span></h3><div class="row" style="margin-bottom:10px"><button class="btn sm" type="button" data-a="addlib">إضافة من المكتبة</button><button class="btn sm" type="button" data-a="addcus">بند مخصص</button><button class="btn sm" type="button" data-a="reload">إعادة تحميل بنود النوع</button></div><div id="agCl"></div></div>' +
      '<div class="sticky-act"><button class="btn pri" type="button" data-a="print">طباعة / حفظ PDF</button>' + (a.kind !== 'addendum' ? '<button class="btn" type="button" data-a="addendum">إنشاء ملحق</button>' : '') + '<button class="btn" type="button" data-a="back">القائمة</button></div></section>' +
      '<aside class="pv"><div class="bar"><b>معاينة</b><span>تتحدث فوراً مع كل تعديل</span></div><div class="pv-wrap"><div class="sheet" id="sheet"></div></div></aside></div>';
    drawPay(); drawClauses(); preview();
    if (ro || a.status === 'void') $$('#main input,#main textarea,#main select', H.main).forEach(function (e) { e.disabled = true; }); if (ro) $$('.sticky-act button:not([data-a=print]):not([data-a=back]),[data-a=addlib],[data-a=addcus],[data-a=reload]', H.main).forEach(function (b) { b.hidden = true; });
    bind(a);
  }
  function drawPay() {
    var a = cur(), box = $('#agPay'); if (!box) return; var sum = r2((a.payments || []).reduce(function (x, p) { return x + n0(p.pct); }, 0));
    box.innerHTML = '<div class="row" style="margin:12px 0 6px"><b>جدول الدفعات</b><span class="chip ' + (sum === 100 ? 'ok' : (a.payments || []).length ? 'bad' : '') + '">المجموع ' + sum + '%</span></div><div class="tablewrap"><table class="t" style="min-width:420px"><tbody>' + (a.payments || []).map(function (p, i) { return '<tr data-pi="' + i + '"><td><input data-gp="label" value="' + esc(p.label) + '"></td><td style="width:84px"><input data-gp="pct" type="number" min="0" step="any" value="' + p.pct + '"></td><td style="width:36px"><button class="ib" type="button" data-a="payrm" aria-label="حذف">✕</button></td></tr>'; }).join('') + '</tbody></table></div><div class="row" style="margin-top:8px"><button class="btn sm" type="button" data-a="payadd">إضافة دفعة</button></div>';
  }
  function drawClauses() {
    var a = cur(), box = $('#agCl'); if (!box) return;
    $('#agCnt').textContent = (a.clauses || []).filter(function (k) { return k.on !== false; }).length + ' بند مفعّل';
    box.innerHTML = (a.clauses || []).length ? a.clauses.map(function (k, i) { return '<div class="ln agc" data-ci="' + i + '"><div class="row" style="flex-wrap:nowrap"><input type="checkbox" data-gc="on" ' + (k.on !== false ? 'checked' : '') + ' style="width:auto" aria-label="تفعيل"><input data-gc="title" value="' + esc(k.title) + '" placeholder="عنوان البند" style="font-weight:700"><span class="ln-act" style="display:flex;gap:2px"><button class="ib" type="button" data-a="cup" aria-label="للأعلى">▲</button><button class="ib" type="button" data-a="cdn" aria-label="للأسفل">▼</button>' + (H.P().settingsWrite ? '<button class="ib" type="button" data-a="csave" title="حفظ في المكتبة" aria-label="حفظ في المكتبة">＋</button>' : '') + '<button class="ib" type="button" data-a="crm" aria-label="حذف">✕</button></span></div><textarea data-gc="text" rows="3">' + esc(k.text) + '</textarea></div>'; }).join('') : '<div class="empty">لا توجد بنود. أضف من المكتبة أو أنشئ بنداً مخصصاً.</div>';
  }
  function preview() {
    var a = cur(), sh = $('#sheet'); if (!sh || !a) return;
    sh.innerHTML = R.agreementDoc(S().settings, a); H.syncFonts(); var w = $('.pv-wrap'); if (w) sh.style.zoom = Math.min(1, (w.clientWidth - 24) / 816);
  }
  function touch() { clearTimeout(st.t); st.dirty = true; setState('جارٍ الحفظ…'); st.t = setTimeout(flush, 700); preview(); }
  function flush() {
    var a = cur(); if (!a || !st.dirty) return; if (st.saving) { st.again = true; return; }
    st.saving = true; st.dirty = false;
    H.api('PUT', '/agreements/' + a.id, { agreement: strip(a), status: a.status, _v: a._v }).then(function (r) { a._v = r.agreement._v; a._updated = r.agreement._updated; setState('محفوظ'); })
      .catch(function (e) { st.dirty = false; setState(e.message || 'تعذر الحفظ', true); H.fail(e); if (e.status === 409) { st.list = null; st.sel = null; setTimeout(mount, 1200); } })
      .then(function () { st.saving = false; if (st.again || st.dirty) { st.again = false; st.dirty = true; flush(); } });
  }
  function bind(a) {
    var root = H.main;
    root.oninput = function (e) {
      var t = e.target, a = cur(); if (!a) return;
      if (t.dataset.gf) { var k = t.dataset.gf; if (k === 'kind' || k === 'status' || k === 'tpl') return; var v = t.type === 'number' ? (t.value === '' ? 0 : n0(t.value)) : t.value; if (k.indexOf('.') > 0) { var p = k.split('.'); a[p[0]][p[1]] = v; } else a[k] = v; touch(); }
      else if (t.dataset.gp) { var i = +t.closest('tr').dataset.pi; a.payments[i][t.dataset.gp] = t.dataset.gp === 'pct' ? n0(t.value) : t.value; touch(); }
      else if (t.dataset.gc && t.dataset.gc !== 'on') { a.clauses[+t.closest('.agc').dataset.ci][t.dataset.gc] = t.value; touch(); }
    };
    root.onchange = function (e) {
      var t = e.target, a = cur(); if (!a) return;
      if (t.dataset.gf === 'stamp') { a.stamp = t.checked; touch(); }
      else if (t.dataset.gf === 'status' || t.dataset.gf === 'tpl') { a[t.dataset.gf] = t.value; touch(); if (t.dataset.gf === 'status') editor(); }
      else if (t.dataset.gf === 'kind') { a.kind = t.value; if (t.value === 'addendum') { a.payments = []; } touch(); editor(); }
      else if (t.dataset.gc === 'on') { a.clauses[+t.closest('.agc').dataset.ci].on = t.checked; drawClauses(); touch(); }
      else if (t.id === 'agLink' && t.value) link(a, t.value);
    };
    root.onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return; var a = cur(); if (!a) return;
      var act = b.dataset.a, ci = b.closest('.agc') ? +b.closest('.agc').dataset.ci : -1;
      if (act === 'back') { flushNow(function () { st.sel = null; st.list = null; mount(); }); }
      else if (act === 'print') H.printDoc(R.agreementDoc(S().settings, a), (K[a.kind] || K.custom).n + ' ' + a.no);
      else if (act === 'payadd') { a.payments.push({ id: H.uid(), label: 'دفعة جديدة', pct: 0, due: '' }); drawPay(); touch(); }
      else if (act === 'payrm') { a.payments.splice(+b.closest('tr').dataset.pi, 1); drawPay(); touch(); }
      else if (act === 'cup' || act === 'cdn') { var j = ci + (act === 'cup' ? -1 : 1); if (j < 0 || j >= a.clauses.length) return; var x = a.clauses[ci]; a.clauses[ci] = a.clauses[j]; a.clauses[j] = x; drawClauses(); touch(); }
      else if (act === 'crm') { a.clauses.splice(ci, 1); drawClauses(); touch(); }
      else if (act === 'csave') { var c = a.clauses[ci]; var lib = S().settings.clauses; lib.push({ id: 'u' + H.uid().slice(0, 8), cat: 'مضافة', title: c.title, text: c.text, kinds: a.kind }); H.saveS(); H.toast('حُفظ البند في المكتبة'); }
      else if (act === 'addcus') { a.clauses.push({ id: H.uid(), title: '', text: '', on: true }); drawClauses(); touch(); var ls = $$('.agc textarea'); if (ls.length) ls[ls.length - 1].focus(); }
      else if (act === 'addlib') pickClauses(a);
      else if (act === 'reload') { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'تأكيد: استبدال كل البنود؟'; setTimeout(function () { if (b.isConnected) { b.classList.remove('armed'); b.textContent = 'إعادة تحميل بنود النوع'; } }, 3500); return; } a.clauses = blank(a.kind).clauses; drawClauses(); touch(); }
      else if (act === 'addendum') makeAddendum(a);
    };
  }
  function flushNow(cb) { clearTimeout(st.t); if (st.dirty) { st.again = false; var done = false; var fin = function () { if (!done) { done = true; cb(); } }; flush(); setTimeout(fin, 600); } else cb(); }
  function link(a, v) {
    var id = v.slice(2), s = S();
    if (v[0] === 'c') { var c = s.customers.filter(function (x) { return x.id === id; })[0]; if (!c) return; a.custId = c.id; Object.assign(a.party2, { name: c.name, vat: c.vat || '', cr: c.cr || '', address: c.address || '', phone: c.phone || '', rep: a.party2.rep || c.contact || '' }); }
    else { var q = s.quotes.filter(function (x) { return x.id === id; })[0]; if (!q) return; var c2 = s.customers.filter(function (x) { return x.id === q.custId; })[0]; a.quoteId = q.id; a.custId = q.custId || ''; a.project = q.project || a.project; a.location = q.location || a.location; Object.assign(a.party2, { name: (c2 && c2.name) || q.client, vat: c2 ? c2.vat || '' : '', cr: c2 ? c2.cr || '' : '', address: c2 ? c2.address || '' : '', phone: c2 ? c2.phone || '' : '', rep: a.party2.rep || (c2 && c2.contact) || '' });
      var val = q.contract ? R.cTotal(q) : R.calc(q).total; a.value = val; if (a.kind === 'addendum') a.refNo = q.no; else if (q.contract) { a.duration = q.contract.duration || a.duration; a.payments = q.contract.payments.map(function (p) { return { id: H.uid(), label: p.label, pct: p.pct, due: p.due || '' }; }); } }
    editor(); touch();
  }
  function pickClauses(a) {
    var lib = libOf(), cats = []; lib.forEach(function (k) { if (cats.indexOf(k.cat) < 0) cats.push(k.cat); });
    H.modal('<h3>إضافة بنود من المكتبة</h3><div class="row" style="margin-bottom:8px"><input id="clq" placeholder="بحث" style="flex:1"><label class="chk"><input id="clk" type="checkbox" checked> المناسبة لهذا النوع فقط</label></div><div id="cll" style="max-height:52vh;overflow:auto"></div><div class="row" style="margin-top:12px"><button class="btn pri" id="clok" type="button">إضافة المحدد</button><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      m.firstElementChild.style.width = 'min(760px,100%)';
      var have = a.clauses.map(function (k) { return norm(k.title + k.text.slice(0, 30)); });
      var draw = function () {
        var f = norm($('#clq', m).value), only = $('#clk', m).checked;
        $('#cll', m).innerHTML = cats.map(function (cat) { var items = lib.filter(function (k) { return k.cat === cat && (!only || (k.kinds || '').split(',').indexOf(a.kind) >= 0) && (!f || norm(k.title + ' ' + k.text).indexOf(f) >= 0); }); return items.length ? '<div class="pal-g">' + esc(cat) + '</div>' + items.map(function (k) { var dup = have.indexOf(norm(k.title + k.text.slice(0, 30))) >= 0; return '<label class="kit" style="align-items:flex-start"><span class="row" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" value="' + k.id + '" style="width:auto;margin-top:4px"><span><b>' + esc(k.title) + '</b>' + (dup ? ' <span class="chip">مضاف</span>' : '') + '<br><small class="muted">' + esc(k.text.slice(0, 150)) + '…</small></span></span></label>'; }).join('') : ''; }).join('') || '<div class="empty">لا نتائج</div>';
      };
      draw(); $('#clq', m).oninput = draw; $('#clk', m).onchange = draw;
      $('#clok', m).onclick = function () { var ids = $$('#cll input:checked', m).map(function (i) { return i.value; }); ids.forEach(function (id) { var k = lib.filter(function (x) { return x.id === id; })[0]; if (k) a.clauses.push({ id: H.uid(), title: k.title, text: k.text, on: true }); }); H.closeModal(); drawClauses(); touch(); };
    });
  }
  function makeAddendum(a) {
    var d = blank('addendum'); d.refNo = a.no; d.value = a.value; d.project = a.project; d.location = a.location; d.party2 = clone(a.party2); d.custId = a.custId; d.quoteId = a.quoteId; d.rep1 = a.rep1; d.rep1Title = a.rep1Title; d.tpl = a.tpl; d.title = 'ملحق رقم (1) للاتفاقية ' + a.no;
    flushNow(function () { create(d); });
  }

  /* ---------- clause library ---------- */
  function libModal() {
    var adm = H.P().settingsWrite, lib = libOf(), KL = { main: 'عقد تنفيذ', sub: 'باطن', supply: 'توريد', amc: 'صيانة', nda: 'سرية', addendum: 'ملحق', handover: 'استلام' };
    H.modal('<h3>مكتبة البنود <span class="chip">' + lib.length + '</span></h3><div class="row" style="margin-bottom:8px"><input id="lbq" placeholder="بحث في البنود" style="flex:1">' + (adm ? '<button class="btn sm pri" id="lbn" type="button">بند جديد</button>' : '') + '</div><div id="lbl" style="max-height:56vh;overflow:auto"></div><div class="row" style="margin-top:12px"><button class="btn" data-act="modal-close" type="button">إغلاق</button></div>', function (m) {
      m.firstElementChild.style.width = 'min(820px,100%)';
      var draw = function () {
        var f = norm($('#lbq', m).value), cats = []; lib.forEach(function (k) { if (cats.indexOf(k.cat) < 0) cats.push(k.cat); });
        $('#lbl', m).innerHTML = cats.map(function (cat) { var it = lib.filter(function (k) { return k.cat === cat && (!f || norm(k.title + ' ' + k.text).indexOf(f) >= 0); }); return it.length ? '<div class="pal-g">' + esc(cat) + '</div>' + it.map(function (k) { return '<div class="kit" data-id="' + k.id + '" style="align-items:flex-start"><div><b>' + esc(k.title) + '</b> ' + (k.kinds || '').split(',').filter(Boolean).map(function (x) { return '<span class="chip">' + (KL[x] || x) + '</span>'; }).join(' ') + '<br><small class="muted">' + esc(k.text.slice(0, 170)) + (k.text.length > 170 ? '…' : '') + '</small></div>' + (adm ? '<div class="row" style="flex-wrap:nowrap"><button class="btn sm" type="button" data-e="edit">تعديل</button><button class="btn sm danger" type="button" data-e="del">حذف</button></div>' : '') + '</div>'; }).join('') : ''; }).join('') || '<div class="empty">لا نتائج</div>';
      };
      draw(); $('#lbq', m).oninput = draw;
      if (adm) {
        $('#lbn', m).onclick = function () { edit({ id: 'u' + H.uid().slice(0, 8), cat: 'مضافة', title: '', text: '', kinds: 'main' }, true); };
        $('#lbl', m).onclick = function (e) { var b = e.target.closest('[data-e]'); if (!b) return; var k = lib.filter(function (x) { return x.id === b.closest('.kit').dataset.id; })[0]; if (b.dataset.e === 'edit') edit(k, false); else { S().settings.clauses = lib = lib.filter(function (x) { return x.id !== k.id; }); H.saveS(); draw(); } };
      }
      function edit(k, isNew) {
        H.modal('<h3>' + (isNew ? 'بند جديد' : 'تعديل البند') + '</h3><div class="grid g2"><label class="fld"><span>التصنيف</span><input id="ekc" value="' + esc(k.cat) + '"></label><label class="fld"><span>العنوان</span><input id="ekt" value="' + esc(k.title) + '"></label></div><label class="fld" style="margin-top:10px"><span>نص البند</span><textarea id="ekx" rows="6">' + esc(k.text) + '</textarea></label><div class="row" style="margin-top:10px">' + Object.keys(KL).map(function (x) { return '<label class="row"><input type="checkbox" data-gk="' + x + '" ' + ((k.kinds || '').split(',').indexOf(x) >= 0 ? 'checked' : '') + ' style="width:auto"> ' + KL[x] + '</label>'; }).join('') + '</div><div class="row" style="margin-top:12px"><button class="btn pri" id="eks" type="button">حفظ</button><button class="btn" id="ekc2" type="button">رجوع</button></div>', function (m2) {
          m2.firstElementChild.style.width = 'min(720px,100%)';
          $('#ekc2', m2).onclick = function () { libModal(); };
          $('#eks', m2).onclick = function () {
            k.cat = $('#ekc', m2).value.trim() || 'عام'; k.title = $('#ekt', m2).value.trim(); k.text = $('#ekx', m2).value.trim(); k.kinds = $$('[data-gk]:checked', m2).map(function (i) { return i.dataset.gk; }).join(',');
            if (!k.text) return H.toast('اكتب نص البند'); if (isNew) S().settings.clauses.push(k); H.saveS(); libModal();
          };
        });
      }
    });
  }
  window.AGR = { mount: mount };
})();
