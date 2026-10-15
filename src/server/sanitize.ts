import { str, num } from './http';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require('@/shared/rass-doc.js');

const S = (v: any, m = 500) => str(v, m);
const D = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const ID = (v: any) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);

export function cleanLine(l: any) {
  return { id: ID(l?.id), lib: ID(l?.lib), group: S(l?.group, 200), desc: S(l?.desc, 1500), brand: S(l?.brand, 100), unit: S(l?.unit, 30), qty: Math.max(0, num(l?.qty)), price: Math.max(0, num(l?.price)), ...(num(l?.cost) > 0 ? { cost: Math.max(0, num(l.cost)) } : {}), ...(l?.est ? { est: true } : {}), ...(l?.src ? { src: S(l.src, 60) } : {}) };
}
export function cleanContract(k: any) {
  if (!k || typeof k !== 'object') return null;
  return {
    date: D(k.date), party2: S(k.party2, 300), duration: Math.max(0, num(k.duration)),
    override: k.override === '' || k.override == null ? '' : Math.max(0, num(k.override)),
    items: !!k.items, stamp: !!k.stamp, tpl: ID(k.tpl), retention: Math.min(30, Math.max(0, num(k.retention))), retentionNote: S(k.retentionNote, 300), intro: S(k.intro, 3000), terms: S(k.terms, 12000), paynote: S(k.paynote, 2000), close: S(k.close, 1000),
    payments: (Array.isArray(k.payments) ? k.payments : []).slice(0, 30).map((p: any) => ({ id: ID(p?.id), label: S(p?.label, 200), pct: Math.max(0, num(p?.pct)), due: D(p?.due) })),
  };
}
/** Whitelist the quote fields a client may write. Server-controlled data lives in separate columns. */
export function cleanQuote(q: any) {
  return {
    no: S(q?.no, 40), date: D(q?.date), client: S(q?.client, 300), custId: ID(q?.custId), project: S(q?.project, 300), location: S(q?.location, 300),
    validity: Math.max(0, num(q?.validity)), status: ['draft', 'sent', 'won', 'lost', 'superseded'].includes(q?.status) ? q.status : 'draft',
    preparedBy: S(q?.preparedBy, 200), rev: Math.max(1, Math.floor(num(q?.rev, 1))), fam: ID(q?.fam), parent: ID(q?.parent), tpl: ID(q?.tpl),
    lines: (Array.isArray(q?.lines) ? q.lines : []).slice(0, 400).map(cleanLine),
    discMode: q?.discMode === 'amt' ? 'amt' : 'pct', discPct: Math.min(100, Math.max(0, num(q?.discPct))), discAmt: Math.max(0, num(q?.discAmt)),
    vatRate: Math.min(100, Math.max(0, num(q?.vatRate, 15))), notes: S(q?.notes, 6000), lostReason: PICK(q?.lostReason, ['price', 'competitor', 'cancelled', 'budget', 'scope', 'noreply', 'other'], ''), contract: cleanContract(q?.contract),
  };
}
export function cleanCustomer(c: any) {
  return { id: ID(c?.id), name: S(c?.name, 300), contact: S(c?.contact, 200), phone: S(c?.phone, 40), email: S(c?.email, 200), city: S(c?.city, 100), vat: S(c?.vat, 40), cr: S(c?.cr, 40), address: S(c?.address, 400), notes: S(c?.notes, 2000) };
}
export function cleanItem(i: any) {
  return { id: ID(i?.id), cat: S(i?.cat, 200), desc: S(i?.desc, 1500), brand: S(i?.brand, 100), unit: S(i?.unit, 30), price: Math.max(0, num(i?.price)), ...(num(i?.cost) > 0 ? { cost: Math.max(0, num(i.cost)) } : {}), ...(i?.est ? { est: true } : {}), ...(i?.std ? { std: S(i.std, 40) } : {}) };
}
const IMG = (v: any, max: number) => { const s = String(v || ''); return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= max ? s : ''; };
const SETTING_STR: Record<string, number> = { nameAr: 200, nameEn: 200, brandEn: 200, cr: 40, vat: 40, phone1: 40, phone2: 40, email: 200, web: 200, bankName: 200, iban: 60, thanks: 1000, preparedBy: 200, prefix: 20, rcPrefix: 20, notes: 6000, cterms: 12000, cintro: 3000, cpaynote: 2000, cclose: 1000, address: 300, invPrefix: 20, agPrefix: 20, invNote: 1000 };
const KEYN = (v: any) => String(v || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24);
export function cleanTk(t: any) {
  const consts: Record<string, number> = {};
  for (const [k, v] of Object.entries(t?.consts && typeof t.consts === 'object' ? t.consts : {}).slice(0, 40)) { const kk = KEYN(k); if (kk && /^[A-Za-z_]/.test(kk)) consts[kk] = Math.min(1e9, Math.max(-1e9, num(v))); }
  return {
    consts,
    vars: (Array.isArray(t?.vars) ? t.vars : []).slice(0, 200).map((v: any) => ({ id: KEYN(v?.id), name: S(v?.name, 120), kind: ['count', 'len', 'area'].includes(v?.kind) ? v.kind : 'count', item: S(v?.item, 40), formula: S(v?.formula, 300), sys: S(v?.sys, 60), unit: S(v?.unit, 20) })).filter((v: any) => v.id),
    rules: (Array.isArray(t?.rules) ? t.rules : []).slice(0, 400).map((r: any) => ({ id: KEYN(r?.id), src: ['block', 'layer', 'color', 'text'].includes(r?.src) ? r.src : 'block', pat: S(r?.pat, 120), var: KEYN(r?.var) })).filter((r: any) => r.pat && r.var),
  };
}
/* ---------- document templates ---------- */
const HEX = (v: any, d: string) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : d);
const PICK = (v: any, ok: string[], d: string) => (ok.includes(String(v)) ? String(v) : d);
const BOOL = (v: any, d: boolean) => (typeof v === 'boolean' ? v : d);
const FONT = (v: any, d: string) => { const x = String(v || ''); return R.FONTS[x] || /^c:[A-Za-z0-9_-]{1,40}$/.test(x) ? x : d; };
export function cleanTpl(t: any) {
  const D = R.TPL0, th = t?.theme || {}, f = t?.font || {}, h = t?.head || {}, tb = t?.table || {}, sh = t?.show || {}, o = t?.order || {}, labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(t?.labels && typeof t.labels === 'object' ? t.labels : {}).slice(0, 80)) if ((R.LABELS[k] || k === 'brandBar') && String(v).trim()) labels[k] = S(v, 200);
  const theme: Record<string, string> = {}; for (const k of Object.keys(D.theme)) theme[k] = HEX(th[k], D.theme[k]);
  const show: Record<string, boolean> = {}; for (const k of Object.keys(D.show)) show[k] = BOOL(sh[k], D.show[k]);
  const order: Record<string, string[]> = {};
  for (const k of ['quote', 'contract']) { const def: string[] = D.order[k]; const got = (Array.isArray(o[k]) ? o[k] : []).map(String).filter((x: string, i: number, a: string[]) => def.includes(x) && a.indexOf(x) === i); def.forEach(x => { if (!got.includes(x)) got.push(x); }); order[k] = got; }
  return {
    id: ID(t?.id), name: S(t?.name, 60) || 'قالب', paper: PICK(t?.paper, ['letter', 'a4'], 'letter'), theme,
    font: { body: FONT(f.body, 'classic'), head: FONT(f.head, 'classic'), scale: Math.min(1.4, Math.max(0.7, num(f.scale, 1))) },
    head: { style: PICK(h.style, ['classic', 'center', 'minimal', 'band'], 'classic'), logoH: Math.min(45, Math.max(10, num(h.logoH, 25))), note: S(h.note, 200) },
    bar: PICK(t?.bar, ['solid', 'line', 'none'], 'solid'),
    table: { border: PICK(tb.border, ['thin', 'soft', 'none', 'bold'], 'thin'), zebra: BOOL(tb.zebra, true), group: PICK(tb.group, ['solid', 'tint', 'line'], 'solid'), cols: { no: BOOL(tb.cols?.no, true), brand: BOOL(tb.cols?.brand, true), unit: BOOL(tb.cols?.unit, true) } },
    show, order, labels, watermark: S(t?.watermark, 40), footNote: S(t?.footNote, 300),
    margin: { top: Math.min(30, Math.max(0, num(t?.margin?.top, 7))), side: Math.min(30, Math.max(0, num(t?.margin?.side, 10))) },
  };
}
const FONTDATA = /^data:[a-z0-9/+.\-]{3,60};base64,[A-Za-z0-9+/=]+$/;
export function cleanFonts(list: any) {
  let total = 0; const out: any[] = [];
  for (const f of (Array.isArray(list) ? list : []).slice(0, 4)) {
    const data = String(f?.data || ''); const id = ID(f?.id);
    if (!id || !FONTDATA.test(data) || data.length > 1_600_000 || total + data.length > 4_500_000) continue;
    total += data.length; out.push({ id, name: S(f?.name, 60) || 'خط', data });
  }
  return out;
}
export function cleanSettings(s: any) {
  const o: any = {};
  for (const [k, m] of Object.entries(SETTING_STR)) o[k] = S(s?.[k], m);
  o.vatRate = Math.min(100, Math.max(0, num(s?.vatRate, 15)));
  o.validity = Math.max(0, num(s?.validity, 30));
  o.discApprovalPct = Math.min(100, Math.max(0, num(s?.discApprovalPct, 5)));
  o.salesMaxDiscPct = Math.min(100, Math.max(0, num(s?.salesMaxDiscPct, 15)));
  o.minMarginPct = Math.min(100, Math.max(0, num(s?.minMarginPct, 0)));
  o.targetMarginPct = Math.min(100, Math.max(0, num(s?.targetMarginPct, 25)));
  o.shareDays = Math.min(365, Math.max(1, Math.floor(num(s?.shareDays, 30))));
  o.portalOn = s?.portalOn === true;
  o.tk = cleanTk(s?.tk);
  o.fonts = cleanFonts(s?.fonts);
  if (Array.isArray(s?.clauses)) o.clauses = s.clauses.slice(0, 150).map((k: any) => ({ id: ID(k?.id), cat: S(k?.cat, 60), title: S(k?.title, 200), text: S(k?.text, 4000), kinds: S(k?.kinds, 120).replace(/[^a-z,]/g, '') })).filter((k: any) => k.id && k.text.trim());
  o.kits = (Array.isArray(s?.kits) ? s.kits : []).slice(0, 40).map((k: any) => ({ id: ID(k?.id), name: S(k?.name, 80), lines: (Array.isArray(k?.lines) ? k.lines : []).slice(0, 80).map((l: any) => ({ lib: ID(l?.lib), group: S(l?.group, 200), desc: S(l?.desc, 1500), brand: S(l?.brand, 100), unit: S(l?.unit, 30), qty: Math.max(0, num(l?.qty)), price: Math.max(0, num(l?.price)) })) })).filter((k: any) => k.id && k.name && k.lines.length);
  o.templates = (Array.isArray(s?.templates) ? s.templates : []).slice(0, 12).map(cleanTpl).filter((t: any) => t.id);
  const ids = new Set(o.templates.map((t: any) => t.id)); const td: any = {};
  for (const k of ['quote', 'contract', 'receipt']) { const v = ID(s?.tplDef?.[k]); td[k] = ids.has(v) ? v : ''; }
  o.tplDef = td;
  o.logo = IMG(s?.logo, 1_500_000);
  o.stamp = IMG(s?.stamp, 1_500_000);
  o.pay = (Array.isArray(s?.pay) ? s.pay : []).slice(0, 30).map((p: any) => ({ id: ID(p?.id), label: S(p?.label, 200), pct: Math.max(0, num(p?.pct)), due: '' }));
  return o;
}
export const sanitizeId = ID;
