/* Price memory (last offered / last won price per library item) and win/loss analysis for reports. */
(function () {
  'use strict';
  var H = window.HOST, R = window.RASS, esc = R.esc, n0 = R.n0, r2 = R.r2, fmt = R.fmt;
  var REASONS = { price: 'سعر أعلى من المنافس', competitor: 'اختار منافساً لأسباب أخرى', cancelled: 'أُلغي المشروع أو تأجّل', budget: 'لا توجد ميزانية', scope: 'تغيّر النطاق', noreply: 'لا رد من العميل', other: 'أخرى' };
  var S = function () { return H.S(); };
  var cache = { key: '', map: null };

  function build(exceptId) {
    var key = S().quotes.length + ':' + S().quotes.reduce(function (a, q) { return a + (q._v || 0); }, 0) + ':' + exceptId;
    if (cache.key === key) return cache.map; var map = {};
    S().quotes.forEach(function (q) {
      if (q.id === exceptId || (q.status !== 'sent' && q.status !== 'won')) return;
      var ord = (q.date || '') + '|' + (q.no || '');
      (q.lines || []).forEach(function (l) {
        if (!l.lib || !(n0(l.price) > 0)) return; var m = map[l.lib] || (map[l.lib] = { any: null, won: null }), e = { price: n0(l.price), date: q.date || '', no: q.no, client: q.client, status: q.status, ord: ord };
        if (!m.any || m.any.ord < ord) m.any = e; if (q.status === 'won' && (!m.won || m.won.ord < ord)) m.won = e;
      });
    });
    cache = { key: key, map: map }; return map;
  }
  function ago(d) { if (!d) return ''; var n = Math.round((Date.now() - new Date(d).getTime()) / 86400000); return n <= 0 ? 'اليوم' : n === 1 ? 'أمس' : n < 60 ? 'قبل ' + n + ' يوم' : 'قبل ' + Math.round(n / 30) + ' شهر'; }

  function paint(q) {
    if (!q) return; var lb = document.getElementById('lostBox'); if (lb) lb.hidden = q.status !== 'lost';
    var map = build(q.id);
    (q.lines || []).forEach(function (l) {
      var el = document.querySelector('.ln[data-lid="' + l.id + '"] [data-pm]'); if (!el) return; var m = l.lib && map[l.lib];
      if (!m || !m.any) { el.textContent = ''; el.className = 'dev pm'; el.removeAttribute('title'); return; }
      var ref = m.won || m.any, p = n0(l.price), d = ref.price ? (p - ref.price) / ref.price * 100 : 0;
      el.textContent = (m.won ? 'آخر فوز ' : 'آخر عرض ') + fmt(ref.price) + ' · ' + ago(ref.date);
      el.className = 'dev pm ' + (p > 0 && d >= 10 ? 'up' : p > 0 && d <= -5 ? 'dn' : '');
      el.title = ref.no + ' · ' + (ref.client || '') + (m.won && m.any !== m.won ? '\nآخر عرض مرسل: ' + fmt(m.any.price) + ' (' + m.any.no + ')' : '') + (p > 0 ? '\nالفرق عن هذا السعر: ' + (d > 0 ? '+' : '') + Math.round(d * 10) / 10 + '%' : '');
    });
  }

  function extra(box) {
    if (!box) return; var qs = S().quotes.filter(function (q) { return q.status !== 'superseded' && q.status !== 'draft'; });
    var won = qs.filter(function (q) { return q.status === 'won'; }), lost = qs.filter(function (q) { return q.status === 'lost'; }), sent = qs.filter(function (q) { return q.status === 'sent'; });
    var val = function (a) { return r2(a.reduce(function (s, q) { return s + R.calc(q).total; }, 0)); };
    var decided = won.length + lost.length, rateN = decided ? Math.round(won.length / decided * 100) : 0, vw = val(won), vl = val(lost), rateV = vw + vl > 0 ? Math.round(vw / (vw + vl) * 100) : 0;
    var band = function (title, def, fn) {
      var rows = def.map(function (b) { var w = 0, l = 0; won.forEach(function (q) { if (fn(q) >= b[1] && fn(q) < b[2]) w++; }); lost.forEach(function (q) { if (fn(q) >= b[1] && fn(q) < b[2]) l++; }); return { n: b[0], w: w, l: l, r: w + l ? Math.round(w / (w + l) * 100) : null }; });
      return '<div class="card"><h3>' + title + '</h3><div class="tablewrap"><table class="t" style="min-width:380px"><thead><tr><th>الشريحة</th><th class="num">معتمد</th><th class="num">ملغي</th><th class="num">نسبة الفوز</th></tr></thead><tbody>' + rows.map(function (x) { return '<tr><td>' + x.n + '</td><td class="num">' + x.w + '</td><td class="num">' + x.l + '</td><td class="num">' + (x.r == null ? '—' : x.r + '%') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    };
    var reasons = {}; lost.forEach(function (q) { var k = q.lostReason || ''; reasons[k] = (reasons[k] || 0) + 1; });
    var rk = Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; });
    var h = '<div class="card"><h3>تحليل الفوز والخسارة</h3><div class="grid"><div><span class="muted">مرسلة بانتظار القرار</span><br><b>' + sent.length + '</b> <small class="muted">' + fmt(val(sent)) + '</small></div><div><span class="muted">معتمدة</span><br><b>' + won.length + '</b> <small class="muted">' + fmt(vw) + '</small></div><div><span class="muted">ملغاة</span><br><b>' + lost.length + '</b> <small class="muted">' + fmt(vl) + '</small></div><div><span class="muted">نسبة الفوز (عدداً / قيمة)</span><br><b>' + rateN + '% / ' + rateV + '%</b></div></div>' + (decided < 5 ? '<div class="note" style="margin-top:10px">عدد القرارات قليل؛ تصبح النسب أوضح بعد تسجيل مزيد من العروض المعتمدة والملغاة.</div>' : '') + '</div>';
    h += band('نسبة الفوز بحسب الخصم الممنوح', [['بدون خصم', -1, 0.0001], ['حتى 5%', 0.0001, 5.0001], ['5% – 10%', 5.0001, 10.0001], ['أكثر من 10%', 10.0001, 101]], function (q) { return R.calc(q).pct || 0; });
    h += band('نسبة الفوز بحسب قيمة العرض', [['أقل من 50 ألف', 0, 50000], ['50 – 200 ألف', 50000, 200000], ['200 – 500 ألف', 200000, 500000], ['أكثر من 500 ألف', 500000, 1e12]], function (q) { return R.calc(q).total; });
    if (H.P().seeCost) h += band('نسبة الفوز بحسب هامش الربح', [['أقل من 15%', -1e9, 15], ['15% – 25%', 15, 25], ['25% – 35%', 25, 35], ['أكثر من 35%', 35, 1e9]], function (q) { var m = R.margin(q); return m.costed > 0 ? m.pct : -1e8; });
    h += '<div class="card"><h3>أسباب الإلغاء والخسارة</h3>' + (rk.length ? '<div class="tablewrap"><table class="t" style="min-width:360px"><tbody>' + rk.map(function (k) { return '<tr><td>' + esc(REASONS[k] || 'لم يُحدَّد السبب') + '</td><td class="num">' + reasons[k] + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">لا توجد عروض ملغاة.</div>') + '</div>';
    var d = document.createElement('div'); d.innerHTML = h; while (d.firstChild) box.appendChild(d.firstChild);
  }
  window.MEM = { REASONS: REASONS, paint: paint, extra: extra, last: function (lib, except) { return (build(except || '')[lib] || {}); } };
})();
