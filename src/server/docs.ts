import { rows, row, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { bad, forbidden, notFound, Ctx, validId, num, str, HttpError } from './http';
import { nextNumber } from './data';
import { sanitizeId } from './sanitize';
import crypto from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require('@/shared/rass-doc.js');

const actor = (c: Ctx) => ({ id: c.user!.id, username: c.user!.username, ip: c.ip });
const uid = () => crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);
const D = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* =============================== tax invoices =============================== */
const invOut = (r: any) => ({ id: r.id, no: r.no, kind: r.kind, date: r.date, custId: r.cust_id || '', qid: r.quote_id || '', payId: r.pay_id || '', refId: r.ref_id || '', ...r.data, subtotal: r.subtotal, vat: r.vat, total: r.total, issuedAt: r.issued_at, by: r.by_name || '' });
const INV_SEL = `select i.*, u.full_name as by_name from invoices i left join users u on u.id = i.created_by`;
export async function invList(c: Ctx) {
  if (!c.user!.perms.invoices) throw forbidden();
  return { invoices: (await rows(`${INV_SEL} order by i.date desc, i.no desc limit 2000`)).map(invOut) };
}
export async function invCreate(c: Ctx) {
  const u = c.user!; if (!u.perms.invoicesWrite) throw forbidden();
  const b = c.body || {}, kind = b.kind === 'credit' ? 'credit' : 'invoice';
  if (!D(b.date)) throw bad('التاريخ غير صالح');
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 60).map((l: any) => {
    const qty = Math.max(0, num(l?.qty)), price = Math.max(0, num(l?.price)), rate = Math.min(100, Math.max(0, num(l?.vatRate, 15)));
    const net = r2(qty * price), vat = r2(net * rate / 100);
    return { desc: str(l?.desc, 600).trim(), unit: str(l?.unit, 20), qty, price, vatRate: rate, net, vat, total: r2(net + vat) };
  }).filter((l: any) => l.desc && l.qty > 0 && l.price > 0);
  if (!lines.length) throw bad('أضف بنداً واحداً على الأقل بكمية وسعر');
  const subtotal = r2(lines.reduce((a: number, l: any) => a + l.net, 0)), vat = r2(lines.reduce((a: number, l: any) => a + l.vat, 0)), total = r2(subtotal + vat);
  const buyer = { name: str(b.buyer?.name, 300).trim(), vat: str(b.buyer?.vat, 30).trim(), cr: str(b.buyer?.cr, 30).trim(), address: str(b.buyer?.address, 400).trim() };
  if (!buyer.name) throw bad('اسم العميل مطلوب');
  if (buyer.vat && !/^\d{15}$/.test(buyer.vat)) throw bad('الرقم الضريبي للعميل يجب أن يكون 15 رقماً');
  const settings = (await row('select data from settings where id = 1'))!.data;
  if (!/^\d{15}$/.test(String(settings.vat || '').trim())) throw bad('الرقم الضريبي للشركة في الإعدادات يجب أن يكون 15 رقماً');
  const seller = { name: settings.nameAr, nameEn: settings.nameEn, vat: String(settings.vat).trim(), cr: settings.cr, address: settings.address || '', phone: settings.phone1 || '' };
  let custId: string | null = null, qid: string | null = null, payId: string | null = null, refId: string | null = null, refNo = '';
  if (b.custId) { const cu = await row('select id from customers where id = $1', [String(b.custId)]); if (cu) custId = cu.id; }
  if (b.qid) {
    const q = await row('select id, cust_id, data from quotes where id = $1', [String(b.qid)]);
    if (!q || !q.data.contract) throw bad('العقد غير موجود');
    qid = q.id; if (!custId) custId = q.cust_id;
    if (b.payId) { if (!q.data.contract.payments.some((x: any) => x.id === b.payId)) throw bad('الدفعة غير موجودة في العقد'); payId = String(b.payId); }
  }
  const id = uid();
  const out = await tx(async cl => {
    if (kind === 'credit') {
      const orig = await row(`select * from invoices where id = $1 and kind = 'invoice' for update`, [String(b.refId || '')], cl);
      if (!orig) throw bad('اختر الفاتورة الأصلية للإشعار الدائن');
      const used = await row(`select coalesce(sum(total),0) as t from invoices where ref_id = $1 and kind = 'credit'`, [orig.id], cl);
      if (r2(Number(used.t) + total) > Number(orig.total) + 0.005) throw bad(`مجموع الإشعارات الدائنة يتجاوز قيمة الفاتورة الأصلية (${R.fmt(orig.total)})`);
      refId = orig.id; refNo = orig.no; custId = custId || orig.cust_id; qid = qid || orig.quote_id;
      if (!str(b.reason, 400).trim()) throw bad('اكتب سبب الإشعار الدائن');
    }
    const no = await nextNumber(cl, 'invoice');
    const data = { buyer, seller, lines, note: str(b.note, 1000), reason: kind === 'credit' ? str(b.reason, 400).trim() : '', refNo, supplyDate: D(b.supplyDate) || D(b.date) };
    await cl.query('insert into invoices (id, no, kind, date, cust_id, quote_id, pay_id, ref_id, data, subtotal, vat, total, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [id, no, kind, b.date, custId, qid, payId, refId, data, subtotal, vat, total, u.id]);
    await audit(actor(c), kind === 'credit' ? 'invoice.credit' : 'invoice.create', 'invoice', id, `${kind === 'credit' ? 'إشعار دائن' : 'فاتورة ضريبية'} ${no} بمبلغ ${R.fmt(total)} للعميل ${buyer.name}`, { total, vat }, cl);
    return no;
  });
  const settingsNow = await row('select data from settings where id = 1');
  return { invoice: invOut((await row(`${INV_SEL} where i.id = $1`, [id]))!), no: out, counters: { invNext: settingsNow?.data?.invNext } };
}

