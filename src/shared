/* Shared calculations + printable document builders (used by the browser app, the public approval page and the server). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RASS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var n0 = function (v) { var x = parseFloat(v); return isFinite(x) ? x : 0; };
  var r2 = function (n) { return Math.round((n0(n) + Number.EPSILON) * 100) / 100; };
  var fmt = function (n) { return n0(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var qtyF = function (n) { return Number.isInteger(n0(n)) ? String(n0(n)) : String(r2(n)); };
  var norm = function (s) { return String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي'); };
  var fmtDate = function (iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var ORD = ['أولاً', 'ثانياً', 'ثالثاً', 'رابعاً', 'خامساً', 'سادساً', 'سابعاً', 'ثامناً', 'تاسعاً', 'عاشراً'];

  /* safe arithmetic for quantity cells (+ - * / ( ) and Arabic-Indic digits); no eval */
  function calcExpr(src) {
    var s = String(src == null ? '' : src).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/،|,/g, '.').replace(/\s+/g, '');
    if (s === '') return 0; if (!/^[0-9+\-*/().]+$/.test(s)) return null;
    var i = 0, bad = false;
    function num() { var m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) { bad = true; return 0; } i += m[0].length; return parseFloat(m[0]); }
    function atom() { if (s[i] === '(') { i++; var v = add(); if (s[i] !== ')') bad = true; else i++; return v; } if (s[i] === '-') { i++; return -atom(); } if (s[i] === '+') { i++; return atom(); } return num(); }
    function mul() { var v = atom(); while (s[i] === '*' || s[i] === '/') { var o = s[i++], r = atom(); v = o === '*' ? v * r : (r === 0 ? (bad = true, 0) : v / r); } return v; }
    function add() { var v = mul(); while (s[i] === '+' || s[i] === '-') { var o = s[i++], r = mul(); v = o === '+' ? v + r : v - r; } return v; }
    var out = add(); if (bad || i !== s.length || !isFinite(out)) return null; return Math.round(out * 1e6) / 1e6;
  }

  /* ---------- Arabic amount in words ---------- */
  var O = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  var T = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  var H = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  function b1000(n) { var h = Math.floor(n / 100), r = n % 100, p = []; if (h) p.push(H[h]); if (r) { if (r < 20) p.push(O[r]); else { var u = r % 10; if (u) p.push(O[u]); p.push(T[Math.floor(r / 10)]); } } return p.join(' و'); }
  function words(n) {
    n = Math.floor(n); if (n === 0) return 'صفر'; var parts = [];
    var m = Math.floor(n / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000;
    if (m) parts.push(m === 1 ? 'مليون' : m === 2 ? 'مليونان' : m <= 10 ? b1000(m) + ' ملايين' : b1000(m) + ' مليون');
    if (k) parts.push(k === 1 ? 'ألف' : k === 2 ? 'ألفان' : k <= 10 ? b1000(k) + ' آلاف' : b1000(k) + ' ألف');
    if (r) parts.push(b1000(r)); return parts.join(' و');
  }
  function sarWords(v) { v = r2(v); var i = Math.floor(v), h = Math.round((v - i) * 100); return 'فقط ' + words(i) + ' ريال سعودي' + (h ? ' و' + words(h) + ' هللة' : '') + ' لا غير'; }

  /* ---------- calculations ---------- */
  function groupLines(lines) { var g = [], m = {}; (lines || []).forEach(function (l) { var k = l.group || 'بنود أخرى'; if (!m[k]) { m[k] = { name: k, lines: [] }; g.push(m[k]); } m[k].lines.push(l); }); return g; }
  var lineTot = function (l) { return r2(n0(l.qty) * n0(l.price)); };
  function calc(q) {
    var groups = groupLines(q.lines).map(function (g) { return { name: g.name, lines: g.lines, sub: r2(g.lines.reduce(function (a, l) { return a + lineTot(l); }, 0)) }; });
    var sub = r2(groups.reduce(function (a, g) { return a + g.sub; }, 0));
    var vat = r2(sub * n0(q.vatRate) / 100), gross = r2(sub + vat);
    var disc = q.discMode === 'amt' ? r2(Math.min(n0(q.discAmt), gross)) : r2(gross * n0(q.discPct) / 100);
    var pct = q.discMode === 'amt' ? (gross ? disc / gross * 100 : 0) : n0(q.discPct);
    var total = r2(gross - disc);
    return { groups: groups, sub: sub, vat: vat, gross: gross, disc: disc, pct: pct, total: total };
  }
  /* profitability: revenue is the quote total before VAT after the discount; cost counts only lines that have a cost */
  function margin(q) {
    var c = calc(q), ratio = c.gross > 0 ? c.total / c.gross : 1, cost = 0, revC = 0, revAll = 0, n = 0, nc = 0;
    (q.lines || []).forEach(function (l) { var rev = lineTot(l) * ratio / (1 + n0(q.vatRate) / 100); revAll += rev; n++; if (n0(l.cost) > 0) { cost += n0(l.qty) * n0(l.cost); revC += rev; nc++; } });
    var m = revC - cost;
    return { rev: r2(revAll), revCosted: r2(revC), cost: r2(cost), margin: r2(m), pct: revC > 0 ? m / revC * 100 : null, cover: revAll > 0 ? revC / revAll : 0, lines: n, costed: nc };
  }
  var pctSum = function (c) { return r2((c.payments || []).reduce(function (a, p) { return a + n0(p.pct); }, 0)); };
  function payRows(c, total) { var acc = 0, full = pctSum(c) === 100; return (c.payments || []).map(function (p, i) { var last = i === c.payments.length - 1; var amt = last && full ? r2(total - acc) : r2(total * n0(p.pct) / 100); acc = r2(acc + amt); return Object.assign({}, p, { amt: amt }); }); }
  function cTotal(q) { var k = q.contract, c = calc(q); return k && k.override !== '' && k.override != null && n0(k.override) > 0 ? r2(k.override) : c.total; }

  /* ---------- templates (themes) ----------
     The original design is the built-in default (id ''), reproduced exactly. A custom template only changes CSS variables, a few
     classes and which sections / columns / labels are shown, so the same builders serve every template. */
  var FONTS = {
    classic: { n: 'Arial (الأصلي)', f: 'Arial,"Liberation Sans","Segoe UI",Tahoma,sans-serif' },
    tahoma: { n: 'Tahoma', f: 'Tahoma,"Segoe UI",Arial,sans-serif' },
    times: { n: 'Times New Roman', f: '"Times New Roman","Liberation Serif",Times,serif' },
    cairo: { n: 'Cairo — القاهرة', f: '"Cairo",Arial,sans-serif', web: 1 },
    tajawal: { n: 'Tajawal — تجوال', f: '"Tajawal",Arial,sans-serif', web: 1 },
    almarai: { n: 'Almarai — المرعي', f: '"Almarai",Arial,sans-serif', web: 1 },
    plex: { n: 'IBM Plex Sans Arabic', f: '"IBM Plex Sans Arabic",Arial,sans-serif', web: 1 },
    kufi: { n: 'Noto Kufi Arabic — كوفي', f: '"Noto Kufi Arabic",Arial,sans-serif', web: 1 },
    naskh: { n: 'Noto Naskh Arabic — نسخ', f: '"Noto Naskh Arabic","Times New Roman",serif', web: 1 },
    amiri: { n: 'Amiri — أميري', f: '"Amiri","Times New Roman",serif', web: 1 },
    messiri: { n: 'El Messiri — المسيري', f: '"El Messiri",Arial,sans-serif', web: 1 }
  };
  var LABELS = {
    /* key: [default text, group, hint] — a custom template may override any of them */
    qSub: ['QUOTATION | عرض سعر', 'عنوان المستند'], cSub: ['عقد تنفيذ أعمال أنظمة الأمن والسلامة', 'عنوان المستند'],
    mNo: ['رقم العرض / Quote No.', 'بيانات العرض'], mDate: ['التاريخ / Date', 'بيانات العرض'], mClient: ['العميل / Client', 'بيانات العرض'], mProject: ['المشروع / Project', 'بيانات العرض'], mLoc: ['الموقع / Location', 'بيانات العرض'], mValid: ['مدة العرض / Validity', 'بيانات العرض'],
    thNo: ['الرقم', 'جدول البنود'], thDesc: ['الوصف', 'جدول البنود'], thBrand: ['النوع', 'جدول البنود'], thUnit: ['الوحدة', 'جدول البنود'], thQty: ['العدد', 'جدول البنود'], thPrice: ['السعر الفردي', 'جدول البنود'], thTotal: ['الإجمالي', 'جدول البنود'],
    sumT: ['إجمالي عرض السعر', 'الإجماليات'], sumSub: ['الإجمالي قبل الضريبة', 'الإجماليات'], sumVat: ['القيمة المضافة', 'الإجماليات'], sumGross: ['الإجمالي شامل الضريبة', 'الإجماليات'], sumDisc: ['خصم خاص للعميل', 'الإجماليات'], sumNet: ['الصافي النهائي بعد الخصم', 'الإجماليات'], sumAgreed: ['المبلغ المتفق عليه للعقد', 'الإجماليات'],
    termsT: ['الشروط والملاحظات / Terms & Notes', 'أسفل العرض'], apprT: ['اعتماد العميل / Client Approval', 'أسفل العرض'], prepT: ['إعداد العرض / Prepared by', 'أسفل العرض'],
    cmNo: ['رقم العرض', 'بيانات العقد'], cmDate: ['التاريخ', 'بيانات العقد'], cmP1: ['الطرف الأول', 'بيانات العقد'], cmP2: ['الطرف الثاني', 'بيانات العقد'], cmProj: ['المشروع', 'بيانات العقد'], cmLoc: ['الموقع', 'بيانات العقد'], cmDur: ['مدة التنفيذ', 'بيانات العقد'], cmRef: ['مرجع العقد', 'بيانات العقد'],
    payCap: ['طريقة الدفعات', 'العقد'], ctermsT: ['الشروط العامة', 'العقد'], sigP1: ['الطرف الأول', 'التوقيعات'], sigP2: ['الطرف الثاني', 'التوقيعات']
  };
  var TPL0 = {
    id: '', name: 'القالب الأصلي', paper: 'letter',
    theme: { navy: '#17365D', light: '#D9EAF7', head: '#A6C9EC', band: '#DAE9F8', band2: '#EEF5FA', accent: '#2E6DA4', red: '#C00000', text: '#000000', line: '#000000' },
    font: { body: 'classic', head: 'classic', scale: 1 },
    head: { style: 'classic', logoH: 25, note: '' },
    bar: 'solid',
    table: { border: 'thin', zebra: true, group: 'solid', cols: { no: true, brand: true, unit: true } },
    show: { thanks: true, brandBar: true, stamp: true, footer: true, approval: true, prep: true, terms: true, words: true },
    order: { quote: ['meta', 'thanks', 'items', 'summary', 'foot2'], contract: ['meta', 'intro', 'items', 'summary', 'pay', 'paynote', 'terms', 'closing', 'sigs'] },
    labels: {}, watermark: '', footNote: '', margin: { top: 7, side: 10 }
  };
  var ORDER_KEYS = TPL0.order;
  function merge(base, o) {
    if (!o || typeof o !== 'object') return base;
    var r = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(o).forEach(function (k) {
      if (Array.isArray(base[k])) r[k] = Array.isArray(o[k]) ? o[k].slice() : base[k];
      else if (base[k] && typeof base[k] === 'object') r[k] = merge(base[k], o[k]);
      else if (base[k] === undefined && k === 'labels') r[k] = o[k];
      else if (o[k] != null) r[k] = o[k];
    });
    return r;
  }
  /* a stored template -> a complete one (missing parts fall back to the original; orders are repaired) */
  function rt(t) {
    if (t && t.__rt) return t;
    var r = merge(TPL0, t || {}); r.labels = Object.assign({}, t && t.labels || {});
    ['quote', 'contract'].forEach(function (k) {
      var def = ORDER_KEYS[k], got = (r.order[k] || []).filter(function (x, i, a) { return def.indexOf(x) >= 0 && a.indexOf(x) === i; });
      def.forEach(function (x) { if (got.indexOf(x) < 0) got.push(x); }); r.order[k] = got;
    });
    r.custom = !!(t && t.id); r.__rt = true; return r;
  }
  function tplFor(s, kind, q) {
    var id = '';
    if (q) id = kind === 'contract' ? (q.contract && q.contract.tpl) || '' : q.tpl || '';
    if (!id && s && s.tplDef) id = s.tplDef[kind] || '';
    if (id === 'classic') return rt(null);
    var f = id && s && (s.templates || []).filter(function (x) { return x.id === id; })[0];
    return rt(f || null);
  }
  function lab(t, k, html) { var v = t.labels[k]; return v != null && v !== '' ? esc(v) : (html != null ? html : esc(LABELS[k][0])); }
  function docCls(t) {
    if (!t.custom) return 'doc';
    return 'doc tp hd-' + t.head.style + ' bar-' + t.bar + ' tb-' + t.table.border + (t.table.zebra ? '' : ' nz') + ' gh-' + t.table.group;
  }
  function fontStack(key, s) {
    if (FONTS[key]) return FONTS[key].f;
    var m = /^c:(.+)$/.exec(key || ''), f = m && s && (s.fonts || []).filter(function (x) { return x.id === m[1]; })[0];
    return f ? '"RASSF_' + f.id + '",Arial,sans-serif' : FONTS.classic.f;
  }
  function docStyle(t, s) {
    if (!t.custom) return '';
    var th = t.theme, v = [['navy', th.navy], ['light', th.light], ['head', th.head], ['band', th.band], ['band2', th.band2], ['accent', th.accent], ['red', th.red], ['text', th.text], ['bd', th.line]]
      .map(function (x) { return '--rd-' + x[0] + ':' + hex(x[1]); });
    v.push('--rd-ff:' + fontStack(t.font.body, s), '--rd-fh:' + fontStack(t.font.head, s), '--rd-k:' + Math.min(1.4, Math.max(0.7, n0(t.font.scale) || 1)), '--rd-logoH:' + Math.min(45, Math.max(10, n0(t.head.logoH) || 25)) + 'mm');
    return esc(v.join(';'));
  }
  function hex(c) { return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#000000'; }
  /* @font-face rules for the company's own uploaded fonts (injected once per page, not per document) */
  function fontCss(s) {
    return (s && s.fonts || []).map(function (f) { return '@font-face{font-family:"RASSF_' + f.id + '";src:url(' + f.data + ');font-display:swap}'; }).join('');
  }
  function pageCss(t) {
    var m = t.margin || {}, side = Math.min(30, Math.max(0, n0(m.side))), top = Math.min(30, Math.max(0, n0(m.top)));
    return '@page{size:' + (t.paper === 'a4' ? 'A4' : 'Letter') + ';margin:' + top + 'mm ' + side + 'mm 0 ' + side + 'mm}';
  }

  /* ---------- document pieces ---------- */
  function repl(s, t) { return String(t || '').replace(/\{BANK\}/g, s.bankName || '').replace(/\{IBAN\}/g, s.iban || ''); }
  var LOGO = '/logo.png';
  function head(s, t) {
    t = rt(t || tplFor(s, 'receipt'));
    var logo = '<img src="' + esc(s.logo || LOGO) + '" alt="">', hs = t.head.style, note = t.head.note ? '<div class="dh-note">' + esc(t.head.note) + '</div>' : '';
    var ar = esc(s.nameAr) + '<br>س.ت: ' + esc(s.cr) + '<br>الرقم الضريبي: ' + esc(s.vat), en = esc(s.nameEn) + '<br>C.R. No.: ' + esc(s.cr) + '<br>VAT No.: ' + esc(s.vat);
    if (hs === 'center') return '<div class="dh dh-ctr"><div class="dh-c">' + logo + '</div><div class="dh-nm"><b>' + esc(s.nameAr) + '</b> <span dir="ltr">· ' + esc(s.nameEn) + '</span></div><div class="dh-id">س.ت: ' + esc(s.cr) + ' &nbsp;|&nbsp; الرقم الضريبي: ' + esc(s.vat) + '</div></div>' + note;
    if (hs === 'minimal') return '<div class="dh dh-min"><div class="dh-r"><b>' + esc(s.nameAr) + '</b><br>س.ت: ' + esc(s.cr) + ' · الرقم الضريبي: ' + esc(s.vat) + '</div><div class="dh-l"><b>' + esc(s.nameEn) + '</b><br>C.R. ' + esc(s.cr) + ' · VAT ' + esc(s.vat) + '</div></div>' + note;
    if (hs === 'band') return '<div class="dh dh-band"><div class="dh-c">' + logo + '</div><div class="dh-r"><b>' + esc(s.nameAr) + '</b><br>س.ت: ' + esc(s.cr) + ' · الرقم الضريبي: ' + esc(s.vat) + '</div><div class="dh-l"><b>' + esc(s.nameEn) + '</b><br>C.R. ' + esc(s.cr) + ' · VAT ' + esc(s.vat) + '</div></div>' + note;
    return '<div class="dh"><div class="dh-r">' + ar + '</div><div class="dh-c">' + logo + '</div><div class="dh-l">' + en + '</div></div>' + note;
  }
  function foot(s, t) {
    t = rt(t || tplFor(s, 'receipt'));
    if (t.custom && !t.show.footer) return '';
    var extra = t.footNote ? '<div class="d-fnote">' + esc(t.footNote) + '</div>' : '';
    return '<div class="d-foot"><span>' + esc(s.phone1) + '</span> | <span>' + esc(s.phone2) + ' VAT No- ' + esc(s.vat) + '</span> | <span>' + esc(s.email) + '</span> | <span>' + esc(s.web) + '</span><img class="d-flogo" src="' + esc(s.logo || LOGO) + '" alt=""></div>' + extra;
  }
  function wrap(s, inner, t) {
    t = rt(t || tplFor(s, 'receipt'));
    var st = docStyle(t, s);
    return '<div class="' + docCls(t) + '"' + (st ? ' style="' + st + '"' : '') + ' data-paper="' + t.paper + '" data-page="' + esc(pageCss(t)) + '">' + (t.watermark ? '<div class="wm">' + esc(t.watermark) + '</div>' : '') +
      '<table class="pg"><thead><tr><td>' + head(s, t) + '</td></tr></thead><tbody><tr><td>' + inner + '</td></tr></tbody><tfoot><tr><td>' + foot(s, t) + '</td></tr></tfoot></table></div>';
  }
  function bars(s, sub, t) {
    t = rt(t || tplFor(s, 'receipt'));
    return (!t.custom || t.show.brandBar ? '<div class="d-bar">' + esc(t.labels.brandBar || s.brandEn) + '</div>' : '') + '<div class="d-sub">' + sub + '</div>';
  }
  function stampImg(s, cls, t) { t = rt(t || tplFor(s, 'receipt')); return s.stamp && (!t.custom || t.show.stamp) ? '<img class="' + cls + '" src="' + esc(s.stamp) + '" alt="">' : ''; }
  function pair(label, value) { return '<div class="mp"><i>' + label + '</i><span>' + value + '</span></div>'; }

  function itemsTable(q, t) {
    t = rt(t || tplFor(null, 'quote', q));
    var C = t.table.cols, cols = [['no', C.no, 4.5, 'thNo'], ['desc', true, 0, 'thDesc'], ['brand', C.brand, 10, 'thBrand'], ['unit', C.unit, 8, 'thUnit'], ['qty', true, 8, 'thQty'], ['price', true, 12, 'thPrice'], ['tot', true, 13, 'thTotal']].filter(function (c) { return c[1]; });
    var h = '<table class="it"><colgroup>' + cols.map(function (c) { return c[2] ? '<col style="width:' + c[2] + '%">' : '<col>'; }).join('') + '</colgroup><thead><tr>' + cols.map(function (c) { return '<th>' + lab(t, c[3]) + '</th>'; }).join('') + '</tr></thead><tbody>';
    groupLines(q.lines).forEach(function (g, gi) {
      h += '<tr class="gh"><td colspan="' + cols.length + '">' + (ORD[gi] || '') + ': ' + esc(g.name) + '</td></tr>';
      g.lines.forEach(function (l, i) {
        var cell = { no: '<td class="c">' + (i + 1) + '</td>', desc: '<td class="ds">' + esc(l.desc) + '</td>', brand: '<td class="c">' + esc(l.brand) + '</td>', unit: '<td class="c">' + esc(l.unit) + '</td>', qty: '<td class="c">' + qtyF(l.qty) + '</td>', price: '<td class="e">' + fmt(l.price) + '</td>', tot: '<td class="e">' + fmt(lineTot(l)) + '</td>' };
        h += '<tr class="' + (i % 2 ? 'b' : '') + '">' + cols.map(function (c) { return cell[c[0]]; }).join('') + '</tr>';
      });
    });
    return h + '</tbody></table>';
  }
  function summaryTable(q, c, agreed, t) {
    t = rt(t || tplFor(null, 'quote', q));
    var n = 0, row = function (label, amt, cls) { n++; return '<tr class="' + (cls || '') + (n % 2 ? ' b' : '') + '"><td class="c">' + n + '</td><td class="c">' + label + '</td><td class="e">' + amt + '</td></tr>'; };
    var h = '<table class="sm"><colgroup><col style="width:4.5%"><col><col style="width:26%"></colgroup><thead><tr><th colspan="3">' + lab(t, 'sumT') + '</th></tr></thead><tbody>';
    c.groups.forEach(function (g) { h += row(esc(g.name.replace(/^توريد وتركيب /, '')), fmt(g.sub)); });
    h += row(lab(t, 'sumSub'), fmt(c.sub), 'k') + row(lab(t, 'sumVat') + ' ' + r2(q.vatRate) + '%', fmt(c.vat));
    if (c.disc > 0) h += row(lab(t, 'sumGross'), fmt(c.gross), 'k') + row(lab(t, 'sumDisc') + ' (' + r2(c.pct) + '%)', '- ' + fmt(c.disc)) + row(lab(t, 'sumNet'), fmt(c.total), 'k gt');
    else h += row(lab(t, 'sumGross'), fmt(c.total), 'k gt');
    if (agreed != null) h += row(lab(t, 'sumAgreed'), fmt(agreed), 'k agreed');
    return h + '</tbody></table>';
  }

  /* ---------- quote ---------- */
  function approvalBlock(q, t) {
    t = rt(t || tplFor(null, 'quote', q));
    var d = q._decision, ok = d && d.action === 'approve';
    var name = ok ? esc(d.name) : esc(q.client);
    var sig = ok && d.signature ? '<img class="sigimg" src="' + esc(d.signature) + '" alt="">' : '';
    var date = ok ? fmtDate(String(d.at || '').slice(0, 10)) : '____ / ____ / ________';
    return '<div class="approve"><div class="dbar">' + lab(t, 'apprT') + '</div><div class="sigspace"><div>الاسم: <b>' + name + '</b></div><div>التوقيع: ' + (sig || '______________________') + '</div><div>التاريخ: ' + date + '</div><div>الختم:</div></div>' + (ok ? '<div class="onl">اعتُمد إلكترونياً عبر رابط العرض بتاريخ ' + fmtDate(String(d.at || '').slice(0, 10)) + '</div>' : '') + '</div>';
  }
  function quoteDoc(s, q, t) {
    t = rt(t || tplFor(s, 'quote', q));
    var c = calc(q), sh = t.show, on = function (k) { return !t.custom || sh[k] !== false; };
    var notes = repl(s, q.notes).split('\n').filter(function (x) { return x.trim(); }).map(function (x) { return /^(IBAN|يتم الدفع)/i.test(x.trim()) ? '<li class="hl">' + esc(x) + '</li>' : '<li>' + esc(x) + '</li>'; }).join('');
    var sub = lab(t, 'qSub', '<bdi dir="ltr">QUOTATION</bdi> &nbsp;|&nbsp; عرض سعر');
    if (t.labels.qSub) sub = esc(t.labels.qSub);
    var sec = {
      meta: '<div class="d-meta q">' + pair(lab(t, 'mNo'), '<bdi dir="ltr">' + esc(q.no) + '</bdi>') + pair(lab(t, 'mDate'), fmtDate(q.date)) +
        pair(lab(t, 'mClient'), esc(q.client)) + pair(lab(t, 'mProject'), esc(q.project)) +
        pair(lab(t, 'mLoc'), esc(q.location)) + pair(lab(t, 'mValid'), esc(q.validity)) + '</div>',
      thanks: on('thanks') ? '<div class="d-thanks">' + esc(s.thanks) + '</div>' : '',
      items: itemsTable(q, t), summary: summaryTable(q, c, null, t),
      foot2: ''
    };
    var left = (on('terms') ? '<div class="dbar">' + lab(t, 'termsT') + '</div><ul>' + notes + '</ul>' : '') + (on('approval') ? approvalBlock(q, t) : '');
    var prep = on('prep') ? '<div class="prep"><div class="dbar">' + lab(t, 'prepT') + '</div><p>م / ' + esc(q.preparedBy) + '</p><p>التوقيع /</p>' + stampImg(s, 'stamp', t) + '</div>' : '';
    if (left || prep) sec.foot2 = '<div class="ft2' + (prep ? '' : ' nop') + '"><div class="terms">' + left + '</div>' + (prep ? '<div></div>' + prep : '') + '</div>';
    return wrap(s, bars(s, sub, t) + t.order.quote.map(function (k) { return sec[k]; }).join(''), t);
  }

  /* ---------- contract ---------- */
  function contractDoc(s, q, t) {
    t = rt(t || tplFor(s, 'contract', q));
    var k = q.contract, c = calc(q), sh = t.show;
    var agreed = k.override !== '' && k.override != null && n0(k.override) > 0 ? r2(k.override) : null;
    var total = agreed != null ? agreed : c.total, rows = payRows(k, total), hasDue = rows.some(function (p) { return p.due; });
    var pay = '<div class="pay-cap">' + lab(t, 'payCap') + '</div><table class="pay"><thead><tr><th style="width:5%">م</th><th>موعد الدفعة</th><th style="width:13%">النسبة</th>' + (hasDue ? '<th style="width:14%">الاستحقاق</th>' : '') + '<th style="width:20%">المبلغ</th></tr></thead><tbody>' +
      rows.map(function (p, i) { return '<tr><td class="c">' + (i + 1) + '</td><td class="c">' + esc(p.label) + '</td><td class="c">' + r2(p.pct) + '%</td>' + (hasDue ? '<td class="c">' + fmtDate(p.due) + '</td>' : '') + '<td class="e">' + fmt(p.amt) + '</td></tr>'; }).join('') +
      '<tr class="k"><td></td><td class="c">الإجمالي</td><td class="c">' + r2(pctSum(k)) + '%</td>' + (hasDue ? '<td></td>' : '') + '<td class="e">' + fmt(rows.reduce(function (a, p) { return a + p.amt; }, 0)) + '</td></tr></tbody></table>' + (!t.custom || sh.words !== false ? '<div class="words">' + esc(sarWords(total)) + '</div>' : '') + retentionNote(k);
    var terms = String(k.terms || '').split('\n').filter(function (x) { return x.trim(); }).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    var sec = {
      meta: '<div class="d-meta c">' + pair(lab(t, 'cmNo'), '<bdi dir="ltr">' + esc(q.no) + '</bdi>') + pair(lab(t, 'cmDate'), fmtDate(k.date)) + pair(lab(t, 'cmP1'), esc(s.nameAr)) + pair(lab(t, 'cmP2'), esc(k.party2)) +
        pair(lab(t, 'cmProj'), esc(q.project)) + pair(lab(t, 'cmLoc'), esc(q.location)) + pair(lab(t, 'cmDur'), esc(k.duration) + ' يوم') + pair(lab(t, 'cmRef'), 'عرض السعر وجدول الكميات') + '</div>',
      intro: '<div class="p-intro">' + esc(k.intro) + '</div>',
      items: k.items ? itemsTable(q, t) : '', summary: summaryTable(q, c, agreed, t), pay: pay,
      paynote: '<div class="p-note">' + esc(k.paynote) + '</div>',
      terms: '<div class="terms-h">' + lab(t, 'ctermsT') + '</div><ol class="cterms">' + terms + '</ol>',
      closing: '<div class="closing">' + esc(k.close) + '</div>',
      sigs: '<div class="sigs"><div class="sg"><b>' + lab(t, 'sigP2') + '</b><b>' + esc(k.party2) + '</b><div class="ln2">الاسم: ____________________</div><div class="ln2">التوقيع: __________________</div><div class="ln2">الختم:</div></div>' +
        '<div class="sg"><b>' + lab(t, 'sigP1') + '</b><b>' + esc(s.nameAr) + '</b><div class="ln2">الاسم: ____________________</div><div class="ln2">التوقيع: __________________</div><div class="ln2">الختم:</div>' + (k.stamp ? stampImg(s, 'stamp', t) : '') + '</div></div>'
    };
    return wrap(s, bars(s, lab(t, 'cSub'), t) + t.order.contract.map(function (x) { return sec[x]; }).join(''), t);
  }
  function retentionNote(k) { return n0(k.retention) > 0 ? '<div class="p-note"><b>الاحتجاز:</b> يُحتجز ' + r2(k.retention) + '% من قيمة كل دفعة كضمان حسن التنفيذ' + (k.retentionNote ? '، ' + esc(k.retentionNote) : '') + '.</div>' : ''; }


  /* ---------- tax invoice (ZATCA phase-1 QR: TLV -> base64) ---------- */
  function utf8(str) { return typeof TextEncoder !== 'undefined' ? Array.prototype.slice.call(new TextEncoder().encode(str)) : Array.prototype.slice.call(Buffer.from(str, 'utf8')); }
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 4096) s += String.fromCharCode.apply(null, bytes.slice(i, i + 4096)); return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); }
  function zatcaQR(seller, vat, iso, total, vatAmt) {
    var bytes = []; [seller, vat, iso, r2(total).toFixed(2), r2(vatAmt).toFixed(2)].forEach(function (v, i) { var b = utf8(String(v)); bytes.push(i + 1, b.length); b.forEach(function (x) { bytes.push(x); }); });
    return b64(bytes);
  }
  function invoiceDoc(s, v, t) {
    t = rt(t || tplFor(s, 'receipt'));
    var credit = v.kind === 'credit', se = v.seller || { name: s.nameAr, vat: s.vat, cr: s.cr, address: s.address || '' }, by = v.buyer || {};
    var iso = String(v.issuedAt || '').replace(/\.\d+/, '').replace(/\+00:00$/, 'Z');
    if (!/Z$/.test(iso)) { var d = v.issuedAt ? new Date(v.issuedAt) : new Date(); iso = d.toISOString().replace(/\.\d+Z$/, 'Z'); }
    var qr = zatcaQR(se.name, se.vat, iso, v.total, v.vat), svg = (typeof self !== 'undefined' && self.RASSQR) ? self.RASSQR(qr, 3) : '';
    var th = ['م', 'الوصف', 'الوحدة', 'الكمية', 'سعر الوحدة', 'قبل الضريبة', 'الضريبة', 'مبلغ الضريبة', 'الإجمالي'];
    var tbl = '<table class="it inv"><colgroup><col style="width:4%"><col><col style="width:7%"><col style="width:7%"><col style="width:11%"><col style="width:12%"><col style="width:7%"><col style="width:10%"><col style="width:12%"></colgroup><thead><tr>' + th.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (v.lines || []).map(function (l, i) { return '<tr class="' + (i % 2 ? 'b' : '') + '"><td class="c">' + (i + 1) + '</td><td class="ds">' + esc(l.desc) + '</td><td class="c">' + esc(l.unit) + '</td><td class="c">' + qtyF(l.qty) + '</td><td class="e">' + fmt(l.price) + '</td><td class="e">' + fmt(l.net) + '</td><td class="c">' + r2(l.vatRate) + '%</td><td class="e">' + fmt(l.vat) + '</td><td class="e">' + fmt(l.total) + '</td></tr>'; }).join('') + '</tbody></table>';
    var party = function (title, p, isSeller) { return '<div class="party"><div class="dbar">' + title + '</div><div class="pb"><b>' + esc(p.name) + '</b>' + (p.address ? '<div>' + esc(p.address) + '</div>' : '') + '<div>الرقم الضريبي: <bdi dir="ltr">' + esc(p.vat || '—') + '</bdi></div>' + (p.cr ? '<div>السجل التجاري: <bdi dir="ltr">' + esc(p.cr) + '</bdi></div>' : '') + '</div></div>'; };
    var tot = '<table class="sm inv-tot"><tbody><tr><td>الإجمالي قبل الضريبة / Total (Excluding VAT)</td><td class="e">' + fmt(v.subtotal) + '</td></tr><tr><td>مجموع ضريبة القيمة المضافة / Total VAT</td><td class="e">' + fmt(v.vat) + '</td></tr><tr class="k gt"><td>' + (credit ? 'إجمالي الإشعار شامل الضريبة' : 'الإجمالي المستحق شامل الضريبة') + ' / Total (Including VAT)</td><td class="e">' + fmt(v.total) + '</td></tr></tbody></table>';
    var inner = bars(s, credit ? 'إشعار دائن &nbsp;|&nbsp; <bdi dir="ltr">CREDIT NOTE</bdi>' : 'فاتورة ضريبية &nbsp;|&nbsp; <bdi dir="ltr">TAX INVOICE</bdi>', t) +
      '<div class="d-meta c">' + pair('رقم ' + (credit ? 'الإشعار' : 'الفاتورة'), '<bdi dir="ltr">' + esc(v.no || 'يُعطى عند الإصدار') + '</bdi>') + pair('تاريخ الإصدار', fmtDate(v.date)) + pair('تاريخ التوريد', fmtDate(v.supplyDate || v.date)) + pair(credit ? 'الفاتورة الأصلية' : 'المرجع', '<bdi dir="ltr">' + esc(credit ? v.refNo : (v.contractNo || '')) + '</bdi>') + '</div>' +
      '<div class="parties">' + party('البائع / Seller', se) + party('المشتري / Buyer', by) + '</div>' + (credit && v.reason ? '<div class="p-note"><b>سبب الإشعار:</b> ' + esc(v.reason) + '</div>' : '') + tbl + tot +
      '<div class="words">' + esc(sarWords(v.total)) + '</div><div class="inv-bot"><div class="inv-note">' + (v.note ? '<div class="p-note">' + esc(repl(s, v.note)) + '</div>' : '') + '<div class="p-note" style="color:#555">فاتورة إلكترونية مُنشأة وفق متطلبات مرحلة الإصدار (الأولى) لنظام الفوترة الإلكترونية.</div></div><div class="qr" title="QR">' + (svg || '<small>' + esc(qr) + '</small>') + '</div></div>';
    return wrap(s, inner, t);
  }

  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  /* ---------- variation orders & interim payment certificates (IPC) ---------- */
  function voCalc(d) {
    var lines = (d.lines || []).map(function (l) { var qty = Math.max(0, n0(l.qty)), price = Math.max(0, n0(l.price)); return { id: l.id, desc: l.desc, unit: l.unit, qty: qty, price: price, net: r2(qty * price) }; });
    var sub = r2(lines.reduce(function (a, l) { return a + l.net; }, 0)), vat = r2(sub * n0(d.vatRate) / 100), tot = r2(sub + vat), sg = d.dir === 'omit' ? -1 : 1;
    return { lines: lines, sub: sub, vat: vat, total: tot, signed: r2(sg * tot), signedNet: r2(sg * sub) };
  }
  /* d.lines[{id,desc,amt (ex-VAT contract value),pct (cumulative % to date)}]; prev = the previous approved/issued certificate's computed block (or null) */
  function ipcCalc(d, prev) {
    var P = prev || { work: 0, adv: 0, ret: 0 };
    var lines = (d.lines || []).map(function (l) { var amt = Math.max(0, n0(l.amt)), pct = Math.min(100, Math.max(0, n0(l.pct))); return { id: l.id, desc: l.desc, amt: amt, pct: pct, done: r2(amt * pct / 100) }; });
    var work = r2(lines.reduce(function (a, l) { return a + l.done; }, 0));
    var advTotal = Math.max(0, n0(d.advance)), advPct = Math.min(100, Math.max(0, n0(d.advPct))), retPct = Math.min(100, Math.max(0, n0(d.retPct)));
    var adv = r2(Math.min(advTotal, work * advPct / 100)), ret = r2(work * retPct / 100);
    var thisWork = r2(work - P.work), thisAdv = r2(adv - P.adv), thisRet = r2(ret - P.ret), ded = Math.max(0, n0(d.deduct));
    var taxable = r2(thisWork - thisAdv), vat = r2(taxable * n0(d.vatRate) / 100), payable = r2(taxable + vat - thisRet - ded);
    return { lines: lines, work: work, adv: adv, ret: ret, thisWork: thisWork, thisAdv: thisAdv, thisRet: thisRet, deduct: ded, taxable: taxable, vat: vat, payable: payable, contract: r2(lines.reduce(function (a, l) { return a + l.amt; }, 0)) };
  }
  function signBlock(s, a, b) { return '<div class="sigs">' + [a, b].map(function (x) { return '<div class="sg"><b>' + esc(x.role) + '</b><b>' + esc(x.name) + '</b><div class="ln2">الاسم: ' + (x.rep ? esc(x.rep) : '____________________') + '</div><div class="ln2">التوقيع: ____________________</div></div>'; }).join('') + '</div>'; }
  function voDoc(s, v, t) {
    t = rt(t || tplFor(s, 'contract')); var c = voCalc(v), omit = v.dir === 'omit';
    var tbl = '<table class="it"><thead><tr><th style="width:5%">م</th><th>الوصف</th><th style="width:9%">الوحدة</th><th style="width:9%">الكمية</th><th style="width:14%">السعر</th><th style="width:15%">الإجمالي</th></tr></thead><tbody>' + c.lines.map(function (l, i) { return '<tr class="' + (i % 2 ? 'b' : '') + '"><td class="c">' + (i + 1) + '</td><td class="ds">' + esc(l.desc) + '</td><td class="c">' + esc(l.unit) + '</td><td class="c">' + qtyF(l.qty) + '</td><td class="e">' + fmt(l.price) + '</td><td class="e">' + fmt(l.net) + '</td></tr>'; }).join('') + '</tbody></table>';
    var sm = '<table class="sm"><tbody><tr><td>إجمالي الأمر قبل الضريبة</td><td class="e">' + fmt(c.sub) + '</td></tr><tr><td>ضريبة القيمة المضافة (' + r2(n0(v.vatRate)) + '%)</td><td class="e">' + fmt(c.vat) + '</td></tr><tr class="k gt"><td>' + (omit ? 'قيمة التخفيض (تخصم من العقد)' : 'قيمة الزيادة (تضاف إلى العقد)') + '</td><td class="e">' + (omit ? '- ' : '+ ') + fmt(c.total) + '</td></tr>' + (v.contractNo ? '<tr><td>قيمة العقد قبل هذا الأمر</td><td class="e">' + fmt(v.before) + '</td></tr><tr class="k"><td>قيمة العقد بعد هذا الأمر</td><td class="e">' + fmt(r2(n0(v.before) + c.signed)) + '</td></tr>' : '') + '</tbody></table>';
    var inner = bars(s, 'أمر تغيير &nbsp;|&nbsp; <bdi dir="ltr">VARIATION ORDER</bdi>', t) + '<div class="d-meta c">' + pair('رقم الأمر', '<bdi dir="ltr">' + esc(v.no || 'يُعطى عند الحفظ') + '</bdi>') + pair('التاريخ', fmtDate(v.date)) + pair('العميل', esc(v.client || '')) + pair('المشروع', esc(v.project || '')) + pair('العقد المرجعي', '<bdi dir="ltr">' + esc(v.contractNo || '') + '</bdi>') + pair('الحالة', esc(({ draft: 'مسودة', submitted: 'مقدَّم للاعتماد', approved: 'معتمد', rejected: 'مرفوض' })[v.status] || '')) + '</div>' +
      '<div class="p-note"><b>موضوع الأمر:</b> ' + esc(v.title || '') + '</div>' + (v.reason ? '<div class="p-note"><b>المبرر:</b> ' + esc(v.reason) + '</div>' : '') + tbl + sm + (c.total > 0 ? '<div class="words">' + esc(sarWords(c.total)) + '</div>' : '') +
      (v.days ? '<div class="p-note"><b>أثره على مدة التنفيذ:</b> ' + (n0(v.days) > 0 ? 'تمديد ' : 'تخفيض ') + Math.abs(n0(v.days)) + ' يوم</div>' : '') + signBlock(s, { role: 'العميل', name: v.client, rep: '' }, { role: 'المقاول', name: s.nameAr, rep: v.rep1 });
    return wrap(s, inner, t);
  }
  function ipcDoc(s, v, t) {
    t = rt(t || tplFor(s, 'contract')); var c = v.calc || ipcCalc(v, null), L = c.lines || [];
    var tbl = '<table class="it"><thead><tr><th style="width:5%">م</th><th>الوصف</th><th style="width:16%">قيمة البند</th><th style="width:10%">الإنجاز التراكمي</th><th style="width:16%">المنجز حتى تاريخه</th></tr></thead><tbody>' + L.map(function (l, i) { return '<tr class="' + (i % 2 ? 'b' : '') + '"><td class="c">' + (i + 1) + '</td><td class="ds">' + esc(l.desc) + '</td><td class="e">' + fmt(l.amt) + '</td><td class="c">' + r2(l.pct) + '%</td><td class="e">' + fmt(l.done) + '</td></tr>'; }).join('') + '<tr class="k"><td></td><td class="ds">الإجمالي</td><td class="e">' + fmt(c.contract) + '</td><td></td><td class="e">' + fmt(c.work) + '</td></tr></tbody></table>';
    var row = function (a, b, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + a + '</td><td class="e">' + b + '</td></tr>'; };
    var sm = '<table class="sm"><thead><tr><th colspan="2">ملخص المستخلص</th></tr></thead><tbody>' + row('قيمة الأعمال المنجزة خلال هذه الفترة', fmt(c.thisWork)) + (c.thisAdv ? row('يخصم: استرداد الدفعة المقدمة', '- ' + fmt(c.thisAdv)) : '') + row('الصافي الخاضع للضريبة', fmt(c.taxable)) + row('ضريبة القيمة المضافة (' + r2(n0(v.vatRate)) + '%)', fmt(c.vat)) + (c.thisRet ? row('يخصم: استقطاع الضمان (' + r2(n0(v.retPct)) + '% تراكمياً)', '- ' + fmt(c.thisRet)) : '') + (c.deduct ? row('يخصم: خصومات أخرى' + (v.deductNote ? ' (' + esc(v.deductNote) + ')' : ''), '- ' + fmt(c.deduct)) : '') + row('صافي المستحق لهذا المستخلص', fmt(c.payable), 'k gt') + '</tbody></table>';
    var inner = bars(s, 'مستخلص رقم (' + esc(v.seq || '') + ') &nbsp;|&nbsp; <bdi dir="ltr">PAYMENT CERTIFICATE</bdi>', t) + '<div class="d-meta c">' + pair('رقم المستند', '<bdi dir="ltr">' + esc(v.no || 'يُعطى عند الحفظ') + '</bdi>') + pair('التاريخ', fmtDate(v.date)) + pair('العميل', esc(v.client || '')) + pair('المشروع', esc(v.project || '')) + pair('العقد المرجعي', '<bdi dir="ltr">' + esc(v.contractNo || '') + '</bdi>') + pair('الفترة حتى', fmtDate(v.periodTo)) + '</div>' + tbl + sm + (c.payable > 0 ? '<div class="words">' + esc(sarWords(c.payable)) + '</div>' : '') + (v.note ? '<div class="p-note">' + esc(v.note) + '</div>' : '') + '<div class="p-note" style="color:#555">حُسب المستحق على أساس: الضريبة على صافي الأعمال بعد استرداد الدفعة المقدمة، والاستقطاع يُخصم من الدفعة ولا يغيّر الوعاء الضريبي. تُراجع المعالجة الضريبية مع المحاسب.</div>' + signBlock(s, { role: 'العميل / الاستشاري', name: v.client, rep: '' }, { role: 'المقاول', name: s.nameAr, rep: v.rep1 });
    return wrap(s, inner, t);
  }

  /* ---------- agreements (clause-based documents) ---------- */
  var AGK = {
    main: { n: 'عقد تنفيذ أعمال', r1: 'المقاول', r2: 'العميل' }, sub: { n: 'اتفاقية مقاول من الباطن', r1: 'المقاول الرئيسي', r2: 'المقاول من الباطن' },
    supply: { n: 'عقد توريد', r1: 'البائع (المورِّد)', r2: 'المشتري' }, amc: { n: 'عقد صيانة', r1: 'مقدّم الخدمة', r2: 'العميل' },
    nda: { n: 'اتفاقية سرية وعدم إفصاح', r1: 'الطرف الأول', r2: 'الطرف الثاني' }, addendum: { n: 'ملحق عقد', r1: 'الطرف الأول', r2: 'الطرف الثاني' },
    handover: { n: 'محضر استلام', r1: 'الطرف المسلِّم', r2: 'الطرف المستلم' }, custom: { n: 'اتفاقية', r1: 'الطرف الأول', r2: 'الطرف الثاني' }
  };
  function agreementDoc(s, a, t) {
    t = rt(t || tplFor(s, 'contract', { contract: { tpl: a.tpl } }));
    var K = AGK[a.kind] || AGK.custom, p2 = a.party2 || {}, title = a.title || K.n, val = n0(a.value), delta = n0(a.delta), hasVal = val > 0 || delta !== 0;
    var pty = function (role, name, rep, repT, extra) { return '<div class="mp"><i>' + role + '</i><span><b>' + esc(name) + '</b>' + (rep ? '<br>ويمثله: ' + esc(rep) + (repT ? ' (' + esc(repT) + ')' : '') : '') + (extra || '') + '</span></div>'; };
    var meta = '<div class="d-meta c ag-meta">' + pair('رقم الوثيقة', '<bdi dir="ltr">' + esc(a.no || 'يُعطى عند الحفظ') + '</bdi>') + pair('التاريخ', fmtDate(a.date)) +
      pty('الطرف الأول (' + K.r1 + ')', s.nameAr, a.rep1, a.rep1Title, '<br>س.ت: <bdi dir="ltr">' + esc(s.cr) + '</bdi> · الرقم الضريبي: <bdi dir="ltr">' + esc(s.vat) + '</bdi>') +
      pty('الطرف الثاني (' + K.r2 + ')', p2.name, p2.rep, p2.repTitle, (p2.cr ? '<br>س.ت: <bdi dir="ltr">' + esc(p2.cr) + '</bdi>' : '') + (p2.vat ? ' · الرقم الضريبي: <bdi dir="ltr">' + esc(p2.vat) + '</bdi>' : '') + (p2.address ? '<br>' + esc(p2.address) : '')) +
      (a.project ? pair('المشروع', esc(a.project)) : '') + (a.location ? pair('الموقع', esc(a.location)) : '') + (a.duration ? pair('المدة', esc(a.duration) + ' يوم') : '') + (a.refNo ? pair('الاتفاقية الأصلية', '<bdi dir="ltr">' + esc(a.refNo) + '</bdi>') : '') + '</div>';
    var valBlock = '';
    if (hasVal) {
      var total = a.kind === 'addendum' ? r2(val + delta) : val;
      var rows = a.kind === 'addendum' ? '<tr><td>قيمة الاتفاقية الأصلية</td><td class="e">' + fmt(val) + '</td></tr><tr><td>قيمة هذا الملحق (' + (delta >= 0 ? 'زيادة' : 'تخفيض') + ')</td><td class="e">' + (delta >= 0 ? '+ ' : '- ') + fmt(Math.abs(delta)) + '</td></tr><tr class="k gt"><td>القيمة الإجمالية بعد التعديل</td><td class="e">' + fmt(total) + '</td></tr>' : '<tr class="k gt"><td>القيمة الإجمالية شاملة ضريبة القيمة المضافة</td><td class="e">' + fmt(total) + '</td></tr>';
      valBlock = '<table class="sm"><thead><tr><th colspan="2">القيمة المالية</th></tr></thead><tbody>' + rows + '</tbody></table>' + (total > 0 ? '<div class="words">' + esc(sarWords(total)) + '</div>' : '') + (a.valueNote ? '<div class="p-note">' + esc(a.valueNote) + '</div>' : '');
      var pr = payRows({ payments: a.payments || [] }, total);
      if (pr.length && total > 0 && a.kind !== 'addendum') valBlock += '<div class="pay-cap">طريقة الدفعات</div><table class="pay"><thead><tr><th style="width:5%">م</th><th>موعد الدفعة</th><th style="width:13%">النسبة</th><th style="width:20%">المبلغ</th></tr></thead><tbody>' + pr.map(function (p, i) { return '<tr><td class="c">' + (i + 1) + '</td><td class="c">' + esc(p.label) + '</td><td class="c">' + r2(p.pct) + '%</td><td class="e">' + fmt(p.amt) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    var cl = (a.clauses || []).filter(function (k) { return k.on !== false; });
    var clauses = cl.length ? '<div class="terms-h">أحكام وشروط الاتفاق</div><ol class="cterms ag-cl">' + cl.map(function (k) { return '<li>' + (k.title ? '<b>' + esc(k.title) + ':</b> ' : '') + esc(k.text) + '</li>'; }).join('') + '</ol>' : '';
    var sig = function (role, name, rep, repT, stamp) { return '<div class="sg"><b>' + role + '</b><b>' + esc(name) + '</b><div class="ln2">الاسم: ' + (rep ? esc(rep) : '____________________') + '</div><div class="ln2">الصفة: ' + (repT ? esc(repT) : '____________________') + '</div><div class="ln2">التوقيع: __________________</div><div class="ln2">التاريخ:     /     /</div><div class="ln2">الختم:</div>' + (stamp ? stampImg(s, 'stamp', t) : '') + '</div>'; };
    var inner = bars(s, esc(title), t) + meta + (a.intro ? '<div class="p-intro">' + esc(a.intro) + '</div>' : '') + valBlock + clauses + (a.notes ? '<div class="p-note"><b>ملاحظات:</b> ' + esc(a.notes) + '</div>' : '') + (a.closing ? '<div class="closing">' + esc(a.closing) + '</div>' : '') +
      '<div class="sigs">' + sig('الطرف الثاني', p2.name, p2.rep, p2.repTitle, false) + sig('الطرف الأول', s.nameAr, a.rep1, a.rep1Title, a.stamp !== false) + '</div>';
    return wrap(s, inner, t);
  }

  return { esc: esc, n0: n0, r2: r2, fmt: fmt, qtyF: qtyF, norm: norm, fmtDate: fmtDate, today: today, ORD: ORD, words: words, sarWords: sarWords,
    groupLines: groupLines, lineTot: lineTot, calc: calc, pctSum: pctSum, payRows: payRows, cTotal: cTotal, repl: repl,
    head: head, foot: foot, wrap: wrap, bars: bars, stampImg: stampImg, pair: pair, itemsTable: itemsTable, summaryTable: summaryTable,
    quoteDoc: quoteDoc, contractDoc: contractDoc,
    calcExpr: calcExpr, margin: margin, zatcaQR: zatcaQR, invoiceDoc: invoiceDoc, agreementDoc: agreementDoc, AGK: AGK, addDays: addDays, voCalc: voCalc, ipcCalc: ipcCalc, voDoc: voDoc, ipcDoc: ipcDoc, TPL0: TPL0, FONTS: FONTS, LABELS: LABELS, resolveTpl: rt, tplFor: tplFor, fontCss: fontCss, pageCss: pageCss, fontStack: fontStack };
});
