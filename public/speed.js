/* Speed tools: command palette (Ctrl+K), keyboard shortcuts, paste-from-Excel, kits (saved bundles of lines), price tools. */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc, norm = R.norm, n0 = R.n0, fmt = R.fmt;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var S = function () { return H.S(); }, ready = function () { return !!S(); };
  var inField = function (el) { return el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable); };

  /* ================= command palette ================= */
  var pal = null, items = [], pi = 0;
  var TABS = [['dash', 'اللوحة'], ['archive', 'العروض والعقود'], ['customers', 'العملاء'], ['payments', 'الدفعات'], ['takeoff', 'حصر الكميات'], ['library', 'المكتبة'], ['agreements', 'الاتفاقيات'], ['invoices', 'الفواتير'], ['reports', 'التقارير'], ['templates', 'القوالب'], ['settings', 'الإعدادات']];
  function can(v) { var p = H.P(), m = { dash: p.receipts, payments: p.receipts, reports: p.reports, settings: p.settingsWrite, templates: p.settingsWrite, takeoff: p.takeoff, agreements: !!p.agreements && p.agreements !== 'none', invoices: p.invoices }; return v in m ? !!m[v] : true; }
  function openPalette() {
    if (!ready()) return;
    if (!pal) {
      pal = document.createElement('div'); pal.className = 'pal'; pal.hidden = true;
      pal.innerHTML = '<div class="pal-box" role="dialog" aria-modal="true" aria-label="بحث سريع"><input id="palQ" placeholder="ابحث عن عرض أو عميل أو صنف، أو اكتب أمراً مثل: عرض جديد" autocomplete="off"><div id="palR" class="pal-res"></div><div class="pal-ft"><span>↑↓ تنقّل</span><span>Enter تنفيذ</span><span>Esc إغلاق</span></div></div>';
      document.body.appendChild(pal);
      pal.addEventListener('mousedown', function (e) { if (e.target === pal) closePalette(); });
      $('#palQ', pal).addEventListener('input', draw);
      $('#palQ', pal).addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; pi = (pi + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; mark(); }
        else if (e.key === 'Enter') { e.preventDefault(); run(items[pi]); }
        else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      });
      $('#palR', pal).addEventListener('click', function (e) { var b = e.target.closest('[data-pi]'); if (b) run(items[+b.dataset.pi]); });
    }
    pal.hidden = false; $('#palQ', pal).value = ''; draw(); setTimeout(function () { $('#palQ', pal).focus(); }, 0);
  }
  function closePalette() { if (pal) pal.hidden = true; }
  function mark() { $$('.pal-i', pal).forEach(function (el, i) { el.classList.toggle('on', i === pi); if (i === pi) el.scrollIntoView({ block: 'nearest' }); }); }
  function draw() {
    var v = norm($('#palQ', pal).value).split(/\s+/).filter(Boolean), s = S(), p = H.P(), q = H.curQ(), view = s.ui.view, out = [];
    var hit = function (t) { return !v.length || v.every(function (w) { return norm(t).indexOf(w) >= 0; }); };
    var acts = [];
    if (p.quotesWrite === 'all' || p.quotesWrite === 'own') acts.push({ g: 'أوامر', t: 'عرض سعر جديد', k: 'عرض جديد اضافه انشاء new quote', run: function () { H.newQuote().then(function (nq) { H.go('quote', nq.id); }).catch(H.fail); } });
    if (p.receiptsWrite) acts.push({ g: 'أوامر', t: 'سند قبض جديد', k: 'سند قبض جديد دفعه استلام receipt', run: function () { document.querySelector('[data-act=nav][data-v=payments]') && H.go('payments'); setTimeout(function () { var b = document.querySelector('[data-act=new-receipt]'); if (b) b.click(); }, 60); } });
    if (q && (view === 'quote')) { acts.push({ g: 'أوامر', t: 'طباعة العرض الحالي', k: 'طباعه pdf print', run: function () { var b = $('[data-act=print-q]'); if (b) b.click(); } }); }
    if (q && (view === 'contract')) { acts.push({ g: 'أوامر', t: 'طباعة العقد الحالي', k: 'طباعه pdf print', run: function () { var b = $('[data-act=print-c]'); if (b) b.click(); } }); }
    acts.push({ g: 'أوامر', t: 'اختصارات لوحة المفاتيح', k: 'مساعده اختصارات help keyboard', run: help });
    acts.push({ g: 'أوامر', t: 'تبديل الوضع الليلي', k: 'ليلي نهاري dark theme', run: function () { var b = $('[data-act=theme]'); if (b) b.click(); } });
    acts.forEach(function (a) { if (hit(a.t + ' ' + a.k)) out.push(a); });
    TABS.forEach(function (t) { if (can(t[0]) && hit(t[1] + ' ' + t[0])) out.push({ g: 'انتقال', t: t[1], run: function () { H.go(t[0]); } }); });
    if (v.length) {
      s.quotes.filter(function (x) { return hit(x.no + ' ' + x.client + ' ' + x.project + ' ' + x.location); }).slice(0, 7).forEach(function (x) { out.push({ g: 'العروض', t: x.no + ' — ' + (x.client || 'بدون عميل'), sub: x.project || '', run: function () { H.go('quote', x.id); } }); });
      s.customers.filter(function (x) { return hit(x.name + ' ' + x.phone + ' ' + x.contact); }).slice(0, 5).forEach(function (x) { out.push({ g: 'العملاء', t: x.name, sub: x.phone || '', run: function () { H.go('customers'); } }); });
      var canAdd = q && view === 'quote' && H.has('qedit', q);
      s.items.filter(function (x) { return hit(x.cat + ' ' + x.desc + ' ' + x.brand); }).slice(0, 8).forEach(function (x) { out.push({ g: canAdd ? 'أصناف (Enter للإضافة للعرض)' : 'أصناف', t: x.desc, sub: x.cat + (x.brand ? ' · ' + x.brand : '') + ' · ' + fmt(x.price), run: function () { if (canAdd) H.pick(x.id); else H.go('library'); } }); });
    } else {
      s.quotes.slice().sort(function (a, b) { return String(b._updated || '').localeCompare(String(a._updated || '')); }).slice(0, 5).forEach(function (x) { out.push({ g: 'آخر العروض', t: x.no + ' — ' + (x.client || 'بدون عميل'), sub: x.project || '', run: function () { H.go('quote', x.id); } }); });
    }
    items = out.slice(0, 40); pi = 0;
    var last = '', h = '';
    items.forEach(function (it, i) { if (it.g !== last) { h += '<div class="pal-g">' + esc(it.g) + '</div>'; last = it.g; } h += '<button type="button" class="pal-i" data-pi="' + i + '"><span>' + esc(it.t) + '</span>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</button>'; });
    $('#palR', pal).innerHTML = h || '<div class="empty" style="padding:18px">لا توجد نتائج</div>'; mark();
  }
  function run(it) { if (!it) return; closePalette(); setTimeout(it.run, 0); }

  /* ================= keyboard shortcuts ================= */
  function help() {
    H.modal('<h3>اختصارات لوحة المفاتيح</h3><div class="tablewrap"><table class="t"><tbody>' + [
      ['Ctrl + K  أو  /', 'بحث سريع في العروض والعملاء والأصناف والأوامر'], ['Ctrl + S', 'حفظ فوري'], ['Alt + N', 'عرض سعر جديد'], ['Ctrl + P', 'طباعة العرض أو العقد المفتوح'],
      ['Ctrl + Enter', 'إضافة سطر مخصص جديد (داخل العرض)'], ['Enter في البحث', 'إضافة الصنف المحدد للعرض'], ['في خانة العدد', 'اكتب معادلة مثل 12*3+2 ثم Tab'], ['؟', 'عرض هذه القائمة']
    ].map(function (r) { return '<tr><td><kbd>' + r[0] + '</kbd></td><td>' + r[1] + '</td></tr>'; }).join('') + '</tbody></table></div><div class="row" style="margin-top:12px"><button class="btn" data-act="modal-close" type="button">إغلاق</button></div>');
  }
  document.addEventListener('keydown', function (e) {
    if (!ready()) return;
    var k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === 'k' || k === 'K' || k === '/')) { e.preventDefault(); openPalette(); return; }
    if (pal && !pal.hidden) return;
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); H.flush(); H.toast('جارٍ الحفظ…'); return; }
    if (e.altKey && (k === 'n' || k === 'N')) { var p = H.P(); if (p.quotesWrite === 'all' || p.quotesWrite === 'own') { e.preventDefault(); H.newQuote().then(function (nq) { H.go('quote', nq.id); }).catch(H.fail); } return; }
    if (ctrl && (k === 'p' || k === 'P')) { var b = $('[data-act=print-q]') || $('[data-act=print-c]'); if (b) { e.preventDefault(); b.click(); } return; }
    if (ctrl && k === 'Enter' && S().ui.view === 'quote') { var a = $('[data-act=add-line]'); if (a) { e.preventDefault(); a.click(); } return; }
    if (!inField(e.target) && !ctrl && !e.altKey) { if (k === '/') { e.preventDefault(); openPalette(); } else if (k === '?' || k === '؟') { e.preventDefault(); help(); } }
  });

  /* ================= quote tools ================= */
  function tools() {
    var box = $('#qtools'); if (!box) return;
    var q = H.curQ(); if (!q || !H.has('qedit', q)) { box.innerHTML = ''; return; }
    var kits = (S().settings.kits || []);
    box.innerHTML = '<button class="btn sm" type="button" data-spd="kits">إدراج حزمة' + (kits.length ? ' (' + kits.length + ')' : '') + '</button><button class="btn sm" type="button" data-spd="paste">لصق من Excel</button><button class="btn sm" type="button" data-spd="voice">إملاء / نص ذكي</button><button class="btn sm" type="button" data-spd="markup">تعديل الأسعار بنسبة</button>' + (H.P().settingsWrite ? '<button class="btn sm" type="button" data-spd="savekit">حفظ البنود كحزمة</button>' : '');
    box.onclick = function (e) { var b = e.target.closest('[data-spd]'); if (!b) return; ({ voice: voiceModal, kits: kitsModal, paste: pasteModal, markup: markupModal, savekit: saveKit })[b.dataset.spd](); };
  }
  function addLines(arr) {
    var q = H.curQ();
    arr.forEach(function (l) { l.id = H.uid(); var idx = -1; q.lines.forEach(function (x, i) { if (x.group === l.group) idx = i; }); if (idx >= 0) q.lines.splice(idx + 1, 0, l); else q.lines.push(l); });
    H.saveS(); H.renderLines();
  }
  /* kits */
  function kitsModal() {
    var s = S().settings, kits = s.kits || [], adm = H.P().settingsWrite;
    H.modal('<h3>إدراج حزمة بنود</h3><p class="muted" style="margin-top:0;font-size:12.5px">الحزمة مجموعة بنود جاهزة (مثل «طابق نموذجي» أو «غرفة مضخات») تُدرج دفعة واحدة. أسعار أصناف المكتبة تُحدَّث تلقائياً عند الإدراج.</p>' +
      (kits.length ? kits.map(function (k) { return '<div class="kit"><div><b>' + esc(k.name) + '</b><small class="muted"> · ' + k.lines.length + ' بند</small></div><div class="row" style="flex-wrap:nowrap"><input type="number" min="1" step="any" value="1" data-mult="' + k.id + '" style="width:70px" aria-label="المضاعف"><button class="btn sm pri" type="button" data-kit="' + k.id + '">إدراج</button>' + (adm ? '<button class="btn sm danger" type="button" data-kdel="' + k.id + '">حذف</button>' : '') + '</div></div>'; }).join('') : '<div class="empty">لا توجد حزم. ' + (adm ? 'أنشئ عرضاً بالبنود المطلوبة ثم اضغط «حفظ البنود كحزمة».' : 'اطلب من المدير إنشاء حزم.') + '</div>') +
      '<div class="row" style="margin-top:12px"><button class="btn" data-act="modal-close" type="button">إغلاق</button></div>', function (m) {
      m.onclick = function (e) {
        var b = e.target.closest('[data-kit]'), d = e.target.closest('[data-kdel]');
        if (b) { var k = kits.filter(function (x) { return x.id === b.dataset.kit; })[0], mult = Math.max(0.01, n0($('[data-mult="' + k.id + '"]', m).value) || 1); H.closeModal(); addLines(k.lines.map(function (l) { var it = l.lib && S().items.filter(function (i) { return i.id === l.lib; })[0], o = { lib: l.lib || '', group: l.group, desc: l.desc, brand: l.brand, unit: l.unit, qty: R.r2(n0(l.qty) * mult), price: it ? it.price : l.price }; if (it && it.est) o.est = true; return o; })); H.toast('أُدرجت الحزمة «' + k.name + '»'); }
        else if (d) { s.kits = kits.filter(function (x) { return x.id !== d.dataset.kdel; }); H.saveS(); H.closeModal(); kitsModal(); }
      };
    });
  }
  function saveKit() {
    var q = H.curQ(); if (!q.lines.length) return H.toast('أضف بنوداً أولاً');
    H.modal('<h3>حفظ البنود كحزمة</h3><label class="fld"><span>اسم الحزمة</span><input id="kn" placeholder="مثال: طابق نموذجي - إنذار"></label><p class="muted" style="font-size:12.5px">ستُحفظ ' + q.lines.length + ' بنداً بكمياتها الحالية.</p><div class="row" style="margin-top:12px"><button class="btn pri" id="kok" type="button">حفظ</button><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      setTimeout(function () { $('#kn', m).focus(); }, 30);
      $('#kok', m).onclick = function () {
        var n = $('#kn', m).value.trim(); if (!n) return; var s = S().settings; if (!s.kits) s.kits = [];
        if (s.kits.length >= 40) return H.toast('الحد الأقصى 40 حزمة');
        s.kits.push({ id: H.uid(), name: n, lines: q.lines.slice(0, 80).map(function (l) { return { lib: l.lib || '', group: l.group, desc: l.desc, brand: l.brand, unit: l.unit, qty: l.qty, price: l.price }; }) });
        H.saveS(); H.closeModal(); tools(); H.toast('حُفظت الحزمة');
      };
    });
  }
  /* paste from Excel / a consultant's BOQ */
  function bestItem(desc) {
    var w = norm(desc).split(/\s+/).filter(function (x) { return x.length > 1; }); if (w.length < 2) return null; var best = null, bs = 0;
    S().items.forEach(function (it) { var t = norm(it.desc + ' ' + it.cat), c = 0; w.forEach(function (x) { if (t.indexOf(x) >= 0) c++; }); var sc = c / w.length; if (sc > bs) { bs = sc; best = it; } });
    return bs >= 0.7 ? best : null;
  }
  function parseRows(text) {
    var last = (H.curQ().lines.slice(-1)[0] || {}).group || 'بنود أخرى';
    return text.split(/\r?\n/).map(function (ln) { return ln.replace(/\s+$/, ''); }).filter(function (ln) { return ln.trim(); }).map(function (ln) {
      var cells = (ln.indexOf('\t') >= 0 ? ln.split('\t') : ln.indexOf('|') >= 0 ? ln.split('|') : ln.indexOf(';') >= 0 ? ln.split(';') : [ln]).map(function (c) { return c.trim(); }).filter(function (c, i, a) { return c !== '' || i < a.length - 1; });
      var nums = [], txt = [];
      cells.forEach(function (c) { var v = c !== '' && /^[\d\s.,٠-٩+\-*/()×]+$/.test(c) ? R.calcExpr(c.replace(/,(?=\d{3}\b)/g, '')) : null; if (v != null && c !== '') nums.push(v); else if (c !== '') txt.push(c); });
      var desc = txt.sort(function (a, b) { return b.length - a.length; })[0] || '', unit = txt.filter(function (t) { return t !== desc && t.length <= 8; })[0] || '';
      var qty = nums.length >= 1 ? nums[nums.length >= 3 ? 1 : 0] : 1, price = nums.length >= 2 ? nums[nums.length >= 3 ? 2 : 1] : null;
      if (nums.length >= 3 && /^\d+$/.test(String(cells[0]))) { qty = nums[1]; price = nums[2]; }   // first numeric column is a serial number
      var it = bestItem(desc);
      return { desc: desc, unit: unit || (it ? it.unit : 'NO'), qty: Math.max(0, qty), price: price != null ? price : (it ? it.price : 0), it: it, group: it ? it.cat : last, brand: it ? it.brand : '' };
    }).filter(function (r) { return r.desc; });
  }
  function pasteModal() {
    H.modal('<h3>لصق بنود من Excel</h3><p class="muted" style="margin-top:0;font-size:12.5px">انسخ الصفوف من Excel أو من جدول كميات المهندس والصقها هنا. يتعرف البرنامج على الوصف والوحدة والكمية والسعر تلقائياً، ويطابق الأصناف مع المكتبة لتعبئة السعر الناقص.</p><textarea id="pt" rows="7" placeholder="كاشف دخان تقليدي&#9;NO&#9;24&#9;135"></textarea><div id="pv" style="margin-top:10px"></div><div class="row" style="margin-top:12px"><button class="btn pri" id="pok" type="button" disabled>إضافة للعرض</button><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      var rows = [];
      $('#pt', m).addEventListener('input', function () {
        rows = parseRows(this.value);
        $('#pv', m).innerHTML = rows.length ? '<div class="tablewrap" style="max-height:240px;overflow:auto"><table class="t"><thead><tr><th>الوصف</th><th>الوحدة</th><th class="num">العدد</th><th class="num">السعر</th><th>المكتبة</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + esc(r.desc) + '</td><td>' + esc(r.unit) + '</td><td class="num">' + r.qty + '</td><td class="num">' + fmt(r.price) + '</td><td>' + (r.it ? '<span class="chip ok">مطابق</span>' : '<span class="chip">مخصص</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
        $('#pok', m).disabled = !rows.length; $('#pok', m).textContent = rows.length ? 'إضافة ' + rows.length + ' بند للعرض' : 'إضافة للعرض';
      });
      $('#pok', m).onclick = function () { H.closeModal(); addLines(rows.map(function (r) { var l = { lib: r.it ? r.it.id : '', group: r.group, desc: r.it && !r.desc ? r.it.desc : r.desc, brand: r.brand, unit: r.unit, qty: r.qty, price: r.price }; if (r.it && r.it.est && r.price === r.it.price) l.est = true; return l; })); H.toast('أُضيفت البنود'); };
      setTimeout(function () { $('#pt', m).focus(); }, 30);
    });
  }
  /* voice / free text / BOQ -> draft lines (local matching, or AI when enabled) */
  var NUMW = { 'واحد': 1, 'واحدة': 1, 'اثنين': 2, 'اثنان': 2, 'اثنتين': 2, 'ثلاث': 3, 'ثلاثة': 3, 'اربع': 4, 'أربع': 4, 'اربعة': 4, 'أربعة': 4, 'خمس': 5, 'خمسة': 5, 'ست': 6, 'ستة': 6, 'سبع': 7, 'سبعة': 7, 'ثمان': 8, 'ثماني': 8, 'ثمانية': 8, 'تسع': 9, 'تسعة': 9, 'عشر': 10, 'عشرة': 10, 'احد': 1, 'أحد': 1, 'عشرين': 20, 'ثلاثين': 30, 'اربعين': 40, 'أربعين': 40, 'خمسين': 50, 'ستين': 60, 'سبعين': 70, 'ثمانين': 80, 'تسعين': 90, 'مية': 100, 'مائة': 100, 'مئة': 100, 'ميه': 100, 'مائتين': 200, 'مئتين': 200, 'ثلاثمائة': 300, 'ثلاثمية': 300, 'اربعمائة': 400, 'أربعمائة': 400, 'خمسمائة': 500, 'خمسمية': 500, 'الف': 1000, 'ألف': 1000 };
  function localParse(text) {
    var last = (H.curQ().lines.slice(-1)[0] || {}).group || 'بنود أخرى';
    var tx = String(text).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); });
    return tx.split(/[\n،,؛;]|\s+ثم\s+/).map(function (seg) { return seg.trim(); }).filter(Boolean).map(function (seg) {
      var toks = seg.split(/\s+/), qty = 0, hasQ = false, rest = [], prevN = 0;
      toks.forEach(function (t) { var w = t.replace(/^و(?=[^\s])/, ''), bare = w.replace(/[^؀-ۿ\d.]/g, ''); if (/^\d+(\.\d+)?$/.test(bare)) { qty += parseFloat(bare); hasQ = true; } else if (NUMW[bare] != null) { if (NUMW[bare] === 100 && prevN >= 2 && prevN <= 9) qty += prevN * 99; else qty += NUMW[bare]; prevN = NUMW[bare]; hasQ = true; } else if (/^(عدد|حبة|قطعة|قطع|حبات|وحدة|وحدات|كمية|عدده)$/.test(bare)) { /* filler */ } else rest.push(t); });
      var desc = rest.join(' ').trim(), it = bestItem(desc);
      return { desc: it && !desc ? it.desc : desc, unit: it ? it.unit : 'NO', qty: hasQ && qty > 0 ? qty : 1, price: it ? it.price : 0, it: it, group: it ? it.cat : last, brand: it ? it.brand : '' };
    }).filter(function (r) { return r.desc; });
  }
  function voiceModal() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    H.modal('<h3>إدخال بالصوت أو النص</h3><p class="muted" style="margin-top:0;font-size:12.5px">أملِ البنود بالعربية («عشرين كاشف دخان وخمسة أجراس إنذار») أو الصق طلب العميل أو جدول الكميات. راجع النتيجة قبل الإدراج؛ لا تُسعَّر البنود إلا من المكتبة.</p><textarea id="vt" rows="5" placeholder="النص هنا…" style="width:100%"></textarea><div class="row" style="margin-top:8px">' + (SR ? '<button class="btn" id="vmic" type="button">🎤 بدء الإملاء</button>' : '<span class="muted" style="font-size:12px">الإملاء الصوتي غير مدعوم في هذا المتصفح (يعمل في Chrome وSafari).</span>') + '<label class="btn sm" style="cursor:pointer">ملف CSV / Excel / نص<input id="vf" type="file" accept=".csv,.txt,.xlsx,.xls" hidden></label><div class="sp"></div><button class="btn" id="vloc" type="button">مطابقة محلية</button><button class="btn pri" id="vai" type="button">تحليل ذكي</button></div><div id="vp" style="margin-top:10px"></div><div class="row" style="margin-top:12px"><button class="btn pri" id="vok" type="button" disabled>إضافة للعرض</button><button class="btn" data-act="modal-close" type="button">إغلاق</button></div>', function (m) {
      var rows = [], rec = null, ta = $('#vt', m);
      var show = function () {
        $('#vp', m).innerHTML = rows.length ? '<div class="tablewrap" style="max-height:260px;overflow:auto"><table class="t"><thead><tr><th></th><th>الوصف</th><th style="width:90px">الكمية</th><th>المكتبة</th></tr></thead><tbody>' + rows.map(function (r, i) { return '<tr data-i="' + i + '"><td><input type="checkbox" data-vz="on" checked style="width:auto"></td><td>' + esc(r.desc) + (r.note ? '<br><small class="muted">' + esc(r.note) + '</small>' : '') + '</td><td><input data-vz="qty" type="number" min="0" step="any" value="' + r.qty + '"></td><td>' + (r.it ? '<span class="chip ok">' + esc(r.it.desc.slice(0, 40)) + '</span>' : '<span class="chip warn">بند حر بلا سعر</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
        $('#vok', m).disabled = !rows.length; $('#vok', m).textContent = rows.length ? 'إضافة ' + rows.length + ' بند للعرض' : 'إضافة للعرض';
      };
      var local = function () { var t = ta.value; rows = t.indexOf('\t') >= 0 || /[|;]/.test(t) ? parseRows(t) : localParse(t); show(); if (!rows.length) H.toast('لم أجد بنوداً في النص'); };
      $('#vloc', m).onclick = local;
      $('#vai', m).onclick = function () {
        var t = ta.value.trim(); if (t.length < 3) return H.toast('اكتب أو أملِ نصاً أولاً'); var b = this; b.disabled = true; b.textContent = 'جارٍ التحليل…';
        H.api('POST', '/ai/lines', { text: t }).then(function (r) { var last = (H.curQ().lines.slice(-1)[0] || {}).group || 'بنود أخرى'; rows = r.lines.map(function (l) { var it = l.lib && S().items.filter(function (i) { return i.id === l.lib; })[0]; return { desc: it && !l.desc ? it.desc : l.desc, unit: l.unit || (it ? it.unit : 'NO'), qty: l.qty, price: it ? it.price : 0, it: it || null, group: it ? it.cat : last, brand: it ? it.brand : '', note: l.note }; }); show(); })
          .catch(function (e) { if (e.status === 501) { H.toast('التحليل الذكي غير مفعّل؛ استُخدمت المطابقة المحلية'); local(); } else H.fail(e); }).then(function () { b.disabled = false; b.textContent = 'تحليل ذكي'; });
      };
      $('#vp', m).oninput = $('#vp', m).onchange = function (e) { var t = e.target; if (t.dataset.vz === 'qty') rows[+t.closest('tr').dataset.i].qty = n0(t.value); };
      $('#vok', m).onclick = function () {
        var keep = rows.filter(function (r, i) { var cb = $('tr[data-i="' + i + '"] [data-vz=on]', m); return cb && cb.checked; }); H.closeModal();
        addLines(keep.map(function (r) { var l = { lib: r.it ? r.it.id : '', group: r.group, desc: r.desc, brand: r.brand, unit: r.unit, qty: r.qty, price: r.price }; if (r.it && r.it.est) l.est = true; if (r.it && n0(r.it.cost) > 0 && H.P().seeCost) l.cost = r.it.cost; return l; }));
      };
      $('#vf', m).onchange = function () {
        var f = this.files[0]; if (!f) return;
        if (/\.xlsx?$/i.test(f.name)) { if (!window.XLSX) return H.toast('أداة Excel غير محمّلة، احفظ الملف بصيغة CSV'); var rd = new FileReader(); rd.onload = function () { try { var wb = window.XLSX.read(rd.result, { type: 'array' }); ta.value = window.XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: '\t' }); local(); } catch (e) { H.toast('تعذر قراءة الملف'); } }; rd.readAsArrayBuffer(f); }
        else f.text().then(function (t) { ta.value = t.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\t'); local(); });
      };
      if (SR) {
        $('#vmic', m).onclick = function () {
          var b = this; if (rec) { rec.stop(); return; }
          rec = new SR(); rec.lang = 'ar-SA'; rec.continuous = true; rec.interimResults = false;
          rec.onresult = function (ev) { for (var i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) ta.value += (ta.value && !/\s$/.test(ta.value) ? ' ، ' : '') + ev.results[i][0].transcript; };
          rec.onend = function () { rec = null; if (b.isConnected) b.textContent = '🎤 بدء الإملاء'; }; rec.onerror = function (e) { H.toast(e.error === 'not-allowed' ? 'اسمح للمتصفح باستخدام الميكروفون' : 'تعذر الإملاء الصوتي'); };
          try { rec.start(); b.textContent = '⏹ إيقاف الإملاء'; } catch (e) { rec = null; }
        };
      }
      m.addEventListener('click', function (e) { if (e.target.dataset && e.target.dataset.act === 'modal-close' && rec) { try { rec.stop(); } catch (x) { /* ignore */ } } });
    });
  }
  /* percentage / rounding on every price */
  function markupModal() {
    var q = H.curQ(), groups = Object.keys(q.lines.reduce(function (a, l) { a[l.group] = 1; return a; }, {}));
    H.modal('<h3>تعديل الأسعار بنسبة</h3><div class="grid g2"><label class="fld"><span>النسبة % (موجب للزيادة، سالب للتخفيض)</span><input id="mp" type="number" step="any" value="5"></label><label class="fld"><span>التقريب</span><select id="mr"><option value="0">بدون</option><option value="1">لأقرب ريال</option><option value="5">لأقرب 5 ريال</option><option value="10">لأقرب 10 ريال</option></select></label></div><label class="fld" style="margin-top:10px"><span>النطاق</span><select id="mg"><option value="">كل البنود</option>' + groups.map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('') + '</select></label><p class="muted" style="font-size:12.5px">يُطبَّق على سعر الوحدة لكل بند. ويمكنك إرجاع أسعار أصناف المكتبة بزر «إرجاع لأسعار المكتبة».</p><div class="row" style="margin-top:12px"><button class="btn pri" id="mok" type="button">تطبيق</button><button class="btn" id="mrs" type="button">إرجاع لأسعار المكتبة</button><button class="btn" data-act="modal-close" type="button">إلغاء</button></div>', function (m) {
      function apply(fn) { var g = $('#mg', m).value, n = 0, before = JSON.stringify(q.lines); q.lines.forEach(function (l) { if (g && l.group !== g) return; var np = fn(l); if (np != null && np !== l.price) { l.price = np; delete l.est; n++; } }); H.saveS(); H.closeModal(); H.renderLines(); H.toastUndo('عُدّل سعر ' + n + ' بند', function () { q.lines = JSON.parse(before); H.saveS(); H.renderLines(); }); }
      $('#mok', m).onclick = function () { var pct = n0($('#mp', m).value), rd = n0($('#mr', m).value); apply(function (l) { var v = n0(l.price) * (1 + pct / 100); v = rd ? Math.round(v / rd) * rd : R.r2(v); return Math.max(0, v); }); };
      $('#mrs', m).onclick = function () { apply(function (l) { var it = l.lib && S().items.filter(function (i) { return i.id === l.lib; })[0]; return it ? it.price : null; }); };
    });
  }
  window.SPD = { tools: tools, open: openPalette, help: help };
})();