/* ================================ agreements ================================ */
const KINDS = ['main', 'sub', 'supply', 'amc', 'nda', 'addendum', 'handover', 'custom'];
const S = (v: any, m = 500) => str(v, m);
export function cleanAgreement(a: any) {
  const p2 = a?.party2 || {};
  return {
    kind: KINDS.includes(a?.kind) ? a.kind : 'custom', title: S(a?.title, 200), date: D(a?.date),
    party2: { name: S(p2.name, 300), cr: S(p2.cr, 40), vat: S(p2.vat, 40), rep: S(p2.rep, 200), repTitle: S(p2.repTitle, 120), address: S(p2.address, 400), phone: S(p2.phone, 40) },
    rep1: S(a?.rep1, 200), rep1Title: S(a?.rep1Title, 120),
    project: S(a?.project, 300), location: S(a?.location, 300), duration: Math.max(0, num(a?.duration)),
    value: Math.max(0, num(a?.value)), delta: num(a?.delta), refNo: S(a?.refNo, 60), valueNote: S(a?.valueNote, 500),
    intro: S(a?.intro, 3000), closing: S(a?.closing, 1000), notes: S(a?.notes, 3000), tpl: sanitizeId(a?.tpl),
    custId: sanitizeId(a?.custId), quoteId: sanitizeId(a?.quoteId), stamp: !!a?.stamp,
    payments: (Array.isArray(a?.payments) ? a.payments : []).slice(0, 30).map((p: any) => ({ id: sanitizeId(p?.id), label: S(p?.label, 200), pct: Math.max(0, num(p?.pct)), due: D(p?.due) })),
    clauses: (Array.isArray(a?.clauses) ? a.clauses : []).slice(0, 80).map((k: any) => ({ id: sanitizeId(k?.id), title: S(k?.title, 200), text: S(k?.text, 4000), on: k?.on !== false })).filter((k: any) => k.text.trim() || k.title.trim()),
  };
}
const agOut = (r: any) => ({ ...r.data, id: r.id, no: r.no, status: r.status, kind: r.kind, custId: r.cust_id || '', quoteId: r.quote_id || '', _v: r.version, _owner: r.owner_id, _ownerName: r.owner_name || '', _updated: r.updated_at });
const AG_SEL = `select a.*, u.full_name as owner_name from agreements a left join users u on u.id = a.owner_id`;
const agRead = (c: Ctx) => { if (c.user!.perms.agreements === 'none') throw forbidden(); };
const agWrite = (c: Ctx) => { if (!['all', 'own'].includes(c.user!.perms.agreements)) throw forbidden(); };
const mineAg = async (c: Ctx, id: string) => {
  if (!validId(id)) throw notFound();
  const r = await row(`${AG_SEL} where a.id = $1`, [id]); if (!r) throw notFound();
  if (c.user!.perms.agreements === 'own' && r.owner_id !== c.user!.id) throw notFound();
  return r;
};
async function checkLinks(c: Ctx, d: any) {
  if (d.custId) { const cu = await row('select owner_id from customers where id = $1', [d.custId]); if (!cu || (c.user!.perms.ownOnly && cu.owner_id !== c.user!.id)) d.custId = ''; }
  if (d.quoteId) { const q = await row('select owner_id from quotes where id = $1', [d.quoteId]); if (!q || (c.user!.perms.ownOnly && q.owner_id !== c.user!.id)) d.quoteId = ''; }
}
export async function agList(c: Ctx) {
  agRead(c); const own = c.user!.perms.agreements === 'own';
  return { agreements: (await rows(`${AG_SEL} ${own ? 'where a.owner_id = $1' : ''} order by a.updated_at desc limit 1000`, own ? [c.user!.id] : [])).map(agOut) };
}
export async function agCreate(c: Ctx) {
  agWrite(c); const d: any = cleanAgreement(c.body?.agreement || {}); await checkLinks(c, d);
  const id = uid();
  await tx(async cl => {
    const no = await nextNumber(cl, 'agreement');
    await cl.query('insert into agreements (id, no, kind, owner_id, cust_id, quote_id, data) values ($1,$2,$3,$4,$5,$6,$7)', [id, no, d.kind, c.user!.id, d.custId || null, d.quoteId || null, d]);
    await audit(actor(c), 'agreement.create', 'agreement', id, `إنشاء ${d.title || 'اتفاقية'} رقم ${no}`, null, cl);
  });
  return { agreement: agOut((await row(`${AG_SEL} where a.id = $1`, [id]))!) };
}
export async function agSave(c: Ctx) {
  agWrite(c); const cur = await mineAg(c, c.params.id);
  if (Number(c.body?._v) !== cur.version) throw new HttpError(409, 'تم تعديل الاتفاقية من مستخدم آخر، أعد تحميل الصفحة', 'conflict', { current: agOut(cur) });
  if (cur.status === 'void') throw bad('الاتفاقية ملغاة ولا يمكن تعديلها');
  const d: any = cleanAgreement(c.body?.agreement || {}); await checkLinks(c, d);
  const status = ['draft', 'sent', 'signed', 'void'].includes(c.body?.status) ? c.body.status : cur.status;
  if (cur.status === 'signed' && status === 'signed' && JSON.stringify(cur.data) !== JSON.stringify(d)) throw bad('الاتفاقية الموقّعة مقفلة؛ أنشئ ملحقاً للتعديل أو أعدها إلى «مسودة» أولاً');
  const r = await row('update agreements set kind=$2, status=$3, cust_id=$4, quote_id=$5, data=$6, version=version+1, updated_at=now() where id=$1 returning *', [cur.id, d.kind, status, d.custId || null, d.quoteId || null, d]);
  if (cur.status !== status) await audit(actor(c), 'agreement.status', 'agreement', cur.id, `تغيير حالة الاتفاقية ${cur.no}: ${cur.status} ← ${status}`);
  else await audit(actor(c), 'agreement.update', 'agreement', cur.id, `تعديل الاتفاقية ${cur.no}`, null, undefined, true);
  return { agreement: agOut({ ...r, owner_name: cur.owner_name }) };
}
export async function agDelete(c: Ctx) {
  agWrite(c); const cur = await mineAg(c, c.params.id);
  if (c.user!.perms.agreements !== 'all' && cur.status !== 'draft') throw forbidden('لا يمكن حذف اتفاقية غير مسودة');
  await row('delete from agreements where id = $1 returning id', [cur.id]);
  await audit(actor(c), 'agreement.delete', 'agreement', cur.id, `حذف الاتفاقية ${cur.no}`);
  return { ok: true };
}
