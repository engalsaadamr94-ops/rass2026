import { rows, row, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { bad, forbidden, notFound, Ctx, validId, num, str, HttpError } from './http';
import { nextPdocNumber } from './data';
import { sanitizeId } from './sanitize';
import crypto from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require('@/shared/rass-doc.js');

const actor = (c: Ctx) => ({ id: c.user!.id, username: c.user!.username, ip: c.ip });
const uid = () => crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);
const D = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const S = (v: any, m = 500) => str(v, m);
const KINDS = ['vo', 'ipc', 'chq', 'rfq'] as const;
type Kind = (typeof KINDS)[number];
const STATUS: Record<Kind, string[]> = { vo: ['draft', 'submitted', 'approved', 'rejected'], ipc: ['draft', 'approved', 'paid', 'rejected'], chq: ['pending', 'deposited', 'cleared', 'bounced', 'cancelled'], rfq: ['draft', 'sent', 'closed'] };
const LOCKED: Partial<Record<Kind, string[]>> = { vo: ['approved'], ipc: ['approved', 'paid'] };
const LABEL: Record<Kind, string> = { vo: 'أمر التغيير', ipc: 'المستخلص', chq: 'الشيك', rfq: 'طلب الأسعار' };

function canRead(c: Ctx, k: Kind) {
  const p = c.user!.perms;
  if (k === 'chq') return p.receipts; if (k === 'rfq') return p.seeCost;
  return p.pdocs !== 'none';
}
function canWrite(c: Ctx, k: Kind) {
  const p = c.user!.perms;
  if (k === 'chq') return p.receiptsWrite; if (k === 'rfq') return p.seeCost && p.pdocs === 'write';
  return p.pdocs === 'write';
}
const kindOf = (v: any): Kind => { if (!KINDS.includes(v)) throw bad('نوع المستند غير صالح'); return v; };

function cleanCommon(d: any) {
  return { date: D(d?.date), client: S(d?.client, 300), project: S(d?.project, 300), contractNo: S(d?.contractNo, 60), rep1: S(d?.rep1, 200), note: S(d?.note, 2000) };
}
const cleanLines = (a: any, keys: (l: any) => any, max = 120) => (Array.isArray(a) ? a : []).slice(0, max).map(keys);
function clean(kind: Kind, d: any) {
  const base = cleanCommon(d);
  if (kind === 'vo') {
    const o: any = { ...base, title: S(d?.title, 300), reason: S(d?.reason, 2000), dir: d?.dir === 'omit' ? 'omit' : 'add', vatRate: Math.min(100, Math.max(0, num(d?.vatRate, 15))), days: Math.round(num(d?.days)), before: Math.max(0, num(d?.before)),
      lines: cleanLines(d?.lines, (l: any) => ({ id: sanitizeId(l?.id) || uid(), desc: S(l?.desc, 600), unit: S(l?.unit, 20), qty: Math.max(0, num(l?.qty)), price: Math.max(0, num(l?.price)) }), 80).filter((l: any) => l.desc.trim()) };
    return o;
  }
  if (kind === 'ipc') {
    return { ...base, periodTo: D(d?.periodTo), vatRate: Math.min(100, Math.max(0, num(d?.vatRate, 15))), advance: Math.max(0, num(d?.advance)), advPct: Math.min(100, Math.max(0, num(d?.advPct))), retPct: Math.min(100, Math.max(0, num(d?.retPct))), deduct: Math.max(0, num(d?.deduct)), deductNote: S(d?.deductNote, 300),
      lines: cleanLines(d?.lines, (l: any) => ({ id: sanitizeId(l?.id) || uid(), desc: S(l?.desc, 600), amt: Math.max(0, num(l?.amt)), pct: Math.min(100, Math.max(0, num(l?.pct))) }), 200).filter((l: any) => l.desc.trim()) };
  }
  if (kind === 'chq') {
    return { dir: d?.dir === 'out' ? 'out' : 'in', bank: S(d?.bank, 120), chqNo: S(d?.chqNo, 40), party: S(d?.party, 300), custId: sanitizeId(d?.custId), amount: Math.max(0, num(d?.amount)), issued: D(d?.issued), due: D(d?.due), project: S(d?.project, 300), note: S(d?.note, 1000) };
  }
  // rfq
  const lines = cleanLines(d?.lines, (l: any) => ({ id: sanitizeId(l?.id) || uid(), desc: S(l?.desc, 600), unit: S(l?.unit, 20), qty: Math.max(0, num(l?.qty)), lib: sanitizeId(l?.lib) }), 150).filter((l: any) => l.desc.trim());
  const sups = cleanLines(d?.suppliers, (s: any) => ({ id: sanitizeId(s?.id) || uid(), name: S(s?.name, 200), phone: S(s?.phone, 40) }), 12).filter((s: any) => s.name.trim());
  const lid = new Set(lines.map((l: any) => l.id)), sid = new Set(sups.map((s: any) => s.id));
  const offers: Record<string, Record<string, number>> = {};
  for (const s of sups) { const src = d?.offers?.[s.id] || {}; offers[s.id] = {}; for (const l of lines) { const v = num(src[l.id], 0); if (v > 0) offers[s.id][l.id] = v; } }
  const chosen: Record<string, string> = {}; for (const [k, v] of Object.entries(d?.chosen || {})) if (lid.has(k) && sid.has(String(v))) chosen[k] = String(v);
  return { title: S(d?.title, 300), quoteId: sanitizeId(d?.quoteId), client: base.client, project: base.project, date: base.date, note: base.note, lines, suppliers: sups, offers, chosen };
}

