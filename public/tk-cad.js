/* CAD support for the take-off screen: DXF (dxf-parser) and DWG (libredwg-web) are normalised to one model,
   then flattened for rendering and measuring (block counts, length per layer, area per layer).
   UMD: window.TKCAD in the browser; require() in node tests (pass the parsed objects in). */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.TKCAD = f(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const D2R = Math.PI / 180;
  const UNITS = { 0: [1, 'بدون وحدة'], 1: [0.0254, 'بوصة'], 2: [0.3048, 'قدم'], 4: [0.001, 'مم'], 5: [0.01, 'سم'], 6: [1, 'م'], 7: [1000, 'كم'], 10: [0.9144, 'ياردة'] };
  const UNIT_CHOICES = [['mm', 0.001, 'مليمتر'], ['cm', 0.01, 'سنتيمتر'], ['m', 1, 'متر'], ['in', 0.0254, 'بوصة'], ['ft', 0.3048, 'قدم']];

  const pt = p => (p ? [+p.x || 0, +p.y || 0] : [0, 0]);
  /* ---------- normalisers ---------- */
  function normEnt(e, ang) {
    // ang: converts the source's angle unit to radians for ARC/INSERT/TEXT
    const base = { layer: e.layer == null ? '0' : String(e.layer), color: e.colorIndex != null ? e.colorIndex : (e.color != null && e.color < 300 ? e.color : 256) };
    const t = String(e.type || '').toUpperCase();
    switch (t) {
      case 'LINE': {
        const a = e.startPoint || (e.vertices && e.vertices[0]), b = e.endPoint || (e.vertices && e.vertices[1]);
        if (!a || !b) return null;
        return Object.assign(base, { t: 'L', a: pt(a), b: pt(b) });
      }
      case 'LWPOLYLINE': case 'POLYLINE': {
        const vs = (e.vertices || []).filter(v => v && (v.x != null));
        if (vs.length < 2) return null;
        const flag = e.flag != null ? e.flag : (e.shape ? 1 : 0);
        return Object.assign(base, { t: 'P', pts: vs.map(v => [+v.x || 0, +v.y || 0, +v.bulge || 0]), closed: !!(flag & 1) || !!e.shape || !!e.closed });
      }
      case 'ARC': return Object.assign(base, { t: 'A', c: pt(e.center), r: +e.radius || 0, s: (+e.startAngle || 0) * ang.arc, e: (+e.endAngle || 0) * ang.arc });
      case 'CIRCLE': return Object.assign(base, { t: 'C', c: pt(e.center), r: +e.radius || 0 });
      case 'ELLIPSE': {
        const c = pt(e.center), m = pt(e.majorAxisEndPoint || e.majorAxisEndpoint || { x: 1, y: 0 }), ratio = +e.axisRatio || 1;
        const a = Math.hypot(m[0], m[1]), rot = Math.atan2(m[1], m[0]); const s = +e.startAngle || 0, en = e.endAngle != null ? +e.endAngle : Math.PI * 2;
        const pts = []; const n = 48; let ee = en; if (ee <= s) ee += Math.PI * 2;
        for (let i = 0; i <= n; i++) { const u = s + (ee - s) * i / n; const x = a * Math.cos(u), y = a * ratio * Math.sin(u); pts.push([c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot), 0]); }
        return Object.assign(base, { t: 'P', pts, closed: false });
      }
      case 'SPLINE': {
        const cp = (e.fitPoints && e.fitPoints.length > 1 ? e.fitPoints : e.controlPoints) || [];
        if (cp.length < 2) return null;
        return Object.assign(base, { t: 'P', pts: cp.map(v => [+v.x || 0, +v.y || 0, 0]), closed: !!(e.closed) });
      }
      case 'INSERT': case 'MINSERT':
        return Object.assign(base, { t: 'I', name: String(e.name || ''), p: pt(e.insertionPoint || e.position), sx: e.xScale == null ? 1 : +e.xScale, sy: e.yScale == null ? 1 : +e.yScale, rot: (+e.rotation || 0) * ang.rot,
          nc: Math.max(1, +e.columnCount || 1), nr: Math.max(1, +e.rowCount || 1), dc: +e.columnSpacing || 0, dr: +e.rowSpacing || 0 });
      case 'TEXT': case 'MTEXT': case 'ATTRIB': case 'ATTDEF': {
        const p = e.insertionPoint || e.startPoint || e.position; if (!p) return null;
        return Object.assign(base, { t: 'T', text: String(e.text || e.string || '').replace(/\\P/g, ' ').replace(/\{?\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, ''), p: pt(p), h: +e.textHeight || +e.height || 0, rot: (+e.rotation || 0) * ang.rot });
      }
      case 'SOLID': case 'TRACE': case '3DFACE': return null;
      default: return null;
    }
  }
  function layerList(layers) { return (layers || []).map(l => ({ name: String(l.name), color: l.colorIndex != null ? Math.abs(l.colorIndex) : (l.color != null ? Math.abs(l.color) : 7), off: !!(l.off || l.frozen || (l.visible === false)) })); }

  /** dxf-parser output -> model */
  function fromDxf(dxf) {
    const ang = { arc: 1, rot: D2R }; // dxf-parser: ARC angles already radians, INSERT rotation in degrees
    const hd = dxf.header || {};
    const ins = hd.$INSUNITS != null ? +hd.$INSUNITS : 0;
    const blocks = {};
    for (const [n, b] of Object.entries(dxf.blocks || {})) blocks[n] = { base: pt(b.position), ents: (b.entities || []).map(e => normEnt(e, ang)).filter(Boolean) };
    const layers = layerList(Object.values((dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) || {}));
    return finish({ kind: 'dxf', ins, blocks, model: (dxf.entities || []).map(e => normEnt(e, ang)).filter(Boolean), layers });
  }
  /** libredwg-web DwgDatabase -> model */
  function fromDwg(db) {
    const ang = { arc: 1, rot: 1 }; // libredwg: radians
    const ins = db.header && db.header.INSUNITS != null ? +db.header.INSUNITS : 0;
    const blocks = {}; let model = null;
    for (const b of (db.tables && db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || []) {
      const ents = (b.entities || []).map(e => normEnt(e, ang)).filter(Boolean);
      if (/^\*model_space$/i.test(b.name || '')) model = ents; else blocks[b.name] = { base: pt(b.basePoint), ents };
    }
    if (!model) model = (db.entities || []).map(e => normEnt(e, ang)).filter(Boolean);
    return finish({ kind: 'dwg', ins, blocks, model, layers: layerList((db.tables && db.tables.LAYER && db.tables.LAYER.entries) || []) });
  }
  function finish(m) {
    const u = UNITS[m.ins] || UNITS[0];
    m.unitsGuess = m.ins > 0 && UNITS[m.ins];
    m.unitM = u[1] === 'بدون وحدة' ? 0 : u[0];
    m.unitName = u[1];
    return m;
  }

  /* ---------- flatten (apply block transforms) ---------- */
  const I = [1, 0, 0, 1, 0, 0];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const ap = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  function bulgeArc(p, q, bulge, out) {
    // append intermediate points (excluding p, including q) for a bulge segment
    const th = 4 * Math.atan(bulge), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!d || !isFinite(th) || Math.abs(th) < 1e-9) { out.push(q); return; }
    const ux = (q[0] - p[0]) / d, uy = (q[1] - p[1]) / d;
    const k = (d / 2) / Math.tan(th / 2);
    const cx = (p[0] + q[0]) / 2 - uy * k, cy = (p[1] + q[1]) / 2 + ux * k;
    const r = Math.hypot(p[0] - cx, p[1] - cy), a0 = Math.atan2(p[1] - cy, p[0] - cx);
    const n = Math.max(2, Math.ceil(Math.abs(th) / (6 * D2R)));
    for (let i = 1; i <= n; i++) { const a = a0 + th * i / n; out.push(i === n ? q : [cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  function polyPts(e) {
    const out = [[e.pts[0][0], e.pts[0][1]]];
    const n = e.pts.length, last = e.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p = e.pts[i], q = e.pts[(i + 1) % n];
      if (p[2]) bulgeArc([p[0], p[1]], [q[0], q[1]], p[2], out); else out.push([q[0], q[1]]);
    }
    return out;
  }
  function arcPts(c, r, s, e) {
    let en = e; while (en <= s) en += Math.PI * 2;
    const n = Math.max(4, Math.ceil((en - s) / (5 * D2R))); const o = [];
    for (let i = 0; i <= n; i++) { const a = s + (en - s) * i / n; o.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
    return o;
  }
  const isAnon = n => /^\*/.test(n);

  /**
   * Walks model space expanding INSERTs.
   * Returns { segs: Map(layer -> number[] (x1,y1,x2,y2...)), lens: {layer: drawingUnits}, areas: {layer: du²}, counts: {block: {n, layers:Set, nested}},
   *           texts: [{text,x,y,h,layer}], points: {block: [[x,y]...]}, bbox }
   */
  function flatten(m, opt) {
    opt = opt || {};
    const segs = new Map(), lens = {}, areas = {}, counts = {}, texts = [], points = {}, issues = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const lay = (e, inh) => (e.layer === '0' && inh ? inh : e.layer);
    const grow = p => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
    function addPoly(pts, L, closed) {
      let s = segs.get(L); if (!s) { s = []; segs.set(L, s); }
      let len = 0;
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; s.push(a[0], a[1], b[0], b[1]); len += Math.hypot(b[0] - a[0], b[1] - a[1]); grow(a); }
      grow(pts[pts.length - 1]);
      lens[L] = (lens[L] || 0) + len;
      if (closed) {
        const f = pts[0], l = pts[pts.length - 1];
        if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 1e-9) { s.push(l[0], l[1], f[0], f[1]); lens[L] += Math.hypot(f[0] - l[0], f[1] - l[1]); }
        let a = 0; for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
        areas[L] = (areas[L] || 0) + Math.abs(a) / 2;
      }
    }
    let budget = opt.maxEntities || 3_000_000;
    function visit(ents, M, inh, depth, chain) {
      for (const e of ents) {
        if (--budget < 0) { if (!issues.includes('trunc')) issues.push('trunc'); return; }
        const L = lay(e, inh);
        switch (e.t) {
          case 'L': addPoly([ap(M, e.a), ap(M, e.b)], L, false); break;
          case 'P': { const pp = polyPts(e).map(p => ap(M, p)); addPoly(pp, L, e.closed); break; }
          case 'A': addPoly(arcPts(e.c, e.r, e.s, e.e).map(p => ap(M, p)), L, false); break;
          case 'C': { const pp = arcPts(e.c, e.r, 0, Math.PI * 2 - 1e-6).map(p => ap(M, p)); addPoly(pp, L, true); break; }
          case 'T': { const p = ap(M, e.p); texts.push({ text: e.text, x: p[0], y: p[1], h: e.h * Math.hypot(M[0], M[1]), layer: L }); break; }
          case 'I': {
            const b = m.blocks[e.name];
            const nm = e.name;
            const worldP = ap(M, e.p);
            if (!isAnon(nm)) {
              const c = counts[nm] || (counts[nm] = { n: 0, layers: {}, nested: 0 });
              const mult = e.nc * e.nr; c.n += mult; if (depth > 0) c.nested += mult; c.layers[lay(e, inh)] = (c.layers[lay(e, inh)] || 0) + mult;
              (points[nm] || (points[nm] = [])).push(worldP);
            }
            if (!b || depth > 8 || chain.includes(nm)) break;
            const cs = Math.cos(e.rot), sn = Math.sin(e.rot);
            for (let r = 0; r < e.nr; r++) for (let c = 0; c < e.nc; c++) {
              const loc = [e.sx * cs, e.sx * sn, -e.sy * sn, e.sy * cs, e.p[0] + c * e.dc * cs - r * e.dr * sn, e.p[1] + c * e.dc * sn + r * e.dr * cs];
              const T = mul(M, mul(loc, [1, 0, 0, 1, -b.base[0], -b.base[1]]));
              visit(b.ents, T, L === '0' ? inh : L, depth + 1, chain.concat(nm));
            }
            break;
          }
        }
      }
    }
    visit(m.model, I, '', 0, []);
    if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
    return { segs, lens, areas, counts, texts, points, bbox: [x0, y0, x1, y1], issues };
  }

  /* ---------- ACI colour ---------- */
  const ACI = { 1: '#ff0000', 2: '#d4b200', 3: '#00a000', 4: '#00a8a8', 5: '#0000ff', 6: '#c000c0', 7: '#111111', 8: '#808080', 9: '#b0b0b0' };
  function aci(i) {
    if (ACI[i]) return ACI[i];
    if (i >= 10 && i <= 249) { const h = ((i - 10) / 10 | 0) * 15, k = (i - 10) % 10, s = k % 2 ? 0.5 : 1, v = 1 - Math.floor(k / 2) * 0.17; return hsv(h, s, v); }
    if (i >= 250 && i <= 255) { const g = 51 * (i - 250) + 40; return `rgb(${g},${g},${g})`; }
    return '#111111';
  }
  function hsv(h, s, v) { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return `rgb(${Math.round(f(5) * 255)},${Math.round(f(3) * 255)},${Math.round(f(1) * 255)})`; }

  /** Summary rows for the measurement table */
  function summarize(m, flat, unitM) {
    const rows = [];
    for (const [k, c] of Object.entries(flat.counts)) rows.push({ src: 'block', key: k, kind: 'count', value: c.n, note: c.nested ? 'متداخلة ' + c.nested : '' });
    for (const [k, v] of Object.entries(flat.lens)) if (v * unitM > 0.01) rows.push({ src: 'layer', key: k, kind: 'len', value: Math.round(v * unitM * 1000) / 1000, note: '' });
    for (const [k, v] of Object.entries(flat.areas)) if (v * unitM * unitM > 0.01) rows.push({ src: 'layer', key: k + ' [مساحة]', kind: 'area', value: Math.round(v * unitM * unitM * 1000) / 1000, note: '' });
    return rows;
  }
  return { fromDxf, fromDwg, flatten, summarize, aci, UNITS, UNIT_CHOICES, polyPts, arcPts };
});
