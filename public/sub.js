/* Technical attachments per library item (datasheets, certificates, approvals) + technical submittal package for a quote. */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc, n0 = R.n0, fmtDate = R.fmtDate, norm = R.norm;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var S = function () { return H.S(); };
  var TYPE = { datasheet: 'ورقة بيانات', cert: 'شهادة اعتماد', approval: 'موافقة / اعتماد جهة', other: 'مستند آخر' };
  var st = { list: null, data: {} };
  var kb = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' م.ب' : Math.max(1, Math.round(n / 1024)) + ' ك.ب'; };

  function load(cb, force) { if (st.list && !force) return cb(); H.api('GET', '/attachments').then(function (r) { st.list = r.attachments; cb(); }).catch(H.fail); }
  function of(itemId) { return (st.list || []).filter(function (a) { return a.refId === itemId; }); }
  function fetchData(id) { if (st.data[id]) return Promise.resolve(st.data[id]); return H.api('GET', '/attachments/' + id).then(function (r) { st.data[id] = r.data; return r.data; }); }
  function bytes(dataUrl) { var b = atob(dataUrl.split(',')[1]), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function loadLib() { return window.PDFLib ? Promise.resolve() : new Promise(function (ok, no) { var e = document.createElement('script'); e.src = '/vendor/pdflib.js?v=1'; e.onload = ok; e.onerror = function () { no(new Error('تعذر تحميل أداة دمج PDF')); }; document.head.appendChild(e); }); }
  function pagesOf(a) {
    if (a.mime !== 'application/pdf') return Promise.resolve(1);
    return Promise.all([loadLib(), fetchData(a.id)]).then(function (x) { return window.PDFLib.PDFDocument.load(bytes(x[1]), { ignoreEncryption: true }).then(function (d) { return d.getPageCount(); }); });
  }

  /* ---------- per-item attachment manager ---------- */
  function manager(itemId) {
    load(function () {
      var canW = H.P().itemsWrite, items = S().items;
      H.modal('<h3>المرفقات الفنية للأصناف</h3><div class="row" style="margin-bottom:8px"><input id="smQ" placeholder="ابحث عن صنف…" style="flex:1"></div><select id="smI" size="7" style="width:100%"></select><div id="smA" style="margin-top:12px"></div><div class="row" style="margin-top:12px"><button class="btn" data-act="modal-close" type="button">إغلاق</button></div>', function (m) {
        m.firstElementChild.style.width = 'min(760px,100%)';
        var sel = $('#smI', m), cur = itemId || '';
        var fill = function () { var f = norm($('#smQ', m).value); var rows = items.filter(function (i) { return !f || norm(i.cat + ' ' + i.desc + ' ' + i.brand).indexOf(f) >= 0; }).slice(0, 120); sel.innerHTML = rows.map(function (i) { var n = of(i.id).length; return '<option value="' + i.id + '" ' + (i.id === cur ? 'selected' : '') + '>' + (n ? '📎' + n + ' ' : '') + esc(i.desc) + (i.brand ? ' — ' + esc(i.brand) : '') + '</option>'; }).join(''); };
        var draw = function () {
          var box = $('#smA', m); if (!cur) { box.innerHTML = '<div class="muted">اختر صنفاً لعرض مرفقاته.</div>'; return; }
          var it = items.filter(function (i) { return i.id === cur; })[0]; var as = of(cur);
          box.innerHTML = '<h4 style="margin:0 0 8px">' + esc(it ? it.desc : '') + '</h4>' + (as.length ? '<table class="t"><tbody>' + as.map(function (a) { return '<tr data-id="' + a.id + '"><td>' + esc(a.name) + '</td><td>' + TYPE[a.docType] + '</td><td>' + kb(a.size) + '</td><td><button class="btn sm" data-x="view" type="button">فتح</button>' + (canW ? ' <button class="btn sm danger" data-x="del" type="button">حذف</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="muted">لا توجد مرفقات لهذا الصنف.</div>') +
            (canW ? '<div class="row" style="margin-top:10px"><select id="smT">' + Object.keys(TYPE).map(function (k) { return '<option value="' + k + '">' + TYPE[k] + '</option>'; }).join('') + '</select><input id="smF" type="file" accept="application/pdf,image/png,image/jpeg" style="max-width:300px"><button class="btn sm pri" id="smU" type="button">رفع</button><small class="muted">PDF أو PNG أو JPG، حتى 3 ميغابايت، 8 مرفقات للصنف.</small></div>' : '');
        };
        fill(); draw(); $('#smQ', m).oninput = fill; sel.onchange = function () { cur = sel.value; draw(); };
        m.onclick = function (e) {
          var b = e.target.closest('[data-x]'); if (b) { var id = b.closest('tr').dataset.id; if (b.dataset.x === 'view') fetchData(id).then(function (d) { var u = URL.createObjectURL(new Blob([bytes(d)], { type: d.slice(5, d.indexOf(';')) })); window.open(u, '_blank', 'noopener'); }).catch(H.fail); else H.api('DELETE', '/attachments/' + id).then(function () { st.list = st.list.filter(function (a) { return a.id !== id; }); delete st.data[id]; fill(); draw(); }).catch(H.fail); return; }
          if (e.target.id === 'smU') {
            var f = $('#smF', m).files[0]; if (!f) return H.toast('اختر ملفاً'); if (f.size > 3 * 1048576) return H.toast('حجم الملف يتجاوز 3 ميغابايت');
            var rd = new FileReader(); rd.onload = function () { H.api('POST', '/attachments', { refId: cur, docType: $('#smT', m).value, name: f.name.replace(/\.[^.]+$/, ''), data: rd.result }).then(function (r) { st.list.push(r.attachment); fill(); draw(); H.toast('تم الرفع'); }).catch(H.fail); }; rd.readAsDataURL(f);
          }
        };
      });
    });
  }

  /* ---------- submittal package ---------- */
  function collect(q) {
    var map = {}, order = [], unlinked = [];
    q.lines.forEach(function (l) {
      if (!l.lib) { unlinked.push(l); return; } var it = S().items.filter(function (i) { return i.id === l.lib; })[0]; if (!it) { unlinked.push(l); return; }
      if (!map[l.lib]) { map[l.lib] = { it: it, qty: 0, group: l.group }; order.push(l.lib); } map[l.lib].qty += n0(l.qty);
    });
    return { rows: order.map(function (k) { return map[k]; }), unlinked: unlinked };
  }
  function pkg(q) {
    if (!q) return H.toast('افتح عرض سعر أولاً');
    load(function () {
      var c = collect(q);
      var rowsH = c.rows.map(function (x, i) { var as = of(x.it.id); return '<tr data-i="' + i + '"><td>' + (i + 1) + '</td><td><b>' + esc(x.it.desc) + '</b>' + (x.it.brand ? '<br><small class="muted">' + esc(x.it.brand) + '</small>' : '') + '</td><td>' + R.qtyF(x.qty) + ' ' + esc(x.it.unit) + '</td><td>' + (as.length ? as.map(function (a) { return '<label class="row" style="flex-wrap:nowrap;gap:4px"><input type="checkbox" data-a="' + a.id + '" ' + (a.docType === 'datasheet' || a.docType === 'cert' ? 'checked' : '') + ' style="width:auto"> ' + esc(a.name) + ' <small class="muted">(' + TYPE[a.docType] + ')</small></label>'; }).join('') : '<span class="chip bad">لا مرفقات</span>') + '</td></tr>'; }).join('');
      var miss = c.rows.filter(function (x) { return !of(x.it.id).length; }).length;
      H.modal('<h3>حزمة الاعتماد الفني</h3><div class="grid g2"><label class="fld"><span>عنوان الحزمة</span><input id="spT" value="طلب اعتماد مواد — ' + esc(q.project || q.no) + '"></label><label class="fld"><span>الجهة المراجِعة (الاستشاري)</span><input id="spC"></label></div>' + (c.rows.length ? '<div class="tablewrap" style="max-height:44vh;overflow:auto;margin-top:10px"><table class="t" style="min-width:560px"><thead><tr><th>م</th><th>الصنف</th><th>الكمية</th><th>المستندات (بترتيب الدمج)</th></tr></thead><tbody>' + rowsH + '</tbody></table></div>' : '<div class="empty">لا توجد بنود مرتبطة بالمكتبة في هذا العرض.</div>') +
        (miss ? '<div class="note" style="margin-top:8px">' + miss + ' صنف بلا مرفقات؛ ارفع أوراق بياناتها من «مكتبة الأصناف ← المرفقات الفنية».</div>' : '') + (c.unlinked.length ? '<div class="note" style="margin-top:8px">' + c.unlinked.length + ' بند غير مرتبط بالمكتبة ولن يظهر في الحزمة.</div>' : '') +
        '<div class="row" style="margin-top:12px"><button class="btn pri" id="spP" type="button">طباعة الغلاف والفهرس</button><button class="btn" id="spD" type="button">تنزيل المستندات مدمجة (PDF)</button><button class="btn" data-act="modal-close" type="button">إغلاق</button></div><div class="muted" style="font-size:12px;margin-top:8px">الغلاف والفهرس يُطبعان بقالب الشركة، والمستندات تُدمج في ملف PDF واحد بنفس ترتيب الفهرس، وأرقام الصفحات في الفهرس تطابق الملف المدمج.</div>', function (m) {
          var picked = function () { return c.rows.map(function (x) { return of(x.it.id).filter(function (a) { var cb = $('input[data-a="' + a.id + '"]', m); return cb && cb.checked; }); }); };
          $('#spP', m).onclick = function () { cover(q, c, picked(), $('#spT', m).value, $('#spC', m).value); };
          $('#spD', m).onclick = function () { merge(q, picked()); };
        });
    });
  }
  function cover(q, c, picks, title, to) {
    var all = picks.reduce(function (a, p) { return a.concat(p); }, []); H.toast('جارٍ إعداد الفهرس…');
    Promise.all(all.map(function (a) { return pagesOf(a).then(function (n) { return [a.id, n]; }); })).then(function (pr) {
      var pg = {}; pr.forEach(function (x) { pg[x[0]] = x[1]; }); var cur = 1, s = S().settings;
      var rows = c.rows.map(function (x, i) {
        var docs = picks[i].map(function (a) { var from = cur, to2 = cur + pg[a.id] - 1; cur = to2 + 1; return esc(a.name) + ' <small>(' + TYPE[a.docType] + ' — ص ' + (from === to2 ? from : from + '–' + to2) + ')</small>'; });
        return '<tr class="' + (i % 2 ? 'b' : '') + '"><td class="c">' + (i + 1) + '</td><td class="ds"><b>' + esc(x.it.desc) + '</b></td><td class="c">' + esc(x.it.brand || '—') + '</td><td class="c">' + R.qtyF(x.qty) + ' ' + esc(x.it.unit) + '</td><td class="ds">' + (docs.length ? docs.join('<br>') : '<span style="color:#b42318">لا توجد مستندات مرفقة</span>') + '</td></tr>';
      }).join('');
      var tbl = '<table class="it"><thead><tr><th style="width:5%">م</th><th>المادة / المعدة</th><th style="width:16%">الماركة / النوع</th><th style="width:11%">الكمية</th><th style="width:34%">المستندات المرفقة</th></tr></thead><tbody>' + rows + '</tbody></table>';
      var sg = '<div class="sigs"><div class="sg"><b>الجهة المراجِعة</b><b>' + esc(to || '') + '</b><div class="ln2">القرار:  ☐ معتمد   ☐ معتمد بملاحظات   ☐ مرفوض</div><div class="ln2">الاسم والتوقيع: ____________________</div><div class="ln2">التاريخ: ____________________</div></div><div class="sg"><b>مقدّم الطلب</b><b>' + esc(s.nameAr) + '</b><div class="ln2">الاسم: ' + esc(q.preparedBy || s.preparedBy || '') + '</div><div class="ln2">التوقيع: ____________________</div></div></div>';
      var inner = R.bars(s, esc(title || 'طلب اعتماد مواد')) + '<div class="d-meta c">' + R.pair('المشروع', esc(q.project || '')) + R.pair('العميل', esc(q.client || '')) + R.pair('رقم العرض', '<bdi dir="ltr">' + esc(q.no) + '</bdi>') + R.pair('التاريخ', fmtDate(R.today())) + (to ? R.pair('إلى', esc(to)) : '') + R.pair('عدد المواد', String(c.rows.length)) + '</div>' + tbl + '<div class="p-note" style="color:#555">ترقيم الصفحات يشير إلى ملف المستندات المدمج المرفق بهذه الحزمة.</div>' + sg;
      H.printDoc(R.wrap(s, inner), 'حزمة اعتماد ' + q.no);
    }).catch(H.fail);
  }
  function merge(q, picks) {
    var all = picks.reduce(function (a, p) { return a.concat(p); }, []); if (!all.length) return H.toast('لا توجد مستندات محددة للدمج'); H.toast('جارٍ دمج ' + all.length + ' مستند…');
    loadLib().then(function () { var L = window.PDFLib; return L.PDFDocument.create().then(function (out) {
      return all.reduce(function (p, a) { return p.then(function () { return fetchData(a.id).then(function (d) {
        var u = bytes(d);
        if (a.mime === 'application/pdf') return L.PDFDocument.load(u, { ignoreEncryption: true }).then(function (src) { return out.copyPages(src, src.getPageIndices()).then(function (ps) { ps.forEach(function (pg) { out.addPage(pg); }); }); });
        return (a.mime === 'image/png' ? out.embedPng(u) : out.embedJpg(u)).then(function (img) { var W = 595.28, Hh = 841.89, sc = Math.min((W - 40) / img.width, (Hh - 40) / img.height, 1), w = img.width * sc, h = img.height * sc, pg = out.addPage([W, Hh]); pg.drawImage(img, { x: (W - w) / 2, y: (Hh - h) / 2, width: w, height: h }); });
      }); }); }, Promise.resolve()).then(function () { return out.save(); });
    }); }).then(function (bytes2) {
      var b = new Blob([bytes2], { type: 'application/pdf' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'submittal-' + q.no + '.pdf'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); H.toast('تم تجهيز الملف المدمج');
    }).catch(function (e) { H.fail(e); });
  }

  /* ---------- hooks into the quote / library screens ---------- */
  function injectQuote() {
    var q = H.curQ(), bar = document.querySelector('.sticky-act'); if (!q || !bar || bar.querySelector('[data-sbm=pkg]')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.sbm = 'pkg'; b.textContent = 'حزمة الاعتماد الفني'; bar.insertBefore(b, bar.firstChild.nextSibling);
  }
  function injectLib() {
    var row = document.querySelector('#main .title-row'); if (!row || row.querySelector('[data-sbm=mgr]')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.dataset.sbm = 'mgr'; b.textContent = 'المرفقات الفنية'; var sp = row.querySelector('.sp'); row.insertBefore(b, sp ? sp.nextSibling : null);
  }
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-sbm]'); if (!b) return; if (b.dataset.sbm === 'pkg') pkg(H.curQ()); else if (b.dataset.sbm === 'mgr') manager(); });
  window.SUB = { manager: manager, pkg: pkg, injectQuote: injectQuote, injectLib: injectLib };
})();