async function prevIpc(quoteId: string, seq: number, cl?: any) {
  if (!quoteId) return null;
  const r = await row(`select data from pdocs where kind = 'ipc' and quote_id = $1 and status in ('approved','paid') and (data->>'seq')::int < $2 order by (data->>'seq')::int desc limit 1`, [quoteId, seq], cl);
  return r?.data?.calc || null;
}
async function finish(kind: Kind, d: any, quoteId: string, seq: number, cl?: any) {
  if (kind === 'vo') { const c = R.voCalc(d); return { data: d, amount: c.signed }; }
  if (kind === 'ipc') { const prev = await prevIpc(quoteId, seq, cl); const calc = R.ipcCalc(d, prev); return { data: { ...d, seq, calc }, amount: calc.payable }; }
  if (kind === 'chq') return { data: d, amount: d.amount };
  return { data: d, amount: 0 };
}

const out = (r: any) => ({ ...r.data, id: r.id, kind: r.kind, no: r.no, status: r.status, quoteId: r.quote_id || '', custId: r.cust_id || '', amount: Number(r.amount), _v: r.version, _owner: r.owner_id, _ownerName: r.owner_name || '', _updated: r.updated_at });
const SEL = `select p.*, u.full_name as owner_name from pdocs p left join users u on u.id = p.owner_id`;

async function checkQuote(c: Ctx, quoteId: string, needContract: boolean) {
  if (!quoteId) { if (needContract) throw bad('اختر العقد المرتبط'); return null; }
  const q = await row('select id, owner_id, cust_id, data, status from quotes where id = $1', [quoteId]);
  if (!q || (c.user!.perms.ownOnly && q.owner_id !== c.user!.id)) throw bad('العقد غير موجود');
  if (needContract && !q.data?.contract) throw bad('العرض المختار ليس عقداً');
  return q;
}

