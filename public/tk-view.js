/* Sheet viewer for the take-off screen: loads PDF / image / DXF / DWG into a common "sheet" renderer
   (pan, zoom, snapshots) and extracts automatic measurements. window.TKV */
(function () {
  'use strict';
  const CAD = window.TKCAD, VIS = window.TKVIS;
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('تعذر تحميل ' + src)); }; document.head.appendChild(s); }));
  }
  let pdfjs = null;
  async function pdfLib() {
    if (pdfjs) return pdfjs;
    pdfjs = await import('/vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
    return pdfjs;
  }
  function dwgParse(buf) {
    return new Promise((res, rej) => {
      let w; try { w = new Worker('/vendor/dwg-worker.js'); } catch (e) { rej(new Error('تعذر تشغيل قارئ DWG في هذا المتصفح')); return; }
      w.onmessage = e => { w.terminate(); e.data.error ? rej(new Error('تعذرت قراءة ملف DWG هذا (الملف معقّد أو بصيغة قديمة). افتحه في AutoCAD واحفظه بصيغة DXF (Save As ← DXF) ثم أعد رفعه، فقراءة DXF أدق وأسرع.')) : res(e.data.model); };
      w.onerror = () => { w.terminate(); rej(new Error('تعذر قراءة ملف DWG (قد يكون كبيراً أو بصيغة غير مدعومة). احفظه من AutoCAD بصيغة DXF وأعد الرفع.')); };
      const c = buf.slice(0); w.postMessage({ buf: c }, [c]);
    });
  }
  async function dxfParser() { await loadScript('/vendor/dxf.js'); return new window.DxfParserLib(); }

  /* ---------- file type ---------- */
  function sniff(name, buf) {
    const u = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
    const s = String.fromCharCode(...u);
    if (s.startsWith('%PDF')) return 'pdf';
    if (/^AC10\d\d/.test(s)) return 'dwg';
    if (u[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'img';
    if (u[0] === 0xff && u[1] === 0xd8) return 'img';
    if (s.startsWith('RIFF') && s.includes('WEBP')) return 'img';
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'dxf') return 'dxf';
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'img';
    return '';
  }

  const NL = () => document.createElement('canvas');

  /* ---------- renderers ---------- */
  async function openPdf(buf) {
    const lib = await pdfLib();
    const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useSystemFonts: true }).promise;
    return { kind: 'pdf', doc, lib, pages: doc.numPages, page: {} };
  }
  async function pdfSheet(F, pageNo) {
    const page = F.page[pageNo] || (F.page[pageNo] = await F.doc.getPage(pageNo));
    const vp = page.getViewport({ scale: 1 });
    const R = { kind: 'pdf', flip: false, bounds: [0, 0, vp.width, vp.height], w: vp.width, h: vp.height, layer: null, task: null, busy: false };
    R.draw = (ctx, W, H, v, dpr) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W * dpr, H * dpr);
      const L = R.layer;
      if (L) { const k = v.z / L.z; ctx.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, (v.x - L.x * k) * dpr, (v.y - L.y * k) * dpr, L.canvas.width * k, L.canvas.height * k); }
    };
    R.refresh = (W, H, v, dpr, done) => {
      if (R.task) { try { R.task.cancel(); } catch (e) { /* ignore */ } }
      const c = NL(); c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr));
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      const vv = page.getViewport({ scale: v.z * dpr, offsetX: v.x * dpr, offsetY: v.y * dpr });
      const task = page.render({ canvasContext: ctx, viewport: vv }); R.task = task;
      task.promise.then(() => { if (R.task !== task) return; R.layer = { canvas: c, x: v.x, y: v.y, z: v.z, dpr }; done && done(); }).catch(() => {});
    };
    // fixed-size raster of a region (sheet coordinates), longest side <= maxPx
    R.snapshot = async (rect, maxPx) => {
      const [x0, y0, x1, y1] = rect, w = x1 - x0, h = y1 - y0, k = Math.min(maxPx / Math.max(w, h), 8);
      const c = NL(); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: k, offsetX: -x0 * k, offsetY: -y0 * k }) }).promise;
      return { canvas: c, k };
    };
    R.dispose = () => { if (R.task) try { R.task.cancel(); } catch (e) { /* ignore */ } };
    R.page = page;
    return R;
  }
  async function imgOpen(buf, name) {
    const blob = new Blob([buf], { type: /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('تعذر قراءة الصورة')); i.src = url; });
    return { kind: 'img', im, url };
  }
  function imgSheet(F) {
    const im = F.im; const R = { kind: 'img', flip: false, bounds: [0, 0, im.naturalWidth, im.naturalHeight], w: im.naturalWidth, h: im.naturalHeight };
    R.draw = (ctx, W, H, v, dpr) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W * dpr, H * dpr);
      ctx.imageSmoothingEnabled = v.z < 3;
      ctx.drawImage(im, v.x * dpr, v.y * dpr, im.naturalWidth * v.z * dpr, im.naturalHeight * v.z * dpr);
    };
    R.snapshot = async (rect, maxPx) => {
      const [x0, y0, x1, y1] = rect, w = x1 - x0, h = y1 - y0, k = Math.min(maxPx / Math.max(w, h), 4);
      const c = NL(); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, x0, y0, w, h, 0, 0, c.width, c.height); return { canvas: c, k };
    };
    return R;
  }
  async function cadOpen(buf, kind) {
    let model;
    if (kind === 'dxf') {
      const txt = new TextDecoder('utf-8').decode(buf);
      const p = await dxfParser(); model = CAD.fromDxf(p.parseSync(txt));
    } else {
      model = await dwgParse(buf);
    }
    const flat = CAD.flatten(model);
    return { kind: 'cad', model, flat };
  }
  /** guess a drawing-unit → metre factor when the file does not say */
  function guessUnit(F) {
    if (F.model.unitM > 0) return { m: F.model.unitM, src: 'cad' };
    const b = F.flat.bbox, d = Math.max(b[2] - b[0], b[3] - b[1]);
    return { m: d > 3000 ? 0.001 : d > 300 ? 0.01 : 1, src: 'guess' };
  }
  function cadSheet(F, unitM) {
    const b = F.flat.bbox, pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.03 + 1e-6;
    const R = { kind: 'cad', flip: true, bounds: [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], w: b[2] - b[0], h: b[3] - b[1], hidden: new Set(), hl: null };
    const layers = new Map((F.model.layers || []).map(l => [l.name, l]));
    R.layers = [...F.flat.segs.keys()].map(n => ({ name: n, color: CAD.aci((layers.get(n) || {}).color || 7), off: !!(layers.get(n) || {}).off, len: F.flat.lens[n] || 0 }));
    R.layers.forEach(l => { l.hidden = l.off; });
    R.paths = {};
    for (const [n, s] of F.flat.segs) { const p = new Path2D(); for (let i = 0; i < s.length; i += 4) { p.moveTo(s[i], s[i + 1]); p.lineTo(s[i + 2], s[i + 3]); } R.paths[n] = p; }
    R.draw = (ctx, W, H, v, dpr, opt) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W * dpr, H * dpr);
      ctx.save(); ctx.setTransform(dpr * v.z, 0, 0, -dpr * v.z, dpr * v.x, dpr * v.y); ctx.lineJoin = 'round';
      const mono = opt && opt.mono;
      for (const l of R.layers) { if (l.hidden) continue; ctx.strokeStyle = mono ? '#222' : l.color; ctx.lineWidth = (mono ? 1.4 : 1.1) / v.z; ctx.stroke(R.paths[l.name]); }
      if (R.hl && R.hl.layer && R.paths[R.hl.layer]) { ctx.strokeStyle = '#e0189b'; ctx.lineWidth = 3 / v.z; ctx.stroke(R.paths[R.hl.layer]); }
      ctx.restore();
      if (R.hl && R.hl.block) {
        const pts = F.flat.points[R.hl.block] || []; ctx.save(); ctx.strokeStyle = '#e0189b'; ctx.lineWidth = 2 * dpr; ctx.fillStyle = 'rgba(224,24,155,.15)';
        for (const p of pts.slice(0, 5000)) { const x = (p[0] * v.z + v.x) * dpr, y = (-p[1] * v.z + v.y) * dpr; ctx.beginPath(); ctx.arc(x, y, 10 * dpr, 0, 7); ctx.fill(); ctx.stroke(); }
        ctx.restore();
      }
    };
    R.snapshot = async (rect, maxPx) => {
      const [x0, y0, x1, y1] = rect, w = x1 - x0, h = y1 - y0, k = Math.min(maxPx / Math.max(w, h), 1e9);
      const c = NL(); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const ctx = c.getContext('2d'); R.draw(ctx, c.width, c.height, { x: -x0 * k, y: y1 * k, z: k }, 1, { mono: true }); return { canvas: c, k };
    };
    return R;
  }

  /* ---------- automatic measurements ---------- */
  async function pdfAutoMeas(F, pageNo, R) {
    const page = R.page; const out = []; const rawText = [];
    try {
      const tc = await page.getTextContent();
      const freq = {};
      for (const it of tc.items) { const s = String(it.str || '').trim(); if (!s) continue; rawText.push(s); if (s.length <= 14) freq[s] = (freq[s] || 0) + 1; }
      for (const [k, n] of Object.entries(freq)) if (n >= 2) out.push({ src: 'text', key: k, kind: 'count', raw: n, value: n });
    } catch (e) { /* ignore */ }
    let scaleDen = 0;
    for (const s of rawText) { scaleDen = VIS.scaleFromText(s); if (scaleDen) break; }
    try {
      const ol = await page.getOperatorList();
      let ocg = null; try { ocg = await F.doc.getOptionalContentConfig(); } catch (e) { /* none */ }
      const name = p => { try { const id = typeof p === 'string' ? p : p && p.id; const g = ocg && ocg.getGroup(id); return g && g.name ? String(g.name) : ''; } catch (e) { return ''; } };
      const groups = VIS.strokeGroups(ol, F.lib.OPS, name);
      [...groups.entries()].sort((a, b) => b[1].len - a[1].len).slice(0, 40).forEach(([k, g]) => { if (g.len > 20) out.push({ src: 'color', key: k, kind: 'len', raw: g.len, value: 0, color: g.color }); });
    } catch (e) { /* vector extraction is best-effort */ }
    return { meas: out, scaleDen };
  }
  function cadAutoMeas(F) {
    const out = [], fl = F.flat;
    for (const [k, c] of Object.entries(fl.counts)) out.push({ src: 'block', key: k, kind: 'count', raw: c.n, value: c.n, note: c.nested ? 'منها ' + c.nested + ' داخل كتل أخرى' : '' });
    for (const [k, v] of Object.entries(fl.lens)) if (v > 0) out.push({ src: 'layer', key: k, kind: 'len', raw: v, value: 0 });
    for (const [k, v] of Object.entries(fl.areas)) if (v > 0) out.push({ src: 'layer', key: k + ' [مساحة]', kind: 'area', raw: v, value: 0 });
    return out;
  }
  const IDB = 'rass-tk';
  function idb() { return new Promise((res, rej) => { try { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
  const fileStore = {
    async put(k, buf) { try { const d = await idb(); await new Promise((res, rej) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(buf, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch (e) { return false; } },
    async get(k) { try { const d = await idb(); return await new Promise((res) => { const t = d.transaction('f').objectStore('f').get(k); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); }); } catch (e) { return null; } },
    async del(k) { try { const d = await idb(); d.transaction('f', 'readwrite').objectStore('f').delete(k); } catch (e) { /* ignore */ } },
  };

  window.TKV = { sniff, openPdf, pdfSheet, imgOpen, imgSheet, cadOpen, cadSheet, guessUnit, pdfAutoMeas, cadAutoMeas, fileStore, loadScript };
})();
