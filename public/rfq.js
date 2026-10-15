/* Supplier price requests (RFQ): lines from a quote, offers per supplier, comparison, apply chosen costs. */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc, n0 = R.n0, r2 = R.r2, fmt = R.fmt, fmtDate = R.fmtDate;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var S = function () { return H.S(); };
  var st = { list: null, sel: null, t: null, dirty: false, saving: false, again: false };
  var STAT = { draft: ['مسودة', ''], sent: ['أُرسل للموردين', 'warn'], closed: ['مُغلق', 'ok'] };
  var cur = function () { return (st.list || []).filter(function (d) { return d.id === st.sel; })[0] || null; };
  var setState = function (t, bad) { var e = $('#rqState'); if (e) { e.textContent = t; e.style.color = bad ? 'var(--bad)' : ''; } };
  var strip = function (d) { var o = {}; Object.keys(d).forEach(function (k) { if (k[0] !== '_' && ['id', 'no', 'status', 'kind', 'amount', 'quoteId', 'custId'].indexOf(k) < 0) o[k] = d[k]; }); o.quoteId = d.quoteId || ''; return o; };
  var wa = function (phone, text) { var p = String(phone || '').replace(/\D/g, ''); if (/^05\d{8}$/.test(p)) p = '966' + p.slice(1); else if (/^5\d{8}$/.test(p)) p = '966' + p; return 'https://wa.me/' + (p || '') + '?text=' + encodeURIComponent(text); };
  var canW = function () { return H.P().seeCost && H.P().pdocs === 'write'; };

  function mount() {
    if (st.sel && cur()) return editor();
    st.sel = null;
    H.main.innerHTML = '<div class="title-row"><h1>طلبات الأسعار من الموردين</h1><div class="sp"></div>' + (canW() ? '<button class="btn pri" type="button" id="rqNew">طلب أسعار جديد</button>' : '') + '</div><div class="note" style="margin-bottom:12px">ابنِ جدولاً من بنود عرض السعر، أرسله للموردين عبر واتساب، سجّل ردودهم، وقارن بينها، ثم انقل الأسعار المختارة كتكلفة إلى المكتبة والعرض.</div><div class="card"><div class="tablewrap"><table class="t" style="min-width:640px"><thead><tr><th>الرقم</th><th>العنوان</th><th>المشروع</th><th class="num">البنود</th><th class="num">الموردون</th><th>الحالة</th><th></th></tr></thead><tbody id="rqR"><tr><td colspan="7" class="empty">جارٍ التحميل…</td></tr></tbody></table></div></div>';
    var draw = function () {
      $('#rqR').innerHTML = st.list.length ? st.list.map(function (d) { var s = STAT[d.status] || STAT.draft; return '<tr data-id="' + d.id + '"><td><b><bdi dir="ltr">' + esc(d.no) + '</bdi></b></td><td>' + esc(d.title) + '</td><td>' + esc(d.project) + '</td><td class="num">' + d.lines.length + '</td><td class="num">' + d.suppliers.length + '</td><td><span class="chip ' + s[1] + '">' + s[0] + '</span></td><td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" type="button" data-a="open">فتح</button>' + (canW() ? '<button class="btn sm danger" type="button" data-a="del">حذف</button>' : '') + '</div></td></tr>'; }).join('') : '<tr><td colspan="7" class="empty">لا توجد طلبات أسعار.</td></tr>';
    };
    if ($('#rqNew')) $('#rqNew').onclick = newModal;
    $('#rqR').onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return; var d = st.list.filter(function (x) { return x.id === b.closest('tr').dataset.id; })[0];
      if (b.dataset.a === 'open') { st.sel = d.id; editor(); }
      else if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'تأكيد'; setTimeout(function () { if (b.isConnected) { b.classList.remove('armed'); b.textContent = 'حذف'; } }, 3000); }
      else H.api('DELETE', '/pdocs/' + d.id).then(function () { st.list = st.list.filter(function (x) { return x.id !== d.id; }); draw(); }).catch(H.fail);
    };
    if (st.list) draw(); else H.api('GET', '/pdocs?kind=rfq').then(function (r) { st.list = r.docs; draw(); }).catch(H.fail);
  }
  function prevSuppliers() { var m = {}; (st.list || []).forEach(function (d) { d.suppliers.forEach(function (s) { m[s.name] = s.phone; }); }); return Object.keys(m).map(function (n) { return { name: n, phone: m[n] }; }); }
  function newModal() {
    var qs = S().quotes.filter(function (q) { return q.status !== 'superseded'; });
    H.modal('<h3>طلب أسعار جديد</h3><label class="fld"><span>العنوان</span><input id="rnT" placeholder="مثال: أسعار كواشف ولوحات مشروع برج الرياض"></label><label class="fld" style="margin-top:10px"><span>تعبئة البنود من عرض سعر (اختياري)</span><select id="rnQ"><option value="">— جدول فارغ —</option>' + qs.map(function (q) { return '<option value="' + q.id + '">' + esc(q.no + ' - ' + (q.client || '') + (q.project ? ' - ' + q.project : '')) + '</option>'; }).join('') + '</select></label><div class="row" style="margin-top:12px"><button class="btn pri" id="rnS" type="button">إنشاء</button><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      $('#rnS', m).onclick = function () {
        var q = S().quotes.filter(function (x) { return x.id === $('#rnQ', m).value; })[0], lines = [];
        if (q) { var seen = {}; q.lines.forEach(function (l) { var key = l.lib || l.desc; if (seen[key]) { seen[key].qty += n0(l.qty); return; } seen[key] = { id: H.uid(), desc: l.desc, unit: l.unit, qty: n0(l.qty), lib: l.lib || '' }; lines.push(seen[key]); }); }
        H.api('POST', '/pdocs', { kind: 'rfq', doc: { title: $('#rnT', m).value || (q ? 'أسعار ' + q.project : 'طلب أسعار'), quoteId: q ? q.id : '', client: q ? q.client : '', project: q ? q.project : '', date: R.today(), lines: lines, suppliers: [], offers: {}, chosen: {} } }).then(function (r) { H.closeModal(); st.list.unshift(r.doc); st.sel = r.doc.id; editor(); }).catch(H.fail);
      };
    });
  }

  function best(d, lid) { var min = null, who = ''; d.suppliers.forEach(function (s) { var p = n0((d.offers[s.id] || {})[lid]); if (p > 0 && (min == null || p < min)) { min = p; who = s.id; } }); return { price: min, sup: who }; }
  function editor() {
    var d = cur(); if (!d) { st.sel = null; return mount(); } var ro = !canW();
    H.main.innerHTML = '<div class="title-row"><button class="btn sm" type="button" data-a="back">← الطلبات</button><h1><bdi dir="ltr">' + esc(d.no) + '</bdi></h1><select data-a="status" ' + (ro ? 'disabled' : '') + '>' + Object.keys(STAT).map(function (k) { return '<option value="' + k + '" ' + (d.status === k ? 'selected' : '') + '>' + STAT[k][0] + '</option>'; }).join('') + '</select><div class="sp"></div><span class="muted" id="rqState" style="font-size:12px">محفوظ</span></div>' +
      '<div class="card"><div class="grid"><label class="fld"><span>العنوان</span><input data-qf="title" value="' + esc(d.title) + '"></label><label class="fld"><span>المشروع</span><input data-qf="project" value="' + esc(d.project) + '"></label><label class="fld"><span>التاريخ</span><input data-qf="date" type="date" value="' + esc(d.date) + '"></label></div></div>' +
      '<div class="card"><h3>الموردون</h3><div id="rqS"></div><div class="row" style="margin-top:8px"><input id="rqSn" list="rqSl" placeholder="اسم المورد" style="max-width:240px"><datalist id="rqSl">' + prevSuppliers().map(function (s) { return '<option value="' + esc(s.name) + '">'; }).join('') + '</datalist><input id="rqSp" class="ltr" placeholder="جوال (اختياري)" style="max-width:180px"><button class="btn sm" type="button" data-a="addsup">إضافة مورد</button></div></div>' +
      '<div class="card"><h3>مقارنة العروض</h3><div class="tablewrap"><table class="t" id="rqT" style="min-width:720px"></table></div><div class="row" style="margin-top:10px"><button class="btn sm" type="button" data-a="addline">إضافة بند</button><button class="btn sm" type="button" data-a="cheapest">اختيار الأرخص تلقائياً</button><button class="btn sm pri" type="button" data-a="apply">اعتماد الأسعار المختارة كتكلفة</button><button class="btn sm" type="button" data-a="print">طباعة المقارنة</button></div></div>';
    if (ro) $$('input,select,textarea', H.main).forEach(function (e) { e.disabled = true; });
    drawSup(); drawT(); bind();
  }
  function drawSup() {
    var d = cur(), box = $('#rqS'); if (!box) return;
    box.innerHTML = d.suppliers.length ? '<div class="tablewrap"><table class="t"><tbody>' + d.suppliers.map(function (s, i) { return '<tr data-si="' + i + '"><td><b>' + esc(s.name) + '</b> <small class="muted ltr">' + esc(s.phone || '') + '</small></td><td style="width:230px"><button class="btn sm" type="button" data-a="wa">إرسال الطلب واتساب</button> <button class="ib" type="button" data-a="rmsup" aria-label="حذف">✕</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="muted">أضف مورداً واحداً على الأقل.</div>';
  }
  function drawT() {
    var d = cur(), t = $('#rqT'); if (!t) return; var tot = {};
    d.suppliers.forEach(function (s) { tot[s.id] = 0; });
    var body = d.lines.map(function (l, i) {
      var b = best(d, l.id), ch = d.chosen[l.id] || '';
      return '<tr data-li="' + i + '"><td style="min-width:200px"><input data-qf="ld" value="' + esc(l.desc) + '" ' + '></td><td style="width:60px"><input data-qf="lu" value="' + esc(l.unit) + '"></td><td style="width:70px"><input data-qf="lq" type="number" step="any" value="' + l.qty + '"></td>' +
        d.suppliers.map(function (s) { var p = n0((d.offers[s.id] || {})[l.id]); if (p > 0 && ch === s.id) tot[s.id] += p * n0(l.qty); return '<td style="min-width:110px;' + (p > 0 && p === b.price ? 'background:var(--ok-bg,#ecfdf3);' : '') + '"><div class="row" style="flex-wrap:nowrap;gap:4px"><input type="radio" name="ch' + i + '" data-qf="pick" data-sup="' + s.id + '" ' + (ch === s.id ? 'checked' : '') + ' style="width:auto" aria-label="اختيار"><input data-qf="offer" data-sup="' + s.id + '" type="number" min="0" step="any" value="' + (p || '') + '" placeholder="—"></div></td>'; }).join('') + '<td><button class="ib" type="button" data-a="rmline" aria-label="حذف">✕</button></td></tr>';
    }).join('');
    t.innerHTML = '<thead><tr><th>البند</th><th>الوحدة</th><th>الكمية</th>' + d.suppliers.map(function (s) { return '<th>' + esc(s.name) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' + (body || '<tr><td colspan="' + (4 + d.suppliers.length) + '" class="empty">لا توجد بنود.</td></tr>') + '</tbody><tfoot><tr><td colspan="3"><b>إجمالي المختار</b></td>' + d.suppliers.map(function (s) { return '<td class="num"><b>' + fmt(r2(tot[s.id])) + '</b></td>'; }).join('') + '<td></td></tr></tfoot>';
  }
  function softT() {
    var d = cur(), t = $('#rqT'); if (!d || !t) return; var tot = {};
    d.suppliers.forEach(function (s) { tot[s.id] = 0; });
    $$('tbody tr[data-li]', t).forEach(function (tr) {
      var l = d.lines[+tr.dataset.li], b = best(d, l.id), ch = d.chosen[l.id] || '';
      $$('input[data-qf=offer]', tr).forEach(function (inp) { var sid = inp.dataset.sup, p = n0((d.offers[sid] || {})[l.id]), td = inp.closest('td'); td.style.background = p > 0 && p === b.price ? 'var(--ok-bg,#ecfdf3)' : ''; var rad = td.querySelector('input[type=radio]'); if (rad) rad.checked = ch === sid; if (p > 0 && ch === sid) tot[sid] += p * n0(l.qty); });
    });
    var f = $$('tfoot td', t); d.suppliers.forEach(function (s, i) { if (f[i + 1]) f[i + 1].innerHTML = '<b>' + fmt(r2(tot[s.id])) + '</b>'; });
  }
  function touch() { clearTimeout(st.t); st.dirty = true; setState('جارٍ الحفظ…'); st.t = setTimeout(flush, 700); }
  function flush(cb) {
    var d = cur(); if (!d || !st.dirty) return cb && cb(); if (st.saving) { st.again = true; return; }
    st.saving = true; st.dirty = false;
    H.api('PUT', '/pdocs/' + d.id, { doc: strip(d), status: d.status, _v: d._v }).then(function (r) { d._v = r.doc._v; setState('محفوظ'); })
      .catch(function (e) { st.dirty = false; setState(e.message || 'تعذر الحفظ', true); H.fail(e); if (e.status === 409) { st.list = null; st.sel = null; setTimeout(mount, 1200); } })
      .then(function () { st.saving = false; if (st.again || st.dirty) { st.again = false; st.dirty = true; flush(cb); } else cb && cb(); });
  }
  function bind() {
    var root = H.main;
    root.oninput = root.onchange = function (e) {
      var t = e.target, d = cur(); if (!d || !t.dataset.qf) return; var k = t.dataset.qf, tr = t.closest('tr'), l = tr && tr.dataset.li != null ? d.lines[+tr.dataset.li] : null;
      if (k === 'title' || k === 'project' || k === 'date') d[k] = t.value;
      else if (k === 'ld') l.desc = t.value; else if (k === 'lu') l.unit = t.value; else if (k === 'lq') { l.qty = n0(t.value); }
      else if (k === 'offer') { var o = d.offers[t.dataset.sup] || (d.offers[t.dataset.sup] = {}), v = n0(t.value); if (v > 0) o[l.id] = v; else delete o[l.id]; var b = best(d, l.id); if (e.type === 'change' && !d.chosen[l.id] && b.sup) d.chosen[l.id] = b.sup; softT(); }
      else if (k === 'pick') { d.chosen[l.id] = t.dataset.sup; softT(); }
      touch();
    };
    root.onchange = function (e) { if (e.target.dataset.a === 'status') { var d = cur(); d.status = e.target.value; touch(); return; } root.oninput(e); };
    root.onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b || b.tagName === 'SELECT') return; var d = cur(), a = b.dataset.a;
      if (a === 'back') { clearTimeout(st.t); flush(function () { st.sel = null; mount(); }); }
      else if (a === 'addsup') { var nm = $('#rqSn').value.trim(); if (!nm) return; if (d.suppliers.length >= 12) return H.toast('الحد الأقصى 12 مورداً'); d.suppliers.push({ id: H.uid(), name: nm, phone: $('#rqSp').value.trim() }); $('#rqSn').value = $('#rqSp').value = ''; drawSup(); drawT(); touch(); }
      else if (a === 'rmsup') { var s = d.suppliers.splice(+b.closest('tr').dataset.si, 1)[0]; delete d.offers[s.id]; Object.keys(d.chosen).forEach(function (k) { if (d.chosen[k] === s.id) delete d.chosen[k]; }); drawSup(); drawT(); touch(); }
      else if (a === 'addline') { d.lines.push({ id: H.uid(), desc: '', unit: 'NO', qty: 1, lib: '' }); drawT(); touch(); }
      else if (a === 'rmline') { var l = d.lines.splice(+b.closest('tr').dataset.li, 1)[0]; delete d.chosen[l.id]; drawT(); touch(); }
      else if (a === 'cheapest') { d.lines.forEach(function (l) { var x = best(d, l.id); if (x.sup) d.chosen[l.id] = x.sup; }); drawT(); touch(); }
      else if (a === 'wa') { var sp = d.suppliers[+b.closest('tr').dataset.si]; var msg = 'السلام عليكم ' + sp.name + '،\nنرجو تزويدنا بأفضل أسعاركم (شاملة التوريد، دون ضريبة القيمة المضافة) للبنود التالية' + (d.project ? ' لمشروع «' + d.project + '»' : '') + ':\n\n' + d.lines.map(function (l, i) { return (i + 1) + '. ' + l.desc + ' — ' + R.qtyF(l.qty) + ' ' + (l.unit || ''); }).join('\n') + '\n\nنأمل إفادتنا بمدة التوريد وصلاحية العرض.\nشركة رسس للمقاولات العامة'; window.open(wa(sp.phone, msg), '_blank', 'noopener'); if (d.status === 'draft') { d.status = 'sent'; touch(); editor(); } }
      else if (a === 'apply') apply(d);
      else if (a === 'print') print(d);
    };
  }
  function apply(d) {
    var picks = d.lines.map(function (l) { var sid = d.chosen[l.id], p = sid ? n0((d.offers[sid] || {})[l.id]) : 0; return { l: l, p: p, sid: sid }; }).filter(function (x) { return x.p > 0; });
    if (!picks.length) return H.toast('اختر مورداً لكل بند أولاً');
    var P = H.P(), q = d.quoteId && S().quotes.filter(function (x) { return x.id === d.quoteId; })[0], nItems = 0, nLines = 0;
    picks.forEach(function (x) {
      if (x.l.lib && P.itemsWrite) { var it = S().items.filter(function (i) { return i.id === x.l.lib; })[0]; if (it) { it.cost = x.p; nItems++; } }
      if (q && (P.quotesWrite === 'all' || (P.quotesWrite === 'own'))) q.lines.forEach(function (ql) { if ((x.l.lib && ql.lib === x.l.lib) || (!x.l.lib && ql.desc === x.l.desc)) { ql.cost = x.p; nLines++; } });
    });
    if (!nItems && !nLines) return H.toast('لا توجد بنود مرتبطة بالمكتبة أو بالعرض لتطبيق التكلفة عليها');
    H.saveS(); H.toast('طُبّقت التكلفة: ' + nItems + ' صنف في المكتبة، ' + nLines + ' بند في العرض');
  }
  function print(d) {
    var s = S().settings, sup = d.suppliers, ch = d.chosen;
    var tbl = '<table class="it"><thead><tr><th style="width:4%">م</th><th>البند</th><th style="width:7%">الكمية</th>' + sup.map(function (x) { return '<th>' + esc(x.name) + '</th>'; }).join('') + '</tr></thead><tbody>' + d.lines.map(function (l, i) { var b = best(d, l.id); return '<tr class="' + (i % 2 ? 'b' : '') + '"><td class="c">' + (i + 1) + '</td><td class="ds">' + esc(l.desc) + '</td><td class="c">' + R.qtyF(l.qty) + '</td>' + sup.map(function (x) { var p = n0((d.offers[x.id] || {})[l.id]); return '<td class="e" style="' + (ch[l.id] === x.id ? 'font-weight:700;background:#ecfdf3;' : '') + '">' + (p > 0 ? fmt(p) + (p === b.price ? ' ★' : '') : '—') + '</td>'; }).join('') + '</tr>'; }).join('') + '<tr class="k"><td></td><td class="ds">إجمالي المختار</td><td></td>' + sup.map(function (x) { return '<td class="e">' + fmt(r2(d.lines.reduce(function (a, l) { var p = n0((d.offers[x.id] || {})[l.id]); return a + (ch[l.id] === x.id && p > 0 ? p * n0(l.qty) : 0); }, 0))) + '</td>'; }).join('') + '</tr></tbody></table>';
    H.printDoc(R.wrap(s, R.bars(s, 'مقارنة عروض الموردين') + '<div class="d-meta c">' + '<div class="p-note"><b>' + esc(d.no) + '</b> — ' + esc(d.title) + (d.project ? ' — ' + esc(d.project) : '') + ' — ' + fmtDate(d.date) + '</div></div>' + tbl + '<div class="p-note" style="color:#555">★ أقل سعر للبند. الخلفية الخضراء: المورد المختار. الأسعار قبل ضريبة القيمة المضافة ما لم يُذكر خلاف ذلك.</div>'), 'مقارنة ' + d.no);
  }
  window.RFQ = { mount: mount };
})();
