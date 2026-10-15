// 1) copies the shared document/calc module to /public so the browser and the server use the same code
// 2) prepares the vendor bundles used by the quantity take-off screen (DWG/DXF/PDF readers)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src/shared/rass-doc.js');
if (!fs.existsSync(src)) { console.error('[prep] الملف src/shared/rass-doc.js غير موجود في المستودع — أضف المجلد src/shared كاملاً إلى GitHub (راجع README).'); process.exit(1); }
fs.copyFileSync(src, path.join(root, 'public/doc.js'));
console.log('[prep] public/doc.js updated');

const vend = path.join(root, 'public/vendor');
fs.mkdirSync(vend, { recursive: true });
const nm = p => path.join(root, 'node_modules', p);
const cp = (a, b) => fs.copyFileSync(a, path.join(vend, b));
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) cp(nm('pdfjs-dist/build/' + f), f);
cp(nm('@mlightcad/libredwg-web/wasm/libredwg-web.wasm'), 'libredwg-web.wasm');
const common = { bundle: true, minify: true, format: 'iife', target: ['es2020'], platform: 'browser', logLevel: 'error', define: { 'import.meta.url': '"/vendor/x.js"' } };
await build({ ...common, entryPoints: [path.join(root, 'src/takeoff/entry-dwg.js')], outfile: path.join(vend, 'dwg-worker.js'), external: ['fs', 'path', 'module', 'url', 'node:*'] });
await build({ ...common, entryPoints: [path.join(root, 'src/takeoff/entry-dxf.js')], outfile: path.join(vend, 'dxf.js') });
await build({ ...common, entryPoints: [path.join(root, 'src/vendor/entry-qr.js')], outfile: path.join(vend, 'qr.js') });
await build({ ...common, entryPoints: [path.join(root, 'src/vendor/entry-pdflib.js')], outfile: path.join(vend, 'pdflib.js') });
console.log('[prep] vendor bundles ready');

// 3) bundled Arabic print fonts (so documents print the same on every machine) -> public/vendor/fonts.css + woff2 files
const fdir = path.join(vend, 'fonts');
fs.mkdirSync(fdir, { recursive: true });
let css = '';
for (const pkg of ['cairo', 'tajawal', 'almarai', 'ibm-plex-sans-arabic', 'noto-kufi-arabic', 'noto-naskh-arabic', 'amiri', 'el-messiri']) {
  for (const w of ['400', '700']) {
    const f = nm(`@fontsource/${pkg}/${w}.css`);
    if (!fs.existsSync(f)) { console.warn('[prep] missing font css', pkg, w); continue; }
    for (const blk of fs.readFileSync(f, 'utf8').match(/@font-face\s*\{[^}]*\}/g) || []) {
      const m = /url\(\.\/files\/([^)]+?-(arabic|latin)-\d+-normal\.woff2)\)/.exec(blk);
      if (!m) continue;
      fs.copyFileSync(nm(`@fontsource/${pkg}/files/${m[1]}`), path.join(fdir, m[1]));
      css += blk.replace(/src:[^;]*;/, `src: url(/vendor/fonts/${m[1]}) format('woff2');`).replace(/\s+/g, ' ') + '\n';
    }
  }
}
fs.writeFileSync(path.join(vend, 'fonts.css'), css);
console.log('[prep] fonts ready');
