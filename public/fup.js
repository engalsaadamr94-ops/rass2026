/* Follow-up: sent quotes awaiting a decision (with link-open tracking) on the dashboard, and a pipeline board in the archive. */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc, n0 = R.n0, r2 = R.r2, fmt = R.fmt, fmtDate = R.fmtDate;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var S = function () { return H.S(); };
  var board = false;
  var STAGES = [['draft', 'مسودة', ''], ['sent', 'مرسل للعميل', 'warn'], ['won', 'معتمد', 'ok'], ['lost', 'ملغي', 'bad']];
  var days = function (iso) { return iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null; };
  var ago = function (iso) { var n = days(iso); return n == null ? '' : n === 0 ? 'اليوم' : n === 1 ? 'أمس' : 'قبل ' + n + ' يوم'; };
  var phoneOf = function (q) { var c = H.custById(q.custId); return c ? c.phone : ''; };
  var wa = function (phone, text) { var p = String(phone || '').replace(/\D/g, ''); if (/^05\d{8}$/.test(p)) p = '966' + p.slice(1); else if (/^5\d{8}$/.test(p)) p = '966' + p; return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text); };
  var who = function (q) { return H.custName(q.custId) || q.client; };

  function msg(q, kind) {
    var base = 'السلام عليكم ' + who(q) + '،\n', tail = '\nشركة رسس للمقاولات العامة';
    if (kind === 'open') return base + 'نشكركم على اطلاعكم على عرض السعر رقم ' + q.no + (q.project ? ' لمشروع «' + q.project + '»' : '') + '. هل لديكم أي استفسار أو ملاحظات نستطيع توضيحها؟' + tail;
    if (kind === 'unopened') return base + 'نأمل أن تكونوا قد استلمتم عرض السعر رقم ' + q.no + (q.project ? ' لمشروع «' + q.project + '»' : '') + ' بقيمة ' + fmt(R.calc(q).total) + ' ر.س. يسعدنا أن نشرحه لكم أو نعدّله بحسب احتياجكم.' + tail;
    return base + 'نود متابعة عرض السعر رقم ' + q.no + (q.project ? ' لمشروع «' + q.project + '»' : '') + ' ونأمل إفادتنا بقراركم حتى نحجز لكم الجدول الزمني للتنفيذ.' + tail;
  }
  function items() {
    var out = [];
    S().quotes.forEach(function (q) {
      if (q.status !== 'sent' || q._decision) return; var d = days(q._sentAt || q._updated), v = q._views || { n: 0 };
      var kind, label, pr;
      if (!v.n && d >= 2) { kind = 'unopened'; label = 'لم يفتح الرابط بعد'; pr = 2; }
      else if (v.n && days(v.last) <= 2) { kind = 'open'; label = 'فتح العرض ' + ago(v.last) + ' — وقت مناسب للاتصال'; pr = 3; }
      else if (d >= 7) { kind = 'late'; label = 'تأخر القرار ' + d + ' يوماً'; pr = 1; }
      else if (v.n && d >= 3) { kind = 'open'; label = 'فتح العرض ولم يقرر'; pr = 1; }
      else return;
      out.push({ q: q, kind: kind, label: label, pr: pr, d: d, v: v });
    });
    return out.sort(function (a, b) { return b.pr - a.pr || b.d - a.d; });
  }
  function dash() {
    var kp = $('#main .kpis'); if (!kp || $('#fupCard')) return; var list = items(); if (!list.length) return;
    var card = document.createElement('div'); card.className = 'card'; card.id = 'fupCard'; card.style.marginTop = '14px';
    card.innerHTML = '<h3>عروض بانتظار القرار <span class="chip warn">' + list.length + '</span></h3>' + list.slice(0, 8).map(function (x, i) { return '<div class="li"><div class="m"><b>' + esc(who(x.q)) + '</b><small>عرض <bdi dir="ltr">' + esc(x.q.no) + '</bdi>' + (x.q.project ? ' · ' + esc(x.q.project) : '') + '</small></div><div><span class="chip ' + (x.kind === 'open' ? 'ok' : x.kind === 'late' ? 'bad' : 'warn') + '">' + esc(x.label) + '</span><small class="muted" style="display:block">أُرسل ' + ago(x.q._sentAt || x.q._updated) + (x.v.n ? ' · فُتح ' + x.v.n + '×' : '') + '</small></div><div class="amt">' + fmt(R.calc(x.q).total) + '</div><div class="row" style="flex-wrap:nowrap"><button class="btn sm" type="button" data-fup="open" data-i="' + i + '">فتح</button><button class="btn sm pri" type="button" data-fup="wa" data-i="' + i + '">واتساب</button></div></div>'; }).join('');
    kp.parentNode.insertBefore(card, kp.nextSibling);
    card.onclick = function (e) { var b = e.target.closest('[data-fup]'); if (!b) return; var x = list[+b.dataset.i]; if (b.dataset.fup === 'open') H.go ? H.go('quote', x.q.id) : null; else window.open(wa(phoneOf(x.q), msg(x.q, x.kind)), '_blank', 'noopener'); };
  }
  function archive() {
    var row = $('#main .title-row'); if (!row || $('[data-fup=board]', row)) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.fup = 'board'; b.textContent = board ? 'عرض القائمة' : 'لوحة المراحل'; var sp = row.querySelector('.sp'); row.insertBefore(b, sp ? sp.nextSibling : null);
    b.onclick = function () { board = !board; H.render(); };
    if (!board) return; var card = $('#main .card'); if (card) card.hidden = true;
    var wrap = document.createElement('div'); wrap.id = 'fupBoard'; wrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;align-items:start'; wrap.dataset.fup = 'x';
    wrap.innerHTML = STAGES.map(function (s) {
      var qs = S().quotes.filter(function (q) { return q.status === s[0]; }).sort(function (a, c) { return String(c.date).localeCompare(String(a.date)); }), tot = r2(qs.reduce(function (a, q) { return a + R.calc(q).total; }, 0));
      return '<div class="card" style="padding:10px"><div class="row" style="margin-bottom:8px"><b>' + s[1] + '</b><span class="chip ' + s[2] + '">' + qs.length + '</span><div class="sp"></div><small class="muted">' + fmt(tot) + '</small></div>' + (qs.slice(0, 30).map(function (q) { return '<div class="kit" data-id="' + q.id + '" style="display:block;cursor:pointer;margin-bottom:6px"><b><bdi dir="ltr">' + esc(q.no) + '</bdi></b> <span class="muted">' + fmt(R.calc(q).total) + '</span><br><small>' + esc(who(q)) + (q.project ? ' · ' + esc(q.project) : '') + '</small>' + (q.status === 'sent' && q._views && q._views.n ? '<br><small class="muted">فُتح ' + q._views.n + '× · ' + ago(q._views.last) + '</small>' : '') + '</div>'; }).join('') || '<div class="muted" style="padding:6px">—</div>') + (qs.length > 30 ? '<div class="muted">+' + (qs.length - 30) + ' أخرى</div>' : '') + '</div>';
    }).join('');
    (card || row).parentNode.insertBefore(wrap, card ? card.nextSibling : row.nextSibling);
    wrap.onclick = function (e) { var k = e.target.closest('.kit[data-id]'); if (k && H.go) H.go('quote', k.dataset.id); };
  }
  function after(view) { try { if (view === 'dash') dash(); else if (view === 'archive') archive(); } catch (e) { /* UI sugar only */ } }
  window.FUP = { after: after, items: items };
})();
