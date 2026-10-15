/* Finance tools: profitability card in the quote editor, supplier price import, tax invoices (ZATCA phase-1 QR), cash-flow forecast
   and profitability reports. Costs are only ever loaded for roles with the seeCost permission (the server strips them for others). */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc, n0 = R.n0, r2 = R.r2, fmt = R.fmt, fmtDate = R.fmtDate, norm = R.norm;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var S = function () { return H.S(); };
  var inv = { list: null, month: R.today().slice(0, 7), q: '' };

  /* ---------- profitability card (quote screen) ---------- */
  function card() {
    var box = $('#fincard'); if (!box) return;
    var q = H.curQ(), p = H.P(); if (!q || !p.seeCost) { box.innerHTML = ''; return; }
    var m = R.margin(q), st = S().settings, min = n0(st.minMarginPct), tgt = n0(st.targetMarginPct);
    if (!m.lines) { box.innerHTML = ''; return; }
    var pct = m.pct, cls = pct == null ? '' : pct < min ? 'bad' : pct < tgt ? 'warn' : 'ok';
    box.innerHTML = '<div class="card"><h3>الربحية <span class="muted" style="font-weight:400;font-size:12px">تظهر للمدير والمحاسب فقط</span></h3><div class="kpis">' +
      '<div class="kpi"><small>الإيراد قبل الضريبة</small><b>' + fmt(m.rev) + '</b><small>بعد الخصم</small></div>' +
      '<div class="kpi"><small>التكلفة</small><b>' + fmt(m.cost) + '</b><small>' + m.costed + ' من ' + m.lines + ' بند</small></div>' +
      '<div class="kpi"><small>الهامش</small><b>' + fmt(m.margin) + '</b><small><span class="chip ' + cls + '">' + (pct == null ? '—' : r2(pct) + '%') + '</span></small></div></div>' +
      (m.costed < m.lines ? '<div class="note" style="margin-top:10px">' + (m.lines - m.costed) + ' بند بلا تكلفة، والهامش محسوب على البنود المكلَّفة فقط (' + Math.round(m.cover * 100) + '% من الإيراد). أدخل التكلفة من المكتبة أو من حقل «التكلفة» في كل سطر.</div>' : '') +
      (pct != null && min > 0 && pct < min ? '<div class="note bad" style="margin-top:10px">الهامش أقل من الحد الأدنى المعتمد (' + min + '%)، ولا يستطيع مسؤول المبيعات إرسال هذا العرض قبل مراجعتك.</div>' : '') + '</div>';
  }

  /* ---------- supplier price list import ---------- */
  function priceImport() {
    var P = H.P(); if (!P.itemsWrite) return H.toast('ليس لديك صلاحية تعديل المكتبة');
    H.modal('<h3>تحديث الأسعار من ملف مورد</h3><p class="muted" style="margin-top:0;font-size:12.5px">ارفع ملف CSV بالأعمدة: الوصف، ثم سعر البيع الجديد (اختياري)، ثم التكلفة (اختياري). يُطابَق كل سطر مع صنف المكتبة بالوصف تماماً، ثم تُراجع التغييرات قبل التطبيق.</p><label class="btn" style="cursor:pointer">اختيار ملف CSV<input type="file" id="pif" accept=".csv,.txt,text/csv" hidden></label><div id="pip" style="margin-top:12px"></div><div class="row" style="margin-top:12px"><button class="btn pri" id="pia" type="button" disabled>تطبيق التغييرات</button><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      var changes = [];
      $('#pif', m).addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        f.text().then(function (t) {
          var rows = parseCSV(t), byDesc = {}; S().items.forEach(function (i) { byDesc[norm(i.desc)] = i; });
          var miss = 0; changes = [];
          rows.forEach(function (r, i) {
            if (r.length < 2) return; var it = byDesc[norm(r[0])]; var price = r[1] !== '' && r[1] != null ? parseFloat(String(r[1]).replace(/,/g, '')) : NaN, cost = r[2] ? parseFloat(String(r[2]).replace(/,/g, '')) : NaN;
            if (!it) { if (i > 0 || isFinite(price)) miss++; return; }
            var ch = { it: it, price: isFinite(price) && price >= 0 ? price : null, cost: isFinite(cost) && cost >= 0 && H.P().seeCost ? cost : null };
            if ((ch.price != null && ch.price !== it.price) || (ch.cost != null && ch.cost !== (it.cost || 0))) changes.push(ch);
          });
          $('#pip', m).innerHTML = changes.length ? '<div class="tablewrap" style="max-height:260px;overflow:auto"><table class="t"><thead><tr><th>الصنف</th><th class="num">السعر</th><th class="num">التكلفة</th></tr></thead><tbody>' + changes.map(function (c) { return '<tr><td>' + esc(c.it.desc) + '</td><td class="num">' + (c.price != null ? fmt(c.it.price) + ' ← <b>' + fmt(c.price) + '</b>' : '—') + '</td><td class="num">' + (c.cost != null ? fmt(c.it.cost || 0) + ' ← <b>' + fmt(c.cost) + '</b>' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' + (miss ? '<p class="muted" style="font-size:12px">' + miss + ' سطر لم يُطابق أي صنف وتم تجاهله.</p>' : '') : '<div class="empty">لا تغييرات للتطبيق' + (miss ? ' (' + miss + ' سطر بلا مطابقة)' : '') + '</div>';
          $('#pia', m).disabled = !changes.length;
        });
      });
      $('#pia', m).onclick = function () { changes.forEach(function (c) { if (c.price != null) { c.it.price = c.price; delete c.it.est; } if (c.cost != null) { if (c.cost > 0) c.it.cost = c.cost; else delete c.it.cost; } }); H.saveS(); H.closeModal(); H.render(); H.toast('حُدّث ' + changes.length + ' صنف'); };
    });
  }
  function parseCSV(t) {
    var rows = [], row = [], c = '', q = false; t = t.replace(/^﻿/, '');
    for (var i = 0; i < t.length; i++) { var ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',' || ch === '\t' || ch === ';') { row.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(c); c = ''; if (row.some(function (x) { return x.trim(); })) rows.push(row); row = []; } else c += ch; }
    row.push(c); if (row.some(function (x) { return x.trim(); })) rows.push(row); return rows;
  }
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-fin]'); if (!b) return; if (b.dataset.fin === 'priceimp') priceImport(); });

  /* ---------- reports: cash flow + profitability ---------- */
  function extra(box) {
    if (!box) return; var s = S(), p = H.P(), td = R.today(), h = '';
    var buckets = {}, overdue = 0, undated = 0, order = [];
    s.quotes.filter(function (q) { return q.contract && q.status !== 'lost'; }).forEach(function (q) {
      H.instRows(q).forEach(function (r) { if (r.rem <= 0.004) return; if (!r.due) { undated += r.rem; return; } if (r.due < td) { overdue += r.rem; return; } var k = r.due.slice(0, 7); if (!buckets[k]) { buckets[k] = 0; order.push(k); } buckets[k] = r2(buckets[k] + r.rem); });
    });
    order.sort(); var max = Math.max.apply(null, order.map(function (k) { return buckets[k]; }).concat([overdue, undated, 1])), sum = r2(order.reduce(function (a, k) { return a + buckets[k]; }, 0) + overdue + undated);
    var bar = function (label, v, cls) { return '<tr><td style="width:120px">' + label + '</td><td><div class="cfbar ' + (cls || '') + '" style="width:' + Math.max(2, Math.round(v / max * 100)) + '%"></div></td><td class="num" style="width:130px">' + fmt(v) + '</td></tr>'; };
    h += '<div class="card"><h3>التدفق النقدي المتوقع (المتبقي على العقود)</h3><div class="tablewrap"><table class="t" style="min-width:420px"><tbody>' + (overdue > 0 ? bar('متأخرة', overdue, 'bad') : '') + order.map(function (k) { return bar(k, buckets[k]); }).join('') + (undated > 0 ? bar('بلا تاريخ استحقاق', undated, 'mute') : '') + (sum > 0 ? '<tr class="k"><td><b>الإجمالي المتبقي</b></td><td></td><td class="num"><b>' + fmt(sum) + '</b></td></tr>' : '<tr><td colspan="3" class="empty">لا مستحقات متبقية على العقود</td></tr>') + '</tbody></table></div><p class="muted" style="font-size:12px;margin:8px 0 0">يعتمد على تواريخ الاستحقاق في جداول الدفعات؛ أدخل التواريخ ليصبح التوقع أدق.</p></div>';
    if (p.seeCost) {
      var rows = s.quotes.filter(function (q) { return q.status === 'won' || q.contract; }).map(function (q) { var m = R.margin(q); return { q: q, m: m }; }).filter(function (x) { return x.m.costed > 0; }).sort(function (a, b) { return b.m.margin - a.m.margin; });
      var tr = r2(rows.reduce(function (a, x) { return a + x.m.revCosted; }, 0)), tm = r2(rows.reduce(function (a, x) { return a + x.m.margin; }, 0));
      h += '<div class="card"><h3>ربحية العروض المعتمدة والعقود</h3>' + (rows.length ? '<div class="tablewrap"><table class="t" style="min-width:640px"><thead><tr><th>العرض</th><th>العميل</th><th class="num">الإيراد</th><th class="num">التكلفة</th><th class="num">الهامش</th><th class="num">%</th></tr></thead><tbody>' + rows.slice(0, 40).map(function (x) { var pc = x.m.pct; return '<tr><td><bdi dir="ltr">' + esc(x.q.no) + '</bdi></td><td>' + esc(x.q.client) + '</td><td class="num">' + fmt(x.m.revCosted) + '</td><td class="num">' + fmt(x.m.cost) + '</td><td class="num">' + fmt(x.m.margin) + '</td><td class="num"><span class="chip ' + (pc < n0(s.settings.minMarginPct) ? 'bad' : pc < n0(s.settings.targetMarginPct) ? 'warn' : 'ok') + '">' + r2(pc) + '%</span></td></tr>'; }).join('') + '<tr class="k"><td colspan="2"><b>الإجمالي</b></td><td class="num"><b>' + fmt(tr) + '</b></td><td class="num"><b>' + fmt(r2(tr - tm)) + '</b></td><td class="num"><b>' + fmt(tm) + '</b></td><td class="num"><b>' + (tr ? r2(tm / tr * 100) : 0) + '%</b></td></tr></tbody></table></div>' : '<div class="empty">لا توجد عروض معتمدة بتكاليف مدخلة بعد. أدخل التكلفة في المكتبة (عمود التكلفة).</div>') + '</div>';
    }
    var d = document.createElement('div'); d.innerHTML = h; while (d.firstChild) box.appendChild(d.firstChild);
  }

  /* ---------- tax invoices ---------- */
  var up = function () { return H.api('GET', '/invoices').then(function (r) { inv.list = r.invoices; }); };
  function mountInvoices() {
    var w = H.P().invoicesWrite;
    H.main.innerHTML = '<div class="title-row"><h1>الفواتير الضريبية</h1><div class="sp"></div><button class="btn" type="button" id="invX">تصدير CSV</button>' + (w ? '<button class="btn pri" type="button" id="invNew">فاتورة جديدة</button>' : '') + '</div>' +
      '<div class="note" style="margin-bottom:12px">تغطي هذه الشاشة متطلبات مرحلة الإصدار (الأولى) من الفوترة الإلكترونية: فاتورة ضريبية بتسلسل رقمي وبيانات البائع والمشتري ورمز QR. الربط مع منصة «فاتورة» (مرحلة الربط والتكامل) يحتاج حلاً معتمداً ولا تغطيه هذه الشاشة. الفاتورة الصادرة لا تُعدَّل ولا تُحذف، ويُصحَّح الخطأ بإشعار دائن.</div>' +
      '<div id="invK"></div><div class="card"><div class="row" style="margin-bottom:12px"><input id="invQ" placeholder="ابحث برقم الفاتورة أو العميل" style="max-width:320px"><input id="invM" type="month" value="' + inv.month + '" style="width:auto"><label class="chk"><input id="invAll" type="checkbox"> كل الفترات</label></div><div class="tablewrap"><table class="t" style="min-width:760px"><thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>المرجع</th><th class="num">قبل الضريبة</th><th class="num">الضريبة</th><th class="num">الإجمالي</th><th></th></tr></thead><tbody id="invR"><tr><td colspan="8" class="empty">جارٍ التحميل…</td></tr></tbody></table></div></div>';
    var draw = function () {
      if (!inv.list) return; var f = norm($('#invQ').value), all = $('#invAll').checked; inv.month = $('#invM').value || inv.month;
      var rows = inv.list.filter(function (v) { return (all || String(v.date).slice(0, 7) === inv.month) && (!f || norm(v.no + ' ' + (v.buyer && v.buyer.name) + ' ' + (v.refNo || '')).indexOf(f) >= 0); });
      var sg = function (v) { return v.kind === 'credit' ? -1 : 1; };
      var sub = r2(rows.reduce(function (a, v) { return a + sg(v) * v.subtotal; }, 0)), vat = r2(rows.reduce(function (a, v) { return a + sg(v) * v.vat; }, 0));
      $('#invK').innerHTML = '<div class="kpis" style="margin-bottom:14px"><div class="kpi"><small>عدد المستندات</small><b>' + rows.length + '</b><small>&nbsp;</small></div><div class="kpi"><small>الصافي قبل الضريبة</small><b>' + fmt(sub) + '</b><small>بعد خصم الإشعارات الدائنة</small></div><div class="kpi"><small>ضريبة المخرجات</small><b>' + fmt(vat) + '</b><small>للإقرار الضريبي</small></div><div class="kpi"><small>الإجمالي</small><b>' + fmt(r2(sub + vat)) + '</b><small>&nbsp;</small></div></div>';
      $('#invR').innerHTML = rows.length ? rows.map(function (v) { return '<tr data-id="' + v.id + '"><td><b><bdi dir="ltr">' + esc(v.no) + '</bdi></b>' + (v.kind === 'credit' ? ' <span class="chip warn">إشعار دائن</span>' : '') + '</td><td>' + fmtDate(v.date) + '</td><td>' + esc(v.buyer && v.buyer.name) + '</td><td>' + esc(v.refNo || v.contractNo || '') + '</td><td class="num">' + fmt(v.subtotal) + '</td><td class="num">' + fmt(v.vat) + '</td><td class="num"><b>' + (v.kind === 'credit' ? '- ' : '') + fmt(v.total) + '</b></td><td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" type="button" data-inv="view">فتح</button>' + (w && v.kind === 'invoice' ? '<button class="btn sm" type="button" data-inv="credit">إشعار دائن</button>' : '') + '</div></td></tr>'; }).join('') : '<tr><td colspan="8" class="empty">لا توجد فواتير في هذه الفترة.</td></tr>';
    };
    $('#invQ').addEventListener('input', draw); $('#invM').addEventListener('change', draw); $('#invAll').addEventListener('change', draw);
    $('#invR').addEventListener('click', function (e) { var b = e.target.closest('[data-inv]'); if (!b) return; var v = inv.list.filter(function (x) { return x.id === b.closest('tr').dataset.id; })[0]; if (b.dataset.inv === 'view') showInvoice(v); else invoiceForm({ credit: v }); });
    if ($('#invNew')) $('#invNew').onclick = function () { invoiceForm({}); };
    $('#invX').onclick = function () {
      var rows = (inv.list || []).map(function (v) { return [v.no, v.kind === 'credit' ? 'إشعار دائن' : 'فاتورة', v.date, v.buyer && v.buyer.name, v.buyer && v.buyer.vat, v.refNo || '', v.subtotal, v.vat, v.total]; });
      H.download('الفواتير.csv', '﻿' + [['الرقم', 'النوع', 'التاريخ', 'العميل', 'الرقم الضريبي', 'المرجع', 'قبل الضريبة', 'الضريبة', 'الإجمالي']].concat(rows).map(function (r) { return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n'), 'text/csv;charset=utf-8');
    };
    up().then(draw).catch(function (e) { H.fail(e); $('#invR').innerHTML = '<tr><td colspan="8" class="empty">تعذر تحميل الفواتير</td></tr>'; });
  }
  function docOf(v) {
    var q = v.qid && S().quotes.filter(function (x) { return x.id === v.qid; })[0];
    return R.invoiceDoc(S().settings, Object.assign({}, v, { contractNo: q ? q.no : '' }));
  }
  function showInvoice(v) {
    H.modal('<div class="pv-wrap" style="max-height:70vh;overflow:auto"><div class="sheet" id="invSheet" style="width:816px;transform-origin:top right"></div></div><div class="row"><button class="btn pri" id="invP" type="button">طباعة / PDF</button><button class="btn" data-act="modal-close" type="button">إغلاق</button></div>', function (m) {
      m.firstElementChild.style.width = 'min(900px,100%)'; var sh = $('#invSheet', m); sh.innerHTML = docOf(v); H.syncFonts();
      var fit = function () { sh.style.zoom = Math.min(1, (m.firstElementChild.clientWidth - 60) / 816); }; fit();
      $('#invP', m).onclick = function () { H.printDoc(docOf(v), (v.kind === 'credit' ? 'إشعار دائن ' : 'فاتورة ضريبية ') + v.no); };
    });
  }
  function invoiceForm(o) {
    var s = S(), st = s.settings, credit = o.credit, cust = s.customers, vr = n0(st.vatRate) || 15;
    var lines = credit ? credit.lines.map(function (l) { return { desc: l.desc, unit: l.unit, qty: l.qty, price: l.price, vatRate: l.vatRate }; }) : [{ desc: '', unit: 'NO', qty: 1, price: '', vatRate: vr }];
    var buyer = credit ? Object.assign({}, credit.buyer) : { name: '', vat: '', cr: '', address: '' };
    var sel = { custId: credit ? credit.custId : '', qid: credit ? credit.qid : '', payId: credit ? credit.payId : '' };
    var cons = function () { return s.quotes.filter(function (q) { return q.contract && q.custId === sel.custId && q.status !== 'lost'; }); };
    H.modal('<h3>' + (credit ? 'إشعار دائن للفاتورة ' + esc(credit.no) : 'فاتورة ضريبية جديدة') + '</h3><div id="ivb"></div><div class="auth-err" id="ive" hidden></div><div class="row" style="margin-top:12px"><button class="btn pri" id="ivok" type="button">إصدار</button><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      m.firstElementChild.style.width = 'min(980px,100%)';
      var draw = function () {
        var ql = cons(), q = ql.filter(function (x) { return x.id === sel.qid; })[0], ins = q ? H.instRows(q) : [];
        $('#ivb', m).innerHTML = '<div class="grid g2">' + (credit ? '' : '<label class="fld"><span>العميل</span><select id="ivc"><option value="">— عميل غير مسجل / اختر —</option>' + cust.map(function (c) { return '<option value="' + c.id + '" ' + (sel.custId === c.id ? 'selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
          '<label class="fld"><span>العقد (اختياري)</span><select id="ivq"><option value="">— بدون عقد —</option>' + ql.map(function (x) { return '<option value="' + x.id + '" ' + (sel.qid === x.id ? 'selected' : '') + '>' + esc(x.no + ' - ' + (x.project || x.client)) + '</option>'; }).join('') + '</select></label>' +
          '<label class="fld"><span>الدفعة (تعبئة تلقائية بالمتبقي)</span><select id="ivp"><option value="">— بدون —</option>' + ins.map(function (p) { return '<option value="' + p.id + '" ' + (sel.payId === p.id ? 'selected' : '') + '>' + esc(p.label) + ' — المتبقي ' + fmt(p.rem) + '</option>'; }).join('') + '</select></label>') +
          '<label class="fld"><span>تاريخ الإصدار</span><input id="ivd" type="date" value="' + (o.date || R.today()) + '"></label></div>' +
          '<div class="grid g2" style="margin-top:10px"><label class="fld"><span>اسم المشتري</span><input id="ivn" value="' + esc(buyer.name) + '"></label><label class="fld"><span>الرقم الضريبي للمشتري (15 رقماً، إن وُجد)</span><input id="ivv" class="ltr" value="' + esc(buyer.vat) + '" maxlength="15"></label><label class="fld" style="grid-column:1/-1"><span>عنوان المشتري</span><input id="iva" value="' + esc(buyer.address) + '"></label></div>' +
          (credit ? '<label class="fld" style="margin-top:10px"><span>سبب الإشعار الدائن</span><input id="ivr" placeholder="مثال: إلغاء جزء من الأعمال / تصحيح سعر"></label>' : '') +
          '<div class="tablewrap" style="margin-top:12px"><table class="t" style="min-width:760px"><thead><tr><th>الوصف</th><th style="width:70px">الوحدة</th><th style="width:80px">الكمية</th><th style="width:120px">سعر الوحدة (قبل الضريبة)</th><th style="width:70px">الضريبة %</th><th class="num" style="width:110px">الإجمالي</th><th style="width:36px"></th></tr></thead><tbody>' +
          lines.map(function (l, i) { return '<tr data-i="' + i + '"><td><input data-k="desc" value="' + esc(l.desc) + '"></td><td><input data-k="unit" value="' + esc(l.unit) + '"></td><td><input data-k="qty" type="number" min="0" step="any" value="' + l.qty + '"></td><td><input data-k="price" type="number" min="0" step="any" value="' + l.price + '"></td><td><input data-k="vatRate" type="number" min="0" step="any" value="' + l.vatRate + '"></td><td class="num" data-t></td><td><button class="ib" type="button" data-rm="' + i + '" aria-label="حذف">✕</button></td></tr>'; }).join('') +
          '</tbody></table></div><div class="row" style="margin-top:8px"><button class="btn sm" type="button" id="ivadd">إضافة سطر</button><span class="sp"></span><span id="ivt" style="font-weight:700"></span></div>' +
          '<label class="fld" style="margin-top:10px"><span>ملاحظات الفاتورة</span><textarea id="ivno" rows="2">' + esc(o.note != null ? o.note : (credit ? '' : (st.invNote || ''))) + '</textarea></label>';
        tot();
        var c = $('#ivc', m); if (c) c.onchange = function () { keep(); sel.custId = this.value; sel.qid = ''; sel.payId = ''; var cu = cust.filter(function (x) { return x.id === sel.custId; })[0]; if (cu) buyer = { name: cu.name, vat: cu.vat || '', cr: cu.cr || '', address: cu.address || '' }; draw(); };
        var qs = $('#ivq', m); if (qs) qs.onchange = function () { keep(); sel.qid = this.value; sel.payId = ''; draw(); };
        var ps = $('#ivp', m); if (ps) ps.onchange = function () {
          keep(); sel.payId = this.value; var qq = ql.filter(function (x) { return x.id === sel.qid; })[0], pr = qq && H.instRows(qq).filter(function (x) { return x.id === sel.payId; })[0];
          if (pr) { var rate = vr; lines = [{ desc: 'دفعة «' + pr.label + '» من عقد ' + qq.no + (qq.project ? ' - ' + qq.project : ''), unit: 'دفعة', qty: 1, price: R.r2(pr.rem / (1 + rate / 100) * 10000) / 10000, vatRate: rate }]; }
          draw();
        };
        $('#ivadd', m).onclick = function () { keep(); lines.push({ desc: '', unit: 'NO', qty: 1, price: '', vatRate: vr }); draw(); };
        $$('[data-rm]', m).forEach(function (b) { b.onclick = function () { keep(); lines.splice(+b.dataset.rm, 1); if (!lines.length) lines.push({ desc: '', unit: 'NO', qty: 1, price: '', vatRate: vr }); draw(); }; });
        $$('tbody input', m).forEach(function (i) { i.oninput = function () { keep(); tot(); }; });
      };
      function keep() {
        $$('#ivb tbody tr', m).forEach(function (tr) { var l = lines[+tr.dataset.i]; if (!l) return; $$('input', tr).forEach(function (i) { l[i.dataset.k] = ['qty', 'price', 'vatRate'].indexOf(i.dataset.k) >= 0 ? (i.value === '' ? '' : n0(i.value)) : i.value; }); });
        var g = function (id) { var e = $(id, m); return e ? e.value : null; };
        if (g('#ivn') != null) { buyer.name = g('#ivn'); buyer.vat = g('#ivv'); buyer.address = g('#iva'); o.date = g('#ivd'); o.note = g('#ivno'); }
      }
      function tot() {
        var sub = 0, vat = 0; $$('#ivb tbody tr', m).forEach(function (tr) { var l = lines[+tr.dataset.i]; var net = r2(n0(l.qty) * n0(l.price)), v = r2(net * n0(l.vatRate) / 100); sub += net; vat += v; var c = $('[data-t]', tr); if (c) c.textContent = fmt(net + v); });
        var t = $('#ivt', m); if (t) t.textContent = 'قبل الضريبة ' + fmt(sub) + ' + ضريبة ' + fmt(vat) + ' = ' + fmt(r2(sub + vat)) + ' ر.س';
      }
      draw();
      $('#ivok', m).onclick = function () {
        keep(); var er = $('#ive', m); er.hidden = true;
        var body = { kind: credit ? 'credit' : 'invoice', date: o.date, custId: sel.custId, qid: sel.qid, payId: sel.payId, buyer: buyer, lines: lines.filter(function (l) { return l.desc && n0(l.qty) > 0 && n0(l.price) > 0; }), note: o.note, refId: credit ? credit.id : '', reason: credit ? ($('#ivr', m) || {}).value : '' };
        this.disabled = true; var btn = this;
        H.api('POST', '/invoices', body).then(function (r) { if (r.counters && r.counters.invNext) S().settings.invNext = r.counters.invNext; inv.list = null; H.closeModal(); H.toast('صدر المستند ' + r.invoice.no); mountInvoices(); showInvoice(r.invoice); }).catch(function (e) { btn.disabled = false; er.textContent = e.message; er.hidden = false; });
      };
    });
  }
  window.FIN = { card: card, extra: extra, mountInvoices: mountInvoices };
})();
