(function () {
  'use strict';
  var R = window.RASS, root = document.querySelector('.pq'), token = root.dataset.token, body = document.getElementById('pq-body');
  function api(method, path, data) {
    return fetch('/api' + path, { method: method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rass' }, body: data ? JSON.stringify(data) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'تعذر تنفيذ الطلب'); e.code = j.code; throw e; } return j; }); });
  }
  function msg(cls, t) { return '<div class="' + cls + '" style="margin:12px 0">' + R.esc(t) + '</div>'; }
  var state;
  function render() {
    var d = state, q = d.quote, dec = q._decision;
    var h = '<div class="pv-wrap"><div class="sheet" id="sheet">' + R.quoteDoc(d.settings, q) + '</div></div><div class="pq-act">';
    if (dec) h += '<div class="decision ' + (dec.action === 'reject' ? 'rej' : '') + '"><b>' + (dec.action === 'approve' ? 'تم اعتماد العرض' : 'تم رفض العرض') + '</b> بواسطة ' + R.esc(dec.name) + ' بتاريخ ' + R.fmtDate(String(dec.at).slice(0, 10)) + '. شكراً لك.</div>';
    if (dec && dec.action === 'approve' && dec.docHash) h += '<div class="muted" style="font-size:12px;margin:8px 0">بصمة المستند (SHA-256): <bdi dir="ltr">' + R.esc(dec.docHash.slice(0, 16)) + '…</bdi> — تأكيد إلكتروني عبر الرابط مسجّل بالاسم والتوقيع والوقت وعنوان الجهاز.</div>';
    if (d.portal && (!dec || dec.action === 'approve')) h += portalCard(d.portal);
    if (dec) { /* decision already shown */ }
    else if (d.expired) h += msg('note bad', 'انتهت صلاحية رابط الاعتماد. يرجى التواصل مع الشركة للحصول على رابط جديد.');
    else if (d.superseded) h += msg('note bad', 'تم استبدال هذا العرض بإصدار أحدث. يرجى التواصل مع الشركة.');
    else h += '<div class="card"><h3>قرار العميل</h3><p class="muted" style="margin-top:0">بعد مراجعة العرض أعلاه، اكتب اسمك ووقّع في المربع ثم اضغط «اعتماد العرض». سيصل إشعار فوري للشركة.</p>' +
      '<label class="fld"><span>الاسم الكامل</span><input id="pq-name" autocomplete="name"></label>' +
      '<div class="fld" style="margin-top:10px"><span>التوقيع (بالإصبع أو الفأرة)</span><canvas id="pq-sig" class="sigpad" width="800" height="300"></canvas><div class="row"><button class="btn sm" type="button" id="pq-clear">مسح التوقيع</button></div></div>' +
      '<label class="fld" style="margin-top:10px"><span>ملاحظات (اختياري)</span><textarea id="pq-note" rows="2"></textarea></label>' +
      '<div class="auth-err" id="pq-err" hidden style="margin-top:10px"></div><div class="row" style="margin-top:12px"><button class="btn pri" type="button" id="pq-ok">اعتماد العرض</button><button class="btn danger" type="button" id="pq-no">رفض العرض</button><button class="btn" type="button" id="pq-print">طباعة / PDF</button></div></div>';
    h += '</div>';
    body.innerHTML = h;
    var fs = document.getElementById('rassFonts'); if (!fs) { fs = document.createElement('style'); fs.id = 'rassFonts'; document.head.appendChild(fs); } fs.textContent = R.fontCss(d.settings);
    var sh = document.getElementById('sheet'), w = sh.parentNode.clientWidth;
    sh.style.zoom = Math.min(1, (w - 24) / 816) || 1; sh.style.width = '816px';
    if (!dec && !d.expired && !d.superseded) pad();
  }
  function portalCard(p) {
    var f = R.fmt, e = R.esc, t = function (rows) { return '<div class="tablewrap"><table class="t">' + rows + '</table></div>'; };
    var pay = '<thead><tr><th>الدفعة</th><th>الاستحقاق</th><th class="num">المبلغ</th><th class="num">المسدّد</th></tr></thead><tbody>' + p.payments.map(function (x) { return '<tr><td>' + e(x.label) + '</td><td>' + (x.due ? R.fmtDate(x.due) : '—') + '</td><td class="num">' + f(x.amt) + '</td><td class="num">' + f(x.paid) + '</td></tr>'; }).join('') + '</tbody>';
    return '<div class="card" style="margin-top:12px"><h3>حالة العقد والمدفوعات</h3><div class="stats"><span>قيمة العقد: <b>' + f(p.current) + '</b></span><span>المسدّد: <b>' + f(p.paid) + '</b></span><span>المتبقي: <b>' + f(p.remaining) + '</b></span></div>' +
      (p.variations.length ? '<h4>أوامر التغيير المعتمدة</h4>' + t('<tbody>' + p.variations.map(function (v) { return '<tr><td>' + e(v.no) + '</td><td>' + e(v.title) + '</td><td class="num">' + (v.amount >= 0 ? '+ ' : '- ') + f(Math.abs(v.amount)) + '</td></tr>'; }).join('') + '</tbody>') : '') +
      '<h4>جدول الدفعات</h4>' + t(pay) + (p.certificates.length ? '<h4>المستخلصات المعتمدة</h4>' + t('<tbody>' + p.certificates.map(function (c) { return '<tr><td>' + e(c.no) + '</td><td>' + (c.date ? R.fmtDate(c.date) : '') + '</td><td class="num">' + f(c.payable) + '</td><td>' + (c.status === 'paid' ? 'مدفوع' : 'معتمد') + '</td></tr>'; }).join('') + '</tbody>') : '') +
      (p.receipts.length ? '<h4>سندات القبض</h4>' + t('<tbody>' + p.receipts.map(function (r) { return '<tr><td>' + e(r.no) + '</td><td>' + R.fmtDate(r.date) + '</td><td>' + e(r.method) + '</td><td class="num">' + f(r.amount) + '</td></tr>'; }).join('') + '</tbody>') : '') + '</div>';
  }
  function pad() {
    var c = document.getElementById('pq-sig'), ctx = c.getContext('2d'), drawing = false, dirty = false;
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#17365D';
    function pos(e) { var r = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * c.width / r.width, y: (t.clientY - r.top) * c.height / r.height }; }
    function down(e) { e.preventDefault(); drawing = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function move(e) { if (!drawing) return; e.preventDefault(); var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty = true; }
    function up() { drawing = false; }
    c.addEventListener('mousedown', down); c.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: false }); c.addEventListener('touchmove', move, { passive: false }); c.addEventListener('touchend', up);
    document.getElementById('pq-clear').onclick = function () { ctx.clearRect(0, 0, c.width, c.height); dirty = false; };
    document.getElementById('pq-print').onclick = function () { var ps = document.getElementById('pgStyle'); if (!ps) { ps = document.createElement('style'); ps.id = 'pgStyle'; document.head.appendChild(ps); } ps.textContent = R.pageCss(R.tplFor(state.settings, 'quote', state.quote)); var pa = document.createElement('div'); pa.id = 'printArea'; pa.innerHTML = R.quoteDoc(state.settings, state.quote); document.body.appendChild(pa); window.print(); setTimeout(function () { pa.remove(); }, 500); };
    function send(action) {
      var err = document.getElementById('pq-err'); err.hidden = true;
      var name = document.getElementById('pq-name').value.trim();
      if (name.length < 3) { err.textContent = 'اكتب اسمك الكامل'; err.hidden = false; return; }
      if (action === 'approve' && !dirty) { err.textContent = 'وقّع في المربع المخصص للتوقيع'; err.hidden = false; return; }
      if (action === 'reject' && !confirm('هل تريد رفض العرض؟')) return;
      var sig = action === 'approve' ? c.toDataURL('image/png') : '';
      api('POST', '/public/quote/' + encodeURIComponent(token), { action: action, name: name, note: document.getElementById('pq-note').value, signature: sig, v: state.v })
        .then(load).catch(function (e) { err.textContent = e.message; err.hidden = false; if (e.code === 'stale') setTimeout(load, 1500); });
    }
    document.getElementById('pq-ok').onclick = function () { send('approve'); };
    document.getElementById('pq-no').onclick = function () { send('reject'); };
  }
  function load() {
    return api('GET', '/public/quote/' + encodeURIComponent(token)).then(function (d) { state = d; document.title = 'عرض سعر ' + d.quote.no + ' - ' + d.settings.nameAr; document.getElementById('pq-title').textContent = 'عرض سعر ' + d.quote.no; render(); })
      .catch(function (e) { body.innerHTML = msg('note bad', e.message || 'الرابط غير صالح'); });
  }
  load();
})();
