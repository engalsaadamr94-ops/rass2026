/* Vision helpers for the take-off screen: symbol template matching (normalised cross-correlation) and PDF vector extraction.
   Pure functions on typed arrays so they can be unit-tested in node. UMD: window.TKVIS. */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.TKVIS = f(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- grayscale images: {w,h,d:Float32Array} (ink = high value, 0..255) ---------- */
  function fromRGBA(rgba, w, h) {
    const d = new Float32Array(w * h);
    for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = 255 - (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]);
    return { w, h, d };
  }
  function crop(img, x, y, w, h) {
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); w = Math.min(img.w - x, Math.round(w)); h = Math.min(img.h - y, Math.round(h));
    const d = new Float32Array(w * h);
    for (let r = 0; r < h; r++) d.set(img.d.subarray((y + r) * img.w + x, (y + r) * img.w + x + w), r * w);
    return { w, h, d };
  }
  function downscale(img, f) {
    if (f <= 1) return img;
    const w = Math.floor(img.w / f), h = Math.floor(img.h / f), d = new Float32Array(w * h), n = f * f;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0; for (let j = 0; j < f; j++) { const o = (y * f + j) * img.w + x * f; for (let i = 0; i < f; i++) s += img.d[o + i]; }
      d[y * w + x] = s / n;
    }
    return { w, h, d };
  }
  function blur(img) { // 3x3 binomial: makes 1px lines tolerant to sub-pixel shifts
    const w = img.w, h = img.h, t = new Float32Array(w * h), d = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * w + x; t[o] = (img.d[o - (x > 0 ? 1 : 0)] + 2 * img.d[o] + img.d[o + (x < w - 1 ? 1 : 0)]) / 4; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * w + x; d[o] = (t[o - (y > 0 ? w : 0)] + 2 * t[o] + t[o + (y < h - 1 ? w : 0)]) / 4; }
    return { w, h, d };
  }
  function rot90(img) { // clockwise
    const w = img.h, h = img.w, d = new Float32Array(w * h);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) d[x * w + (img.h - 1 - y)] = img.d[y * img.w + x];
    return { w, h, d };
  }

  /** Dense NCC of tpl over img (positions of top-left). Returns Float32Array scores of size (W-w+1)*(H-h+1) and its dims. */
  function ncc(img, tpl, yieldFn) {
    const W = img.w, H = img.h, w = tpl.w, h = tpl.h, n = w * h;
    const ow = W - w + 1, oh = H - h + 1;
    if (ow < 1 || oh < 1) return { s: new Float32Array(0), ow: 0, oh: 0 };
    // template normalisation
    let tm = 0; for (let i = 0; i < n; i++) tm += tpl.d[i]; tm /= n;
    const tz = new Float32Array(n); let tv = 0;
    for (let i = 0; i < n; i++) { tz[i] = tpl.d[i] - tm; tv += tz[i] * tz[i]; }
    const tsd = Math.sqrt(tv);
    // integral images of img and img^2
    const iw = W + 1, S = new Float64Array(iw * (H + 1)), Q = new Float64Array(iw * (H + 1));
    for (let y = 1; y <= H; y++) { let rs = 0, rq = 0; for (let x = 1; x <= W; x++) { const v = img.d[(y - 1) * W + x - 1]; rs += v; rq += v * v; S[y * iw + x] = S[(y - 1) * iw + x] + rs; Q[y * iw + x] = Q[(y - 1) * iw + x] + rq; } }
    const out = new Float32Array(ow * oh);
    if (tsd < 1e-6) return { s: out, ow, oh }; // flat template: nothing to match
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const sum = S[(y + h) * iw + x + w] - S[y * iw + x + w] - S[(y + h) * iw + x] + S[y * iw + x];
        const sq = Q[(y + h) * iw + x + w] - Q[y * iw + x + w] - Q[(y + h) * iw + x] + Q[y * iw + x];
        const varr = sq - sum * sum / n;
        if (varr < 1e-3 * n) { out[y * ow + x] = 0; continue; }
        let dot = 0;
        for (let j = 0; j < h; j++) { const io = (y + j) * W + x, to = j * w; for (let i = 0; i < w; i++) dot += img.d[io + i] * tz[to + i]; }
        out[y * ow + x] = dot / (tsd * Math.sqrt(varr));
      }
      if (yieldFn && (y & 31) === 31) { const r = yieldFn(y / oh); if (r === false) return null; }
    }
    return { s: out, ow, oh };
  }

  /**
   * Find occurrences of `tpl` (a crop of the same image) in `img`.
   * opts: { rotations: bool, minScore: 0.55 (candidates kept; UI filters further), onProgress }
   * Returns [{x,y,w,h,score,rot}] in img coordinates (top-left), non-max suppressed.
   */
  async function findSymbols(img, tpl, opts) {
    opts = opts || {};
    const minScore = opts.minScore == null ? 0.55 : opts.minScore;
    img = blur(img); tpl = blur(tpl);
    const f = Math.max(1, Math.floor(Math.min(tpl.w, tpl.h) / 14));
    const small = downscale(img, f);
    const rots = [tpl]; if (opts.rotations) { let t = tpl; for (let k = 1; k < 4; k++) { t = rot90(t); rots.push(t); } }
    const cands = [];
    let step = 0;
    for (let ri = 0; ri < rots.length; ri++) {
      const t = rots[ri], ts = downscale(t, f);
      if (ts.w < 4 || ts.h < 4) continue;
      const res = ncc(small, ts);
      if (!res) return [];
      step++; if (opts.onProgress) opts.onProgress(step / rots.length); await new Promise(r => setTimeout(r, 0));
      if (opts.cancel && opts.cancel()) return [];
      const { s, ow, oh } = res; const lo = minScore - 0.05;
      for (let y = 1; y < oh - 1; y++) for (let x = 1; x < ow - 1; x++) {
        const v = s[y * ow + x];
        if (v < lo) continue;
        if (v < s[y * ow + x - 1] || v < s[y * ow + x + 1] || v < s[(y - 1) * ow + x] || v < s[(y + 1) * ow + x]) continue; // local maximum
        // refine at full resolution around (x*f, y*f)
        let best = -1, bx = x * f, by = y * f;
        for (let dy = -f; dy <= f; dy++) for (let dx = -f; dx <= f; dx++) {
          const px = x * f + dx, py = y * f + dy;
          if (px < 0 || py < 0 || px + t.w > img.w || py + t.h > img.h) continue;
          const sc = nccAt(img, t, px, py);
          if (sc > best) { best = sc; bx = px; by = py; }
        }
        if (best >= minScore) cands.push({ x: bx, y: by, w: t.w, h: t.h, score: best, rot: ri * 90 });
      }
    }
    // non-max suppression across rotations
    cands.sort((a, b) => b.score - a.score);
    const keep = [], rad = 0.6 * Math.min(tpl.w, tpl.h);
    for (const c of cands) {
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      if (keep.some(k => Math.abs(k.x + k.w / 2 - cx) < rad && Math.abs(k.y + k.h / 2 - cy) < rad)) continue;
      keep.push(c);
      if (keep.length > 5000) break;
    }
    return keep;
  }
  function nccAt(img, t, x, y) {
    const n = t.w * t.h; let sm = 0, sq = 0, st = 0, stt = 0, dot = 0;
    for (let j = 0; j < t.h; j++) { const io = (y + j) * img.w + x, to = j * t.w; for (let i = 0; i < t.w; i++) { const a = img.d[io + i], b = t.d[to + i]; sm += a; sq += a * a; st += b; stt += b * b; dot += a * b; } }
    const cov = dot - sm * st / n, va = sq - sm * sm / n, vb = stt - st * st / n;
    return va > 1e-3 * n && vb > 1e-3 * n ? cov / Math.sqrt(va * vb) : 0;
  }

  /* ---------- scale text ("1:100", "SCALE 1/50", "مقياس الرسم 1:200") ---------- */
  function scaleFromText(s) {
    const m = /(?:scale|مقياس(?:\s*الرسم)?)?\s*[:=]?\s*1\s*[:/]\s*(\d{1,5})\b/i.exec(String(s || ''));
    if (!m) return 0; const v = +m[1]; return v >= 5 && v <= 50000 ? v : 0;
  }

  /* ---------- PDF vector extraction (pdf.js operator list) ---------- */
  const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  /**
   * Sums stroked path length per (layer?,colour). Units: PDF user-space points.
   * `OPS` is pdfjsLib.OPS. Returns Map(key -> {len, color, layer, n})
   */
  function strokeGroups(opList, OPS, ocName) {
    const fn = opList.fnArray, ar = opList.argsArray; const groups = new Map();
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let color = '#000000'; const ocStack = []; let path = [];
    const mulM = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    const tp = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    let cur = null, start = null;
    const L = () => { const o = ocStack.filter(Boolean); return o.length ? o[o.length - 1] : ''; };
    function addSeg(a, b) { path.push([a, b]); }
    function flushStroke() {
      if (!path.length) return;
      let len = 0; for (const [a, b] of path) len += Math.hypot(b[0] - a[0], b[1] - a[1]);
      const layer = L(), key = (layer ? layer + ' ' : '') + color;
      const g = groups.get(key) || { len: 0, color, layer, n: 0 }; g.len += len; g.n += path.length; groups.set(key, g);
      path = [];
    }
    for (let i = 0; i < fn.length; i++) {
      const op = fn[i], a = ar[i];
      switch (op) {
        case OPS.save: stack.push([ctm, color]); break;
        case OPS.restore: { const s = stack.pop(); if (s) { ctm = s[0]; color = s[1]; } break; }
        case OPS.transform: ctm = mulM(ctm, a); break;
        case OPS.setStrokeRGBColor: color = hex(a[0], a[1], a[2]); break;
        case OPS.setStrokeGray: { const g = typeof a[0] === 'number' && a[0] <= 1 ? a[0] * 255 : a[0]; color = hex(g, g, g); break; }
        case OPS.setStrokeColor: case OPS.setStrokeColorN: if (Array.isArray(a) && typeof a[0] === 'number' && a.length >= 3) color = hex(a[0] <= 1 ? a[0] * 255 : a[0], a[1] <= 1 ? a[1] * 255 : a[1], a[2] <= 1 ? a[2] * 255 : a[2]); break;
        case OPS.setStrokeCMYKColor: { const [c, m, y, k] = a; color = hex(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)); break; }
        case OPS.beginMarkedContentProps: { const nm = a && a[0] === 'OC' ? ocName(a[1]) : ''; ocStack.push(nm); break; }
        case OPS.beginMarkedContent: ocStack.push(''); break;
        case OPS.endMarkedContent: ocStack.pop(); break;
        case OPS.constructPath: {
          const ops = a[0], co = a[1]; let k = 0;
          for (const o of ops) {
            if (o === OPS.moveTo) { cur = tp(co[k], co[k + 1]); start = cur; k += 2; }
            else if (o === OPS.lineTo) { const p = tp(co[k], co[k + 1]); if (cur) addSeg(cur, p); cur = p; k += 2; }
            else if (o === OPS.curveTo) { const p1 = tp(co[k], co[k + 1]), p2 = tp(co[k + 2], co[k + 3]), p3 = tp(co[k + 4], co[k + 5]); bez(cur, p1, p2, p3, addSeg); cur = p3; k += 6; }
            else if (o === OPS.curveTo2) { const p2 = tp(co[k], co[k + 1]), p3 = tp(co[k + 2], co[k + 3]); bez(cur, cur, p2, p3, addSeg); cur = p3; k += 4; }
            else if (o === OPS.curveTo3) { const p1 = tp(co[k], co[k + 1]), p3 = tp(co[k + 2], co[k + 3]); bez(cur, p1, p3, p3, addSeg); cur = p3; k += 4; }
            else if (o === OPS.rectangle) { const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3]; const p = [tp(x, y), tp(x + w, y), tp(x + w, y + h), tp(x, y + h)]; for (let q = 0; q < 4; q++) addSeg(p[q], p[(q + 1) % 4]); cur = p[0]; start = p[0]; k += 4; }
            else if (o === OPS.closePath) { if (cur && start) addSeg(cur, start); cur = start; }
          }
          break;
        }
        case OPS.stroke: case OPS.closeStroke: case OPS.fillStroke: case OPS.eoFillStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke:
          if (op === OPS.closeStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke) { if (cur && start) addSeg(cur, start); }
          flushStroke(); cur = start = null; break;
        case OPS.fill: case OPS.eoFill: case OPS.endPath: case OPS.clip: case OPS.eoClip: path = []; cur = start = null; break;
      }
    }
    return groups;
  }
  function bez(p0, p1, p2, p3, add) {
    let prev = p0; const n = 8;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
      const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
      add(prev, [x, y]); prev = [x, y];
    }
  }
  return { fromRGBA, crop, downscale, blur, rot90, ncc, findSymbols, scaleFromText, strokeGroups };
});