export async function pdList(c: Ctx) {
  const kind = kindOf(c.query.get('kind')); if (!canRead(c, kind)) throw forbidden();
  const own = c.user!.perms.ownOnly && (kind === 'vo' || kind === 'ipc');
  const list = own
    ? await rows(`${SEL} join quotes q on q.id = p.quote_id where p.kind = $1 and q.owner_id = $2 order by p.created_at desc limit 2000`, [kind, c.user!.id])
    : await rows(`${SEL} where p.kind = $1 order by p.created_at desc limit 2000`, [kind]);
  return { docs: list.map(out) };
}
export async function pdCreate(c: Ctx) {
  const kind = kindOf(c.body?.kind); if (!canWrite(c, kind)) throw forbidden();
  const d: any = clean(kind, c.body?.doc || {});
  const q = await checkQuote(c, kind === 'rfq' ? d.quoteId : sanitizeId(c.body?.doc?.quoteId), kind === 'ipc' || kind === 'vo');
  const id = uid(); let no = '';
  await tx(async cl => {
    no = await nextPdocNumber(cl, kind);
    let seq = 0;
    if (kind === 'ipc') { const m = await row(`select coalesce(max((data->>'seq')::int),0) as m from pdocs where kind = 'ipc' and quote_id = $1`, [q!.id], cl); seq = Number(m!.m) + 1; }
    const f = await finish(kind, d, q?.id || '', seq, cl);
    await cl.query('insert into pdocs (id, kind, no, quote_id, cust_id, status, owner_id, data, amount) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, kind, no, q?.id || null, q?.cust_id || (d.custId || null), STATUS[kind][0], c.user!.id, f.data, f.amount]);
    await audit(actor(c), `${kind}.create`, kind, id, `إنشاء ${LABEL[kind]} ${no}`, null, cl);
  });
  return { doc: out((await row(`${SEL} where p.id = $1`, [id]))!) };
}
async function mine(c: Ctx, id: string) {
  if (!validId(id)) throw notFound();
  const r = await row(`${SEL} where p.id = $1`, [id]); if (!r) throw notFound();
  if (!canRead(c, r.kind)) throw forbidden();
  if (c.user!.perms.ownOnly && (r.kind === 'vo' || r.kind === 'ipc')) { const q = await row('select owner_id from quotes where id = $1', [r.quote_id]); if (!q || q.owner_id !== c.user!.id) throw notFound(); }
  return r;
}
export async function pdSave(c: Ctx) {
  const cur = await mine(c, c.params.id); const kind = cur.kind as Kind; if (!canWrite(c, kind)) throw forbidden();
  if (Number(c.body?._v) !== cur.version) throw new HttpError(409, 'تم تعديل المستند من مستخدم آخر، أعد تحميل الصفحة', 'conflict', { current: out(cur) });
  const status = STATUS[kind].includes(c.body?.status) ? c.body.status : cur.status;
  const d: any = clean(kind, c.body?.doc || {});
  const locked = (LOCKED[kind] || []).includes(cur.status);
  if (locked) {
    const same = JSON.stringify(clean(kind, cur.data)) === JSON.stringify(d);
    if (!same) throw bad(`${LABEL[kind]} معتمد ومقفل ولا يمكن تعديل بياناته`);
    if (kind === 'ipc' && cur.status === 'paid' && status !== 'paid') throw bad('المستخلص المدفوع مقفل');
    if (kind === 'vo' && status !== 'approved') throw bad('أمر التغيير المعتمد مقفل');
  }
  if (kind === 'ipc' && status === 'approved' && cur.status === 'draft') {
    const prev = await row(`select 1 from pdocs where kind = 'ipc' and quote_id = $1 and (data->>'seq')::int < $2 and status = 'draft'`, [cur.quote_id, cur.data.seq]);
    if (prev) throw bad('اعتمد المستخلصات السابقة أولاً');
  }
  const f = await finish(kind, d, cur.quote_id || '', Number(cur.data?.seq || 0));
  const dataOut = locked ? cur.data : f.data; const amount = locked ? Number(cur.amount) : f.amount;
  const r = await row('update pdocs set status = $2, data = $3, amount = $4, version = version + 1, updated_at = now() where id = $1 returning *', [cur.id, status, dataOut, amount]);
  if (cur.status !== status) await audit(actor(c), `${kind}.status`, kind, cur.id, `${LABEL[kind]} ${cur.no}: ${cur.status} ← ${status}`);
  else await audit(actor(c), `${kind}.update`, kind, cur.id, `تعديل ${LABEL[kind]} ${cur.no}`, null, undefined, true);
  return { doc: out({ ...r, owner_name: cur.owner_name }) };
}
export async function pdDelete(c: Ctx) {
  const cur = await mine(c, c.params.id); const kind = cur.kind as Kind; if (!canWrite(c, kind)) throw forbidden();
  if (c.user!.role !== 'admin' && !['draft', 'pending'].includes(cur.status)) throw forbidden('لا يمكن حذف مستند غير مسودة');
  if (kind === 'ipc' && cur.status !== 'draft') throw bad('لا يُحذف مستخلص معتمد');
  if (kind === 'vo' && cur.status === 'approved') throw bad('لا يُحذف أمر تغيير معتمد');
  await row('delete from pdocs where id = $1 returning id', [cur.id]);
  await audit(actor(c), `${kind}.delete`, kind, cur.id, `حذف ${LABEL[kind]} ${cur.no}`);
  return { ok: true };
}
