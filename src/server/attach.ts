import { rows, row } from '@/lib/db';
import { audit } from '@/lib/audit';
import { bad, forbidden, notFound, Ctx, validId, str } from './http';
import crypto from 'node:crypto';

const actor = (c: Ctx) => ({ id: c.user!.id, username: c.user!.username, ip: c.ip });
const MAX = 3 * 1024 * 1024, PER_ITEM = 8;
const TYPES = ['datasheet', 'cert', 'approval', 'other'];
const meta = (r: any) => ({ id: r.id, refId: r.ref_id, docType: r.doc_type, name: r.name, mime: r.mime, size: r.size, at: r.created_at });

function sniff(buf: Buffer): string | null {
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}
export async function attList(c: Ctx) {
  const ref = c.query.get('refId');
  const list = ref ? await rows(`select id, ref_id, doc_type, name, mime, size, created_at from attachments where ref_kind = 'item' and ref_id = $1 order by created_at`, [ref])
    : await rows(`select id, ref_id, doc_type, name, mime, size, created_at from attachments where ref_kind = 'item' order by created_at limit 3000`);
  return { attachments: list.map(meta) };
}
export async function attGet(c: Ctx) {
  if (!validId(c.params.id)) throw notFound();
  const r = await row('select * from attachments where id = $1', [c.params.id]); if (!r) throw notFound();
  return { ...meta(r), data: `data:${r.mime};base64,${Buffer.from(r.data).toString('base64')}` };
}
export async function attCreate(c: Ctx) {
  if (!c.user!.perms.itemsWrite) throw forbidden();
  const refId = String(c.body?.refId || ''); if (!validId(refId)) throw bad('الصنف غير صالح');
  if (!(await row('select 1 from items where id = $1', [refId]))) throw bad('الصنف غير موجود');
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(c.body?.data || '')); if (!m) throw bad('الملف غير صالح');
  const buf = Buffer.from(m[2], 'base64'); if (!buf.length || buf.length > MAX) throw bad('حجم الملف يتجاوز 3 ميغابايت');
  const mime = sniff(buf); if (!mime) throw bad('الأنواع المسموحة: PDF وPNG وJPG فقط');
  const n = await row(`select count(*)::int as n from attachments where ref_kind = 'item' and ref_id = $1`, [refId]); if (n!.n >= PER_ITEM) throw bad('الحد الأقصى 8 مرفقات للصنف');
  const id = crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);
  const name = str(c.body?.name, 150).trim().replace(/[\\/<>"]/g, '') || 'مرفق';
  const type = TYPES.includes(c.body?.docType) ? c.body.docType : 'datasheet';
  await row('insert into attachments (id, ref_kind, ref_id, doc_type, name, mime, size, data, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id', [id, 'item', refId, type, name, mime, buf.length, buf, c.user!.id]);
  await audit(actor(c), 'attachment.create', 'item', refId, `إرفاق ${name} بالصنف`);
  return { attachment: meta((await row('select id, ref_id, doc_type, name, mime, size, created_at from attachments where id = $1', [id]))!) };
}
export async function attDelete(c: Ctx) {
  if (!c.user!.perms.itemsWrite) throw forbidden(); if (!validId(c.params.id)) throw notFound();
  const r = await row('delete from attachments where id = $1 returning id, ref_id, name', [c.params.id]); if (!r) throw notFound();
  await audit(actor(c), 'attachment.delete', 'item', r.ref_id, `حذف المرفق ${r.name}`);
  return { ok: true };
}
