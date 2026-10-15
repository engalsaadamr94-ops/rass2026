/* Quantity take-off core: safe formula evaluator, system templates, rule matching and result aggregation.
   UMD: runs in the browser (window.TKC) and in node for tests. No eval / Function is used. */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.TKC = f(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- safe expression evaluator ---------- */
  const FN = {
    max: Math.max, min: Math.min, ceil: Math.ceil, floor: Math.floor, round: Math.round, abs: Math.abs, sqrt: Math.sqrt,
    if: (c, a, b) => (c ? a : b),
  };
  function tokenize(s) {
    const t = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (m) { t.push({ k: 'n', v: parseFloat(m[1]) }); i += m[1].length; continue; }
      const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (id) { t.push({ k: 'i', v: id[0] }); i += id[0].length; continue; }
      const op = /^(\|\||&&|==|!=|<=|>=|[-+*/%<>!?:(),])/.exec(s.slice(i));
      if (op) { t.push({ k: 'o', v: op[1] }); i += op[1].length; continue; }
      throw new Error('رمز غير مسموح في المعادلة: ' + c);
    }
    return t;
  }
  const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function parse(s) {
    const t = tokenize(String(s || '')); let p = 0;
    const peek = () => t[p], next = () => t[p++];
    function primary() {
      const x = next();
      if (!x) throw new Error('معادلة ناقصة');
      if (x.k === 'n') return { n: x.v };
      if (x.k === 'i') {
        if (peek() && peek().v === '(' && peek().k === 'o') {
          next(); const args = [];
          if (!(peek() && peek().v === ')')) { do { args.push(expr(0)); } while (peek() && peek().v === ',' && next()); }
          if (!peek() || next().v !== ')') throw new Error('قوس ناقص');
          if (!FN[x.v]) throw new Error('دالة غير معروفة: ' + x.v);
          return { f: x.v, a: args };
        }
        return { v: x.v };
      }
      if (x.v === '(') { const e = expr(0); if (!peek() || next().v !== ')') throw new Error('قوس ناقص'); return e; }
      if (x.v === '-') return { u: '-', a: primary() };
      if (x.v === '!') return { u: '!', a: primary() };
      throw new Error('معادلة غير صحيحة');
    }
    function expr(min) {
      let l = primary();
      for (;;) {
        const o = peek();
        if (!o || o.k !== 'o') break;
        if (o.v === '?' && min === 0) { next(); const a = expr(0); if (!peek() || next().v !== ':') throw new Error('؟ بدون :'); const b = expr(0); l = { f: 'if', a: [l, a, b] }; continue; }
        const pr = PREC[o.v];
        if (!pr || pr <= min) break;
        next(); l = { b: o.v, l, r: expr(pr) };
      }
      return l;
    }
    const ast = expr(0);
    if (p < t.length) throw new Error('معادلة غير صحيحة');
    return ast;
  }
  function run(n, sc) {
    if ('n' in n) return n.n;
    if ('v' in n) { const x = Object.prototype.hasOwnProperty.call(sc, n.v) ? sc[n.v] : undefined; if (x === undefined) throw new Error('متغير غير معرّف: ' + n.v); return +x || 0; }
    if (n.u) { const a = run(n.a, sc); return n.u === '-' ? -a : (a ? 0 : 1); }
    if (n.f) return +FN[n.f](...n.a.map(x => run(x, sc))) || 0;
    const a = run(n.l, sc), b = run(n.r, sc);
    switch (n.b) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b ? a / b : 0; case '%': return b ? a % b : 0;
      case '<': return +(a < b); case '>': return +(a > b); case '<=': return +(a <= b); case '>=': return +(a >= b);
      case '==': return +(a === b); case '!=': return +(a !== b); case '&&': return +(a && b); case '||': return +(a || b);
    }
    return 0;
  }
  const cache = new Map();
  function evalF(src, scope) {
    let ast = cache.get(src);
    if (!ast) { ast = parse(src); if (cache.size > 500) cache.clear(); cache.set(src, ast); }
    return run(ast, scope);
  }
  function idsOf(src) { try { return tokenize(String(src || '')).filter((x, i, a) => x.k === 'i' && !(a[i + 1] && a[i + 1].v === '(')).map(x => x.v); } catch (e) { return []; } }
  function check(src) { try { parse(src); return ''; } catch (e) { return e.message; } }

  /* ---------- glob / rule matching ---------- */
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  function globRe(p) { return new RegExp('^' + norm(p).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); }
  function matches(pat, key) { const p = norm(pat); if (!p) return false; return p.includes('*') || p.includes('?') ? globRe(p).test(norm(key)) : p === norm(key); }
  /** Which variable does a measurement (src,key) belong to? per-takeoff assign wins over global rules. */
  function varFor(src, key, assign, rules) {
    const k = src + ':' + key;
    if (assign && Object.prototype.hasOwnProperty.call(assign, k)) return assign[k] || '';
    for (const r of rules || []) if (r.src === src && matches(r.pat, key)) return r.var;
    return '';
  }

  /* ---------- name-based guess (used only when there is no explicit assignment and no rule) ---------- */
  const KW = [
    ['smk', /smoke|دخان|(^|[^a-z])sd([^a-z]|$)/i], ['heat', /heat|حرارة|(^|[^a-z])hd([^a-z]|$)/i], ['multi', /multi/i], ['mcp', /(^|[^a-z])mcp([^a-z]|$)|manual|call ?point|pull ?st|break ?glass|كاسر/i],
    ['snd', /sounder|siren|strobe|horn|سارين/i], ['bell', /bell|جرس/i], ['panel', /facp|alarm ?panel|fire ?panel|لوحة إنذار/i], ['mon', /monitor ?mod|input ?mod/i], ['ctl', /control ?mod|relay ?mod/i], ['iso', /isolat|عزل/i],
    ['duct', /duct/i], ['spp', /pendent|متدلي/i], ['spu', /upright|علوي/i], ['sps', /sidewall|جداري/i], ['hc', /hose|cabinet|reel|صندوق حريق/i], ['hyd', /hydrant|هيدرانت/i], ['fdc', /fdc|siamese/i],
    ['abc6', /extinguisher|طفاية|(^|[^a-z])fe([^a-z]|$)/i], ['em', /emerg|طوارئ/i], ['ex1', /exit|مخرج/i], ['fsw', /flow ?sw/i], ['pump', /pump|مضخة/i],
  ];
  function guess(m, vars) {
    const has = id => vars.find(v => v.id === id && v.kind === m.kind);
    const key = String(m.key || '');
    if (m.kind === 'len') {
      const mm = /(pipe|ماسور|sprk|sprinkler)/i.test(key) && /(?:^|[^0-9.])(1\.25|1\.5|2\.5|1|2|3|4|6|8)(?:"|in|inch|[^0-9.]|$)/i.exec(key);
      if (mm) { const id = 'p' + mm[1].replace('.', ''); if (has(id)) return id; }
      if (/cable|wire|loop|كابل|fa-?cab/i.test(key) && has('cab')) return 'cab';
      return '';
    }
    if (m.kind !== 'count') return '';
    for (const [id, re] of KW) if (re.test(key) && has(id)) return id;
    return '';
  }

  /* ---------- templates ---------- */
  const T = (id, name, kind, item, formula, extra) => Object.assign({ id, name, kind, item, formula: formula || 'q', sys: '' }, extra || {});
  const TEMPLATES = [
    {
      id: 'fa_addr', name: 'نظام الإنذار المعنون', consts: { waste: 10, avgrun: 12 },
      vars: [
        T('panel', 'لوحة الإنذار', 'count', 'fa.panel.a1', 'max(q,1)'),
        T('smk', 'كاشف دخان', 'count', 'fa.smoke.a'),
        T('heat', 'كاشف حرارة', 'count', 'fa.heat.a'),
        T('multi', 'كاشف متعدد الحساسات', 'count', 'fa.multi.a'),
        T('mcp', 'كاسر زجاج', 'count', 'fa.mcp.a'),
        T('snd', 'سارينة مع فلاش', 'count', 'fa.sounder.a'),
        T('mon', 'وحدة مراقبة', 'count', 'fa.mon'),
        T('ctl', 'وحدة تحكم', 'count', 'fa.ctl'),
        T('iso', 'وحدة عزل', 'count', 'fa.iso', 'q || ceil((smk+heat+multi+mcp+snd+mon+ctl)/20)'),
        T('duct', 'كاشف مجاري هواء', 'count', 'fa.duct'),
        T('cab', 'كابل مقاوم للحريق/لوب (متر)', 'len', 'fa.cab.sh', 'q ? q*(1+waste/100) : (smk+heat+multi+mcp+snd+mon+ctl)*avgrun*(1+waste/100)'),
        T('con', 'ماسورة حماية الكابلات (متر)', 'len', 'fa.con.20', 'cab'),
        T('box', 'علب تفريع', 'count', 'fa.box', 'ceil(con/15)'),
        T('batt', 'بطاريات 18 أمبير', 'count', 'fa.batt18', 'q || 2'),
        T('sv1', 'مخططات تنفيذية', 'count', 'sv.design', 'max(q,1)'),
        T('sv2', 'اختبار وتشغيل', 'count', 'sv.test', 'max(q,1)'),
        T('sv3', 'مخططات ما بعد التنفيذ', 'count', 'sv.asbuilt', 'max(q,1)'),
      ],
    },
    {
      id: 'fa_conv', name: 'نظام الإنذار التقليدي', consts: { waste: 10, avgrun: 10 },
      vars: [
        T('panel', 'لوحة الإنذار (حسب عدد الزونات)', 'count', 'fa.panel.c8', 'max(q,1)'),
        T('smk', 'كاشف دخان', 'count', 'fa.smoke.c'),
        T('heat', 'كاشف حرارة', 'count', 'fa.heat.c'),
        T('mcp', 'كاسر زجاج', 'count', 'fa.mcp.c'),
        T('snd', 'سارينة مع فلاش', 'count', 'fa.sounder.c'),
        T('bell', 'جرس', 'count', 'fa.bell'),
        T('cab', 'كابل مقاوم للحريق (متر)', 'len', 'fa.cab.fr15', 'q ? q*(1+waste/100) : (smk+heat+mcp+snd+bell)*avgrun*(1+waste/100)'),
        T('con', 'ماسورة حماية الكابلات (متر)', 'len', 'fa.con.20', 'cab'),
        T('box', 'علب تفريع', 'count', 'fa.box', 'ceil(con/15)'),
        T('sv1', 'مخططات تنفيذية', 'count', 'sv.design', 'max(q,1)'),
        T('sv2', 'اختبار وتشغيل', 'count', 'sv.test', 'max(q,1)'),
      ],
    },
    {
      id: 'sprk', name: 'الرشاشات الآلية', consts: { waste: 5 },
      vars: [
        T('spp', 'رشاش متدلي', 'count', 'ff.spr.pend'),
        T('spu', 'رشاش علوي', 'count', 'ff.spr.up'),
        T('sps', 'رشاش جداري', 'count', 'ff.spr.side'),
        T('p1', 'ماسورة 1 بوصة (متر)', 'len', 'ff.pipe.1', 'q*(1+waste/100)'),
        T('p125', 'ماسورة 1.25 بوصة (متر)', 'len', 'ff.pipe.125', 'q*(1+waste/100)'),
        T('p15', 'ماسورة 1.5 بوصة (متر)', 'len', 'ff.pipe.15', 'q*(1+waste/100)'),
        T('p2', 'ماسورة 2 بوصة (متر)', 'len', 'ff.pipe.2', 'q*(1+waste/100)'),
        T('p25', 'ماسورة 2.5 بوصة (متر)', 'len', 'ff.pipe.25', 'q*(1+waste/100)'),
        T('p3', 'ماسورة 3 بوصة (متر)', 'len', 'ff.pipe.3', 'q*(1+waste/100)'),
        T('p4', 'ماسورة 4 بوصة (متر)', 'len', 'ff.pipe.4', 'q*(1+waste/100)'),
        T('alarm', 'محبس إنذار مبلل 4 بوصة', 'count', 'ff.alarm4', 'max(q,1)'),
        T('fsw', 'مفتاح تدفق', 'count', 'ff.flowsw'),
        T('vb', 'محبس فراشة مع مفتاح مراقبة 4 بوصة', 'count', 'ff.v.but4'),
        T('test', 'محطة اختبار وتصريف', 'count', 'ff.test', 'max(q,1)'),
        T('sv1', 'اختبار هيدروستاتيكي', 'count', 'sv.hydro', 'max(q,1)'),
      ],
    },
    {
      id: 'hose', name: 'صناديق الحريق والشبكة والمضخات', consts: { waste: 5 },
      vars: [
        T('hc', 'صندوق حريق مع بكرة', 'count', 'ff.cab.hr'),
        T('hcc', 'صندوق حريق مركب', 'count', 'ff.cab.cb'),
        T('hyd', 'هيدرانت خارجي', 'count', 'ff.hydrant'),
        T('fdc', 'وصلة دفاع مدني', 'count', 'ff.fdc4', 'max(q,1)'),
        T('p4', 'ماسورة 4 بوصة (متر)', 'len', 'ff.pipe.4', 'q*(1+waste/100)'),
        T('p6', 'ماسورة 6 بوصة (متر)', 'len', 'ff.pipe.6', 'q*(1+waste/100)'),
        T('h6', 'ماسورة أرضية 6 بوصة HDPE (متر)', 'len', 'ff.hdpe.6', 'q*(1+waste/100)'),
        T('pump', 'مضخة حريق كهربائية 500 gpm', 'count', 'ff.pump.e500', 'max(q,1)'),
        T('jock', 'مضخة جوكي', 'count', 'ff.pump.j', 'max(q,1)'),
        T('g6', 'محبس بوابة 6 بوصة', 'count', 'ff.v.gate6'),
        T('c6', 'محبس عدم رجوع 6 بوصة', 'count', 'ff.v.chk6'),
      ],
    },
    {
      id: 'safety', name: 'الطفايات والإخلاء والسلامة', consts: {},
      vars: [
        T('abc6', 'طفاية بودرة 6 كجم', 'count', 'ex.abc6'),
        T('abc12', 'طفاية بودرة 12 كجم', 'count', 'ex.abc12'),
        T('co2', 'طفاية CO2 5 كجم', 'count', 'ex.co2_5'),
        T('em', 'إنارة طوارئ', 'count', 've.em2'),
        T('ex1', 'لوحة مخرج طوارئ', 'count', 've.exit1'),
        T('sig', 'لافتات إرشادية', 'count', 've.photo'),
        T('plan', 'مخطط إخلاء', 'count', 've.plan'),
      ],
    },
  ];
  const DEFAULT_CONSTS = { waste: 10, avgrun: 12, h: 3 };
  function templateVars(ids) {
    const out = [], seen = new Set(); const consts = {};
    for (const t of TEMPLATES) if (ids.includes(t.id)) {
      Object.assign(consts, t.consts || {});
      for (const v of t.vars) { const id = seen.has(v.id) ? t.id.slice(0, 2) + '_' + v.id : v.id; seen.add(id); out.push(Object.assign({}, v, { id, sys: t.name })); }
    }
    return { vars: out, consts };
  }

  /* ---------- aggregation ---------- */
  const METHODS = ['auto', 'man', 'tpl', 'ai'];
  const M_LBL = { auto: 'مخطط (CAD/PDF)', man: 'يدوي', tpl: 'مطابقة رموز', ai: 'ذكي' };
  const r3 = x => Math.round(x * 1000) / 1000;
  /**
   * data: { vars, meas, marks, sheets, assign, adopt, manual, consts }
   * rules: global rules; gconsts: global constants
   * Returns { rows:[{v, by:{auto,man,tpl,ai}, raw, method, q, err}], consts }
   */
  function compute(data, rules, gconsts) {
    const consts = Object.assign({}, DEFAULT_CONSTS, gconsts || {}, data.consts || {});
    const sheetScale = {}; (data.sheets || []).forEach(s => { sheetScale[s.id] = s.scale || 0; });
    const by = {}; (data.vars || []).forEach(v => { by[v.id] = { auto: 0, man: 0, tpl: 0, ai: 0 }; });
    for (const m of data.meas || []) {
      if (m.off) continue;
      const vid = varFor(m.src, m.key, data.assign, rules) || (!Object.prototype.hasOwnProperty.call(data.assign || {}, m.src + ':' + m.key) ? guess(m, data.vars || []) : '');
      if (vid && by[vid]) by[vid].auto += +m.value || 0;
    }
    for (const k of data.marks || []) {
      if (!k.var || !by[k.var] || k.off) continue;
      const kind = k.kind, b = by[k.var];
      const grp = k.by === 'tpl' ? 'tpl' : k.by === 'ai' ? 'ai' : 'man';
      if (kind === 'count') b[grp] += 1;
      else {
        const sc = sheetScale[k.sheet] || 0; if (!sc) continue;
        if (kind === 'len') b[grp] += polyLen(k.pts) * sc;
        else if (kind === 'area') b[grp] += polyArea(k.pts) * sc * sc;
      }
    }
    const rows = (data.vars || []).map(v => {
      const bb = by[v.id]; for (const m of METHODS) bb[m] = r3(bb[m]);
      let method = (data.adopt || {})[v.id];
      if (!method || (method !== 'typed' && !(bb[method] > 0))) method = METHODS.find(m => bb[m] > 0) || 'auto';
      const typed = (data.manual || {})[v.id];
      const raw = method === 'typed' ? (+typed || 0) : bb[method];
      return { v, by: bb, method, raw, q: 0, err: '' };
    });
    // iterate for dependencies between formulas (v2 may use v1's final qty)
    const finalQ = {}; rows.forEach(r => { finalQ[r.v.id] = 0; });
    const isCount = {}; rows.forEach(r => { isCount[r.v.id] = r.v.kind === 'count'; });
    for (let pass = 0; pass < 6; pass++) {
      for (const r of rows) {
        const sc = Object.assign({}, consts, finalQ, { q: r.raw });
        try {
          let x = evalF(r.v.formula || 'q', sc); r.err = '';
          if (!isFinite(x) || x < 0) x = 0;
          finalQ[r.v.id] = isCount[r.v.id] ? Math.ceil(x - 1e-9) : Math.ceil(x * 10 - 1e-9) / 10;
        } catch (e) { r.err = e.message; finalQ[r.v.id] = 0; }
      }
    }
    rows.forEach(r => { r.q = finalQ[r.v.id]; });
    return { rows, consts };
  }
  function polyLen(p) { let t = 0; for (let i = 1; i < (p || []).length; i++) t += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return t; }
  function polyArea(p) { let a = 0; const n = (p || []).length; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(a) / 2; }

  return { evalF, check, idsOf, matches, varFor, guess, TEMPLATES, templateVars, DEFAULT_CONSTS, compute, polyLen, polyArea, METHODS, M_LBL, norm };
});
