// Runs inside a dedicated Worker served with its own CSP (the WASM glue needs 'unsafe-eval').
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';
importScripts('/tk-cad.js');
let lib = null;
self.onmessage = async e => {
  try {
    if (!lib) lib = await LibreDwg.create('/vendor');
    const dwg = lib.dwg_read_data(e.data.buf, Dwg_File_Type.DWG);
    if (!dwg) throw new Error('تعذر قراءة ملف DWG. احفظه بصيغة DXF من AutoCAD (Save As → DXF) وأعد الرفع.');
    const db = lib.convert(dwg);
    try { lib.dwg_free(dwg); } catch (x) { /* ignore */ }
    self.postMessage({ model: self.TKCAD.fromDwg(db) });
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err) });
  }
};
