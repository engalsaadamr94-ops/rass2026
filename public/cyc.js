/* Contract money cycle: variation orders, interim payment certificates (progress billing), cheque register, receivables aging. */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc, n0 = R.n0, r2 = R.r2, fmt = R.fmt, fmtDate = R.fmtDate;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var S = function () { return H.S(); };
  var st = { sub: 'ipc', docs: {}, sel: null, t: null, dirty: false, saving: false, again: false };
  var SUBS = [['ipc', 'المستخلصات'], ['vo', 'أوامر التغيير'], ['chq', 'الشيكات'], ['aging', 'الذمم المتقادمة']];
  var STAT = {
    vo: { draft: ['مسودة', ''], submitted: ['مقدَّم للاعتماد', 'warn'], approved: ['معتمد', 'ok'], rejected: ['مرفوض', 'bad'] },
    ipc: { draft: ['مسودة', ''], approved: ['معتمد', 'ok'], paid: ['مدفوع', 'ok'], rejected: ['مرفوض', 'bad'] },
    chq: { pending: ['قيد الانتظار', 'warn'], deposited: ['مودع', ''], cleared: ['محصّل', 'ok'], bounced: ['مرتجع', 'bad'], cancelled: ['ملغى', ''] }
  };
  var P = function () { return H.P(); };
  var canK = function (k) { return k === 'chq' ? P().receipts : P().pdocs !== 'none'; };
  var canW = function (k) { return k === 'chq' ? P().receiptsWrite : P().pdocs === 'write'; };
  var contracts = function () { return S().quotes.filter(function (q) { return q.contract && q.status !== 'lost' && q.status !== 'superseded'; }); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var cur = function () { return (st.docs[st.sub] || []).filter(function (d) { return d.id === st.sel; })[0] || null; };
  var setState = function (t, bad) { var e = $('#cyState'); if (e) { e.textContent = t; e.style.color = bad ? 'var(--bad)' : ''; } };
  var chip = function (k, s) { var x = (STAT[k] || {})[s] || [s, '']; return '<span class="chip ' + x[1] + '">' + x[0] + '</span>'; };
  var wa = function (phone, text) { var p = String(phone || '').replace(/\D/g, ''); if (/^05\d{8}$/.test(p)) p = '966' + p.slice(1); else if (/^5\d{8}$/.test(p)) p = '966' + p; return p ? 'https://wa.me/' + p + '?text=' + encodeURIComponent(text) : ''; };

  function load(kind, cb) {
    if (!canK(kind)) return cb && cb();
    H.api('GET', '/pdocs?kind=' + kind).then(function (r) { st.docs[kind] = r.docs; cb && cb(); }).catch(function (e) { H.fail(e); });
  }
  function mount() {
    if (st.sel && cur()) return editor();
    st.sel = null; var subs = SUBS.filter(function (s) { return s[0] === 'aging' ? P().receipts || P().pdocs !== 'none' : canK(s[0]); });
    if (!subs.some(function (s) { return s[0] === st.sub; })) st.sub = subs[0] && subs[0][0];
    H.main.innerHTML = '<div class="title-row"><h1>دورة العقد المالية</h1><div class="sp"></div></div><div class="row" style="margin-bottom:12px">' + subs.map(function (s) { return '<button type="button" class="btn ' + (st.sub === s[0] ? 'pri' : '') + '" data-sub="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div><div id="cyBody"></div>';
    H.main.onclick = function (e) { var b = e.target.closest('[data-sub]'); if (b) { st.sub = b.dataset.sub; mount(); } };
    if (st.sub === 'aging') return aging();
    if (st.docs[st.sub]) list(); else { $('#cyBody').innerHTML = '<div class="card empty">جارٍ التحميل…</div>'; load(st.sub, list); }
  }

  /* ---------- lists ---------- */
  function list() {
    var k = st.sub, ds = st.docs[k] || [], box = $('#cyBody'); if (!box) return;
    var head = { ipc: ['الرقم', 'العقد', 'العميل', 'المشروع', 'التاريخ', 'الصافي المستحق', 'الحالة'], vo: ['الرقم', 'العقد', 'العميل', 'الموضوع', 'التاريخ', 'الأثر على العقد', 'الحالة'], chq: ['الرقم', 'النوع', 'الجهة', 'البنك / رقم الشيك', 'الاستحقاق', 'المبلغ', 'الحالة'] }[k];
    var row = function (d) {
      var cells = k === 'ipc' ? [d.no + ' (م' + (d.seq || '') + ')', d.contractNo, d.client, d.project, fmtDate(d.date), fmt(d.amount)] : k === 'vo' ? [d.no, d.contractNo, d.client, d.title, fmtDate(d.date), (d.amount >= 0 ? '+ ' : '- ') + fmt(Math.abs(d.amount))] : [d.no, d.dir === 'out' ? 'صادر' : 'وارد', d.party, (d.bank || '') + ' ' + (d.chqNo || ''), fmtDate(d.due), fmt(d.amount)];
      var soon = k === 'chq' && d.status === 'pending' && d.due && d.due <= R.addDays(R.today(), 7);
      return '<tr data-id="' + d.id + '"' + (soon ? ' style="background:var(--warn-bg,#fff7e0)"' : '') + '>' + cells.map(function (c, i) { return '<td' + (i === 5 ? ' class="num"' : '') + '>' + (i === 0 ? '<b><bdi dir="ltr">' + esc(c) + '</bdi></b>' : esc(c == null ? '' : c)) + '</td>'; }).join('') + '<td>' + chip(k, d.status) + '</td><td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">' + (k === 'chq' ? '' : '<button class="btn sm" type="button" data-a="open">فتح</button>') + (canW(k) && (d.status === 'draft' || d.status === 'pending' || P().role === 'admin') && !(k === 'ipc' && d.status !== 'draft') && !(k === 'vo' && d.status === 'approved') ? '<button class="btn sm danger" type="button" data-a="del">حذف</button>' : '') + '</div></td></tr>';
    };
    var kpi = '';
    if (k === 'chq') { var pin = 0, pout = 0; ds.forEach(function (d) { if (d.status === 'pending' || d.status === 'deposited') { if (d.dir === 'out') pout += d.amount; else pin += d.amount; } }); kpi = '<div class="cfbar" style="margin-bottom:12px"><span class="chip ok">وارد معلّق: ' + fmt(pin) + '</span> <span class="chip warn">صادر معلّق: ' + fmt(pout) + '</span></div>'; }
    box.innerHTML = '<div class="card">' + kpi + '<div class="row" style="margin-bottom:12px"><div class="sp"></div>' + (canW(k) ? '<button class="btn pri" type="button" data-a="new">' + ({ ipc: 'مستخلص جديد', vo: 'أمر تغيير جديد', chq: 'شيك جديد' })[k] + '</button>' : '') + '</div><div class="tablewrap"><table class="t" style="min-width:860px"><thead><tr>' + head.map(function (h, i) { return '<th' + (i === 5 ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '<th></th><th></th></tr></thead><tbody>' + (ds.length ? ds.map(row).join('') : '<tr><td colspan="9" class="empty">لا توجد مستندات بعد.</td></tr>') + '</tbody></table></div></div>' +
      (k === 'ipc' ? '<div class="note" style="margin-top:12px">المستخلص يحسب: الأعمال المنجزة التراكمية، واسترداد الدفعة المقدمة، واستقطاع الضمان، ثم ضريبة القيمة المضافة على الصافي. المعالجة الضريبية للدفعات المقدمة والاستقطاع تُراجع مع المحاسب.</div>' : '');
    box.onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return; var tr = b.closest('tr'), d = tr && (st.docs[k] || []).filter(function (x) { return x.id === tr.dataset.id; })[0];
      if (b.dataset.a === 'new') return k === 'chq' ? chqForm() : pickContract();
      if (b.dataset.a === 'open') { st.sel = d.id; editor(); }
      else if (b.dataset.a === 'del') { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'تأكيد'; setTimeout(function () { if (b.isConnected) { b.classList.remove('armed'); b.textContent = 'حذف'; } }, 3000); return; } H.api('DELETE', '/pdocs/' + d.id).then(function () { st.docs[k] = st.docs[k].filter(function (x) { return x.id !== d.id; }); list(); }).catch(H.fail); }
    };
    if (k === 'chq') $$('tbody tr[data-id]', box).forEach(function (tr) { var d = ds.filter(function (x) { return x.id === tr.dataset.id; })[0]; if (!canW('chq')) return; var sel = document.createElement('select'); sel.innerHTML = Object.keys(STAT.chq).map(function (s) { return '<option value="' + s + '" ' + (d.status === s ? 'selected' : '') + '>' + STAT.chq[s][0] + '</option>'; }).join(''); sel.onchange = function () { H.api('PUT', '/pdocs/' + d.id, { doc: strip(d), status: sel.value, _v: d._v }).then(function (r) { Object.assign(d, r.doc); list(); }).catch(function (e) { H.fail(e); load('chq', list); }); }; tr.children[6].innerHTML = ''; tr.children[6].appendChild(sel); });
  }
  function strip(d) { var o = {}; Object.keys(d).forEach(function (k) { if (k[0] !== '_' && ['id', 'no', 'status', 'kind', 'amount', 'quoteId', 'custId'].indexOf(k) < 0) o[k] = d[k]; }); return o; }
  function create(kind, doc, quoteId) {
    H.api('POST', '/pdocs', { kind: kind, doc: Object.assign({ quoteId: quoteId || '' }, doc) }).then(function (r) { (st.docs[kind] = st.docs[kind] || []).unshift(r.doc); st.sub = kind; st.sel = r.doc.id; H.toast('أُنشئ ' + r.doc.no); editor(); }).catch(H.fail);
  }
  function pickContract() {
    var k = st.sub, cs = contracts();
    H.modal('<h3>اختر العقد</h3>' + (cs.length ? '<div id="cyCs" style="max-height:50vh;overflow:auto">' + cs.map(function (q) { return '<button type="button" class="stu-card" style="width:100%;text-align:right;margin-bottom:6px" data-q="' + q.id + '"><b>' + esc(q.no) + '</b> - ' + esc(q.client || '') + '<br><span class="muted">' + esc(q.project || '') + ' · ' + fmt(R.cTotal(q)) + '</span></button>'; }).join('') + '</div>' : '<div class="empty">لا توجد عقود. حوّل عرضاً إلى عقد أولاً.</div>') + '<div class="row" style="margin-top:12px"><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      m.onclick = function (e) { var b = e.target.closest('[data-q]'); if (!b) return; H.closeModal(); var q = S().quotes.filter(function (x) { return x.id === b.dataset.q; })[0]; k === 'ipc' ? newIpc(q) : newVo(q); };
    });
  }
  function baseOf(q) { return { date: R.today(), client: q.client || '', project: q.project || '', contractNo: q.no, rep1: S().settings.preparedBy || '', vatRate: n0(q.vatRate) || 15 }; }
  function approvedVO(q) { return (st.docs.vo || []).filter(function (v) { return v.quoteId === q.id && v.status === 'approved'; }); }
  function contractNow(q) { return r2(R.cTotal(q) + approvedVO(q).reduce(function (a, v) { return a + v.amount; }, 0)); }
  function newVo(q) { load('vo', function () { create('vo', Object.assign(baseOf(q), { title: '', reason: '', dir: 'add', days: 0, before: contractNow(q), lines: [{ id: H.uid(), desc: '', unit: 'NO', qty: 1, price: 0 }] }), q.id); }); }
  function newIpc(q) {
    load('vo', function () { load('ipc', function () {
      var c = R.calc(q), vr = n0(q.vatRate), ratio = c.sub > 0 ? R.cTotal(q) / (1 + vr / 100) / c.sub : 1;
      var prev = (st.docs.ipc || []).filter(function (d) { return d.quoteId === q.id && (d.status === 'approved' || d.status === 'paid'); }).sort(function (a, b) { return b.seq - a.seq; })[0];
      var pp = {}; if (prev && prev.calc) prev.calc.lines.forEach(function (l) { pp[l.id] = l.pct; });
      var lines = c.groups.map(function (g, i) { return { id: 'g' + i, desc: g.name || 'بند ' + (i + 1), amt: r2(g.sub * ratio), pct: pp['g' + i] || 0 }; });
      approvedVO(q).forEach(function (v) { var id = 'v' + v.id; lines.push({ id: id, desc: 'أمر تغيير ' + v.no + ' - ' + v.title, amt: r2(R.voCalc(v).signedNet), pct: pp[id] || 0 }); });
      create('ipc', Object.assign(baseOf(q), { periodTo: R.today(), advance: 0, advPct: prev ? prev.advPct : 0, retPct: prev ? prev.retPct : 10, deduct: 0, deductNote: '', lines: lines }), q.id);
    }); });
  }
  function chqForm() {
    var cs = S().customers;
    H.modal('<h3>شيك جديد</h3><div class="grid g2"><label class="fld"><span>النوع</span><select id="cqD"><option value="in">وارد (من عميل)</option><option value="out">صادر (لمورد/مقاول)</option></select></label><label class="fld"><span>الجهة</span><input id="cqP" list="cqL"><datalist id="cqL">' + cs.map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join('') + '</datalist></label><label class="fld"><span>البنك</span><input id="cqB"></label><label class="fld"><span>رقم الشيك</span><input id="cqN" class="ltr"></label><label class="fld"><span>المبلغ</span><input id="cqA" type="number" min="0" step="any"></label><label class="fld"><span>تاريخ الاستحقاق</span><input id="cqU" type="date"></label><label class="fld"><span>المشروع</span><input id="cqJ"></label><label class="fld"><span>ملاحظة</span><input id="cqT"></label></div><div class="row" style="margin-top:12px"><button class="btn pri" id="cqS" type="button">حفظ</button><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      $('#cqS', m).onclick = function () {
        var amt = n0($('#cqA', m).value); if (!(amt > 0)) return H.toast('أدخل المبلغ'); var nm = $('#cqP', m).value.trim(), cu = cs.filter(function (c) { return c.name === nm; })[0];
        H.api('POST', '/pdocs', { kind: 'chq', doc: { dir: $('#cqD', m).value, party: nm, custId: cu ? cu.id : '', bank: $('#cqB', m).value, chqNo: $('#cqN', m).value, amount: amt, due: $('#cqU', m).value, issued: R.today(), project: $('#cqJ', m).value, note: $('#cqT', m).value } }).then(function (r) { (st.docs.chq = st.docs.chq || []).unshift(r.doc); H.closeModal(); list(); }).catch(H.fail);
      };
    });
  }

  /* ---------- editor (variation order / payment certificate) ---------- */
  function editor() {
    var d = cur(), k = st.sub; if (!d) { st.sel = null; return mount(); }
    var ro = !canW(k) || (k === 'vo' && d.status === 'approved') || (k === 'ipc' && (d.status === 'approved' || d.status === 'paid'));
    var F = function (key, label, ex) { return '<label class="fld"><span>' + label + '</span><input data-yf="' + key + '" value="' + esc(d[key] == null ? '' : d[key]) + '" ' + (ex || '') + '></label>'; };
    var next = { vo: [['draft', 'submitted', 'تقديم للاعتماد'], ['submitted', 'approved', 'اعتماد'], ['submitted', 'rejected', 'رفض'], ['draft', 'approved', 'اعتماد مباشر']], ipc: [['draft', 'approved', 'اعتماد المستخلص'], ['draft', 'rejected', 'رفض'], ['approved', 'paid', 'تسجيل كمدفوع']] }[k];
    var acts = next.filter(function (n) { return n[0] === d.status; }).filter(function (n) { return canW(k) && (n[1] !== 'approved' && n[1] !== 'paid' || P().role === 'admin' || P().role === 'accountant'); }).map(function (n) { return '<button class="btn ' + (n[1] === 'rejected' ? 'danger' : 'pri') + '" type="button" data-a="st" data-to="' + n[1] + '">' + n[2] + '</button>'; }).join('');
    H.main.innerHTML = '<div class="split ag"><section><div class="title-row"><button class="btn sm" type="button" data-a="back">← القائمة</button><h1><bdi dir="ltr">' + esc(d.no) + '</bdi> ' + chip(k, d.status) + '</h1><div class="sp"></div><span class="muted" id="cyState" style="font-size:12px">محفوظ</span></div>' +
      '<div class="card"><div class="grid">' + F('date', 'التاريخ', 'type="date"') + F('client', 'العميل') + F('project', 'المشروع') + F('contractNo', 'العقد المرجعي', 'class="ltr"') + (k === 'ipc' ? F('periodTo', 'الفترة حتى', 'type="date"') : F('title', 'موضوع الأمر')) + F('rep1', 'ممثل المقاول') + '</div></div>' + (k === 'vo' ? voBody(d) : ipcBody(d)) +
      '<div class="card"><label class="fld"><span>ملاحظات</span><textarea data-yf="note" rows="2">' + esc(d.note || '') + '</textarea></label></div><div class="sticky-act">' + acts + '<button class="btn" type="button" data-a="print">طباعة / حفظ PDF</button><button class="btn" type="button" data-a="back">القائمة</button></div></section><aside class="pv"><div class="bar"><b>معاينة</b><span>تتحدث فوراً</span></div><div class="pv-wrap"><div class="sheet" id="sheet"></div></div></aside></div>';
    if (ro) $$('input,textarea,select', H.main).forEach(function (e) { e.disabled = true; }); if (ro) $$('[data-a=addl],[data-a=rml]', H.main).forEach(function (b) { b.hidden = true; });
    draw(); bind();
  }
  function voBody(d) {
    return '<div class="card"><h3>القيمة</h3><div class="grid"><label class="fld"><span>نوع التغيير</span><select data-yf="dir"><option value="add" ' + (d.dir !== 'omit' ? 'selected' : '') + '>زيادة</option><option value="omit" ' + (d.dir === 'omit' ? 'selected' : '') + '>تخفيض</option></select></label><label class="fld"><span>نسبة الضريبة</span><input data-yf="vatRate" type="number" step="any" value="' + esc(d.vatRate) + '"></label><label class="fld"><span>الأثر على المدة (يوم، + تمديد)</span><input data-yf="days" type="number" value="' + esc(d.days || 0) + '"></label><label class="fld"><span>قيمة العقد قبل الأمر</span><input data-yf="before" type="number" step="any" value="' + esc(d.before || 0) + '"></label></div><label class="fld" style="margin-top:10px"><span>المبرر</span><textarea data-yf="reason" rows="2">' + esc(d.reason || '') + '</textarea></label></div><div class="card"><h3>البنود</h3><div class="tablewrap"><table class="t" style="min-width:560px"><thead><tr><th>الوصف</th><th style="width:70px">الوحدة</th><th style="width:80px">الكمية</th><th style="width:110px">السعر</th><th style="width:36px"></th></tr></thead><tbody id="cyL"></tbody></table></div><div class="row" style="margin-top:8px"><button class="btn sm" type="button" data-a="addl">إضافة بند</button></div></div>';
  }
  function ipcBody(d) {
    return '<div class="card"><h3>شروط المستخلص</h3><div class="grid">' + [['vatRate', 'نسبة الضريبة %'], ['advance', 'الدفعة المقدمة المدفوعة (قبل الضريبة)'], ['advPct', 'استرداد الدفعة من المنجز %'], ['retPct', 'استقطاع الضمان %'], ['deduct', 'خصومات أخرى (غرامات…)']].map(function (x) { return '<label class="fld"><span>' + x[1] + '</span><input data-yf="' + x[0] + '" type="number" step="any" min="0" value="' + esc(d[x[0]] || 0) + '"></label>'; }).join('') + '<label class="fld"><span>سبب الخصومات</span><input data-yf="deductNote" value="' + esc(d.deductNote || '') + '"></label></div></div><div class="card"><h3>نسب الإنجاز التراكمية</h3><div class="tablewrap"><table class="t" style="min-width:520px"><thead><tr><th>البند</th><th class="num" style="width:120px">قيمة البند</th><th style="width:100px">الإنجاز %</th><th class="num" style="width:120px">المنجز</th></tr></thead><tbody id="cyL"></tbody></table></div></div><div class="card" id="cySum"></div>';
  }
  function localCalc(d) { return st.sub === 'vo' ? R.voCalc(d) : R.ipcCalc(d, prevCalc(d)); }
  function prevCalc(d) { var seq = n0(d.seq); var p = (st.docs.ipc || []).filter(function (x) { return x.quoteId === d.quoteId && (x.status === 'approved' || x.status === 'paid') && x.seq < seq; }).sort(function (a, b) { return b.seq - a.seq; })[0]; return p ? p.calc : null; }
  function draw() {
    var d = cur(), k = st.sub, body = $('#cyL'); if (!d) return;
    if (k === 'vo' && body && !(d.lines || []).length) d.lines = [{ id: H.uid(), desc: '', unit: 'NO', qty: 1, price: 0 }];
    if (body && !body.dataset.drawn) { body.dataset.drawn = '1'; body.innerHTML = (d.lines || []).map(function (l, i) { return k === 'vo' ? '<tr data-i="' + i + '"><td><input data-yl="desc" value="' + esc(l.desc) + '"></td><td><input data-yl="unit" value="' + esc(l.unit) + '"></td><td><input data-yl="qty" type="number" step="any" value="' + l.qty + '"></td><td><input data-yl="price" type="number" step="any" value="' + l.price + '"></td><td><button class="ib" type="button" data-a="rml" aria-label="حذف">✕</button></td></tr>' : '<tr data-i="' + i + '"><td>' + esc(l.desc) + '</td><td class="num">' + fmt(l.amt) + '</td><td><input data-yl="pct" type="number" min="0" max="100" step="any" value="' + l.pct + '"></td><td class="num" data-done>' + fmt(r2(l.amt * l.pct / 100)) + '</td></tr>'; }).join(''); }
    var c = localCalc(d);
    if (k === 'ipc') { $$('#cyL tr').forEach(function (tr, i) { var e = tr.querySelector('[data-done]'); if (e && c.lines[i]) e.textContent = fmt(c.lines[i].done); }); var s = $('#cySum'); if (s) s.innerHTML = '<div class="grid"><div><span class="muted">المنجز حتى تاريخه</span><br><b>' + fmt(c.work) + '</b> <small class="muted">من ' + fmt(c.contract) + '</small></div><div><span class="muted">هذه الفترة</span><br><b>' + fmt(c.thisWork) + '</b></div><div><span class="muted">استرداد الدفعة / الاستقطاع</span><br><b>' + fmt(c.thisAdv) + ' / ' + fmt(c.thisRet) + '</b></div><div><span class="muted">صافي المستحق شامل الضريبة</span><br><b style="font-size:1.2em">' + fmt(c.payable) + '</b></div></div>'; }
    else if (k === 'vo') { var b = $('#cyL'); }
    var sh = $('#sheet'); if (!sh) return; var o = Object.assign({}, d, { calc: k === 'ipc' ? c : undefined }); sh.innerHTML = k === 'ipc' ? R.ipcDoc(S().settings, o) : R.voDoc(S().settings, o); H.syncFonts(); var w = $('.pv-wrap'); if (w) sh.style.zoom = Math.min(1, (w.clientWidth - 24) / 816);
  }
  function touch() { clearTimeout(st.t); st.dirty = true; setState('جارٍ الحفظ…'); st.t = setTimeout(flush, 700); draw(); }
  function flush(cb) {
    var d = cur(); if (!d || !st.dirty) return cb && cb(); if (st.saving) { st.again = true; return; }
    st.saving = true; st.dirty = false; var k = st.sub;
    H.api('PUT', '/pdocs/' + d.id, { doc: strip(d), status: d.status, _v: d._v }).then(function (r) { d._v = r.doc._v; d.calc = r.doc.calc; d.amount = r.doc.amount; setState('محفوظ'); })
      .catch(function (e) { st.dirty = false; setState(e.message || 'تعذر الحفظ', true); H.fail(e); if (e.status === 409) { st.docs[k] = null; st.sel = null; setTimeout(function () { load(k, mount); }, 1200); } })
      .then(function () { st.saving = false; if (st.again || st.dirty) { st.again = false; st.dirty = true; flush(cb); } else cb && cb(); });
  }
  function bind() {
    var root = H.main;
    root.oninput = root.onchange = function (e) {
      var t = e.target, d = cur(); if (!d) return;
      if (t.dataset.yf) { var v = t.type === 'number' ? (t.value === '' ? 0 : n0(t.value)) : t.value; d[t.dataset.yf] = v; touch(); }
      else if (t.dataset.yl) { var i = +t.closest('tr').dataset.i, l = d.lines[i]; l[t.dataset.yl] = t.type === 'number' ? n0(t.value) : t.value; touch(); }
    };
    root.onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return; var d = cur(); if (!d) return; var a = b.dataset.a;
      if (a === 'back') { clearTimeout(st.t); flush(function () { st.sel = null; mount(); }); }
      else if (a === 'print') { var c = localCalc(d), o = Object.assign({}, d, { calc: st.sub === 'ipc' ? c : undefined }); H.printDoc(st.sub === 'ipc' ? R.ipcDoc(S().settings, o) : R.voDoc(S().settings, o), (st.sub === 'ipc' ? 'مستخلص ' : 'أمر تغيير ') + d.no); }
      else if (a === 'addl') { d.lines.push({ id: H.uid(), desc: '', unit: 'NO', qty: 1, price: 0 }); var tb = $('#cyL'); delete tb.dataset.drawn; draw(); touch(); }
      else if (a === 'rml') { d.lines.splice(+b.closest('tr').dataset.i, 1); var tb2 = $('#cyL'); delete tb2.dataset.drawn; draw(); touch(); }
      else if (a === 'st') { clearTimeout(st.t); var to = b.dataset.to; st.dirty = true; flush(function () { H.api('PUT', '/pdocs/' + d.id, { doc: strip(d), status: to, _v: d._v }).then(function (r) { Object.assign(d, r.doc); editor(); H.toast('تم تغيير الحالة'); }).catch(H.fail); }); }
    };
  }

  /* ---------- receivables aging ---------- */
  function aging() {
    var box = $('#cyBody'), td = R.today(), by = {}, det = [];
    var days = function (a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); };
    S().quotes.filter(function (q) { return q.contract && q.status !== 'lost' && q.status !== 'superseded'; }).forEach(function (q) {
      H.instRows(q).forEach(function (p) {
        if (!(p.rem > 0.004)) return; var key = q.custId || q.client, o = by[key] || (by[key] = { name: H.custName ? H.custName(q.custId) || q.client : q.client, custId: q.custId, nd: 0, b1: 0, b2: 0, b3: 0, b4: 0 });
        var late = p.due && p.due < td ? days(p.due, td) : 0;
        if (!late) o.nd += p.rem; else if (late <= 30) o.b1 += p.rem; else if (late <= 60) o.b2 += p.rem; else if (late <= 90) o.b3 += p.rem; else o.b4 += p.rem;
        if (late) det.push({ q: q, p: p, late: late, name: o.name });
      });
    });
    var rows = Object.keys(by).map(function (k) { var o = by[k]; o.tot = r2(o.nd + o.b1 + o.b2 + o.b3 + o.b4); return o; }).sort(function (a, b) { return (b.b4 + b.b3 + b.b2 + b.b1) - (a.b4 + a.b3 + a.b2 + a.b1); });
    var T = rows.reduce(function (a, o) { ['nd', 'b1', 'b2', 'b3', 'b4', 'tot'].forEach(function (k) { a[k] = r2((a[k] || 0) + o[k]); }); return a; }, {});
    var c = function (v) { return '<td class="num">' + (v ? fmt(v) : '—') + '</td>'; };
    det.sort(function (a, b) { return b.late - a.late; });
    box.innerHTML = '<div class="card"><h3>أعمار الذمم حسب العميل</h3><div class="tablewrap"><table class="t" style="min-width:720px"><thead><tr><th>العميل</th><th class="num">غير مستحق</th><th class="num">1–30 يوم</th><th class="num">31–60</th><th class="num">61–90</th><th class="num">أكثر من 90</th><th class="num">الإجمالي</th></tr></thead><tbody>' + (rows.length ? rows.map(function (o) { return '<tr><td>' + esc(o.name) + '</td>' + c(o.nd) + c(o.b1) + c(o.b2) + c(o.b3) + (o.b4 ? '<td class="num" style="color:var(--bad);font-weight:700">' + fmt(o.b4) + '</td>' : '<td class="num">—</td>') + '<td class="num"><b>' + fmt(o.tot) + '</b></td></tr>'; }).join('') + '<tr class="tot"><td><b>الإجمالي</b></td>' + c(T.nd) + c(T.b1) + c(T.b2) + c(T.b3) + c(T.b4) + '<td class="num"><b>' + fmt(T.tot) + '</b></td></tr>' : '<tr><td colspan="7" class="empty">لا توجد ذمم مستحقة.</td></tr>') + '</tbody></table></div></div>' +
      '<div class="card" style="margin-top:12px"><h3>الدفعات المتأخرة <span class="chip bad">' + det.length + '</span></h3><div class="tablewrap"><table class="t" style="min-width:680px"><thead><tr><th>العميل</th><th>العقد</th><th>الدفعة</th><th>الاستحقاق</th><th class="num">المتبقي</th><th>التأخير</th><th></th></tr></thead><tbody>' + (det.length ? det.map(function (x, i) { return '<tr data-i="' + i + '"><td>' + esc(x.name) + '</td><td><bdi dir="ltr">' + esc(x.q.no) + '</bdi></td><td>' + esc(x.p.label) + '</td><td>' + fmtDate(x.p.due) + '</td><td class="num">' + fmt(x.p.rem) + '</td><td>' + x.late + ' يوم</td><td><button class="btn sm" type="button" data-w="1">تذكير واتساب</button></td></tr>'; }).join('') : '<tr><td colspan="7" class="empty">لا توجد دفعات متأخرة.</td></tr>') + '</tbody></table></div><div class="note" style="margin-top:10px">يفتح زر التذكير رسالة جاهزة في واتساب لتراجعها وترسلها بنفسك.</div></div>';
    box.onclick = function (e) {
      var b = e.target.closest('[data-w]'); if (!b) return; var x = det[+b.closest('tr').dataset.i], cu = S().customers.filter(function (u) { return u.id === x.q.custId; })[0];
      var msg = 'السلام عليكم ' + (x.name || '') + '،\nتذكير ودّي بأن الدفعة «' + x.p.label + '» للمشروع «' + (x.q.project || x.q.no) + '» بمبلغ ' + fmt(x.p.rem) + ' ر.س استحقت بتاريخ ' + fmtDate(x.p.due) + '. نأمل التكرم بإفادتنا بموعد السداد.\nشركة رسس للمقاولات العامة';
      var u = wa(cu && (cu.phone || cu.mobile), msg); if (u) window.open(u, '_blank', 'noopener'); else { navigator.clipboard && navigator.clipboard.writeText(msg); H.toast('لا يوجد رقم جوال للعميل؛ نُسخت الرسالة'); }
    };
  }
  window.CYC = { mount: mount, contractNow: contractNow, loadVO: function (cb) { load('vo', cb); } };
})();
