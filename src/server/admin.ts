import zlib from 'node:zlib';
import { rows, row, tx, pool } from '@/lib/db';
import { audit, listAudit } from '@/lib/audit';
import { appUrl, mailShell, sendMail } from '@/lib/mail';
import { bad, forbidden, notFound, Ctx, num } from './http';
import { cleanCustomer, cleanItem, cleanQuote, cleanSettings, sanitizeId } from './sanitize';
import { customerOut, itemOut, loadReceipts, loadSettings, METHODS } from './data';
import { cleanAgreement } from './docs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require('@/shared/rass-doc.js');

/* ---------- audit ---------- */
export async function auditList(c: Ctx) {
  const q = c.query;
  const entries = await listAudit({ limit: num(q.get('limit'), 100), before: num(q.get('before')) || undefined, entity: q.get('entity') || undefined, entityId: q.get('entityId') || undefined, user: q.get('user') || undefined, action: q.get('action') || undefined });
  return { entries };
}

/* ---------- backup / export / import ---------- */
export async function buildDump() {
  const [settings, items, customers, quotes, receipts, users, invoices, agreements, pdocs] = await Promise.all([
    loadSettings(),
    rows('select * from items order by seq'),
    rows('select * from customers order by created_at'),
    rows('select q.*, u.username as owner_username from quotes q left join users u on u.id = q.owner_id order by q.created_at'),
    loadReceipts(),
    rows('select id, username, email, full_name, role, active from users order by created_at'),
    rows('select id, no, kind, date, cust_id, quote_id, pay_id, ref_id, data, subtotal, vat, total, issued_at from invoices order by issued_at'),
    rows('select a.id, a.no, a.kind, a.status, a.cust_id, a.quote_id, a.data, a.created_at, u.username as owner_username from agreements a left join users u on u.id = a.owner_id order by a.created_at'),
    rows('select id, kind, no, quote_id, cust_id, status, data, amount, created_at from pdocs order by created_at'),
  ]);
  return {
    format: 'rass-backup', v: 5, at: new Date().toISOString(),
    settings: settings ? (({ _v, ...s }: any) => s)(settings) : null,
    items: items.map((r: any) => ({ ...r.data, id: r.id })),
    customers: customers.map((r: any) => ({ ...r.data, id: r.id, _ownerId: r.owner_id })),
    quotes: quotes.map((r: any) => ({ ...r.data, id: r.id, no: r.no, status: r.status, custId: r.cust_id || '', rev: r.rev, fam: r.fam || undefined, _ownerUsername: r.owner_username, _decision: r.decision, _approval: r.approval_state })),
    receipts, users, invoices, agreements, pdocs,
  };
}
export async function createBackup(kind: 'auto' | 'manual') {
  const dump = await buildDump();
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(dump)));
  const counts = { items: dump.items.length, customers: dump.customers.length, quotes: dump.quotes.length, receipts: dump.receipts.length, invoices: dump.invoices.length, agreements: dump.agreements.length, pdocs: dump.pdocs.length };
  const r = await row('insert into backups (kind, size_bytes, counts, data) values ($1,$2,$3,$4) returning id, created_at', [kind, gz.length, counts, gz]);
  if (kind === 'auto') await pool.query(`delete from backups where kind = 'auto' and id not in (select id from backups where kind = 'auto' order by id desc limit 30)`);
  else await pool.query(`delete from backups where kind = 'manual' and id not in (select id from backups where kind = 'manual' order by id desc limit 20)`);
  return { id: r!.id, created_at: r!.created_at, size: gz.length, counts };
}
export async function listBackups() { return { backups: await rows('select id, created_at, kind, size_bytes, counts from backups order by id desc limit 60') }; }
export async function manualBackup(c: Ctx) {
  const b = await createBackup('manual');
  await audit({ id: c.user!.id, username: c.user!.username, ip: c.ip }, 'backup.create', 'backup', String(b.id), 'نسخة احتياطية يدوية');
  return { backup: b };
}
export async function downloadBackup(c: Ctx) {
  const r = await row('select data, created_at from backups where id = $1', [num(c.params.id)]);
  if (!r) throw notFound();
  await audit({ id: c.user!.id, username: c.user!.username, ip: c.ip }, 'backup.download', 'backup', c.params.id, 'تنزيل نسخة احتياطية');
  return new Response(new Uint8Array(zlib.gunzipSync(r.data)), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="rass-backup-${c.params.id}.json"` } });
}
export async function liveExport(c: Ctx) {
  await audit({ id: c.user!.id, username: c.user!.username, ip: c.ip }, 'backup.export', 'backup', null, 'تصدير نسخة كاملة');
  const d = await buildDump();
  return new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="rass-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
}

/** Merge-import (legacy single-device backup or a rass-backup file). Never deletes; receipts are only added. */
export async function importData(c: Ctx) {
  const d = c.body?.data;
  if (!d || typeof d !== 'object' || !Array.isArray(d.quotes) || !Array.isArray(d.items) || !d.settings) throw bad('الملف ليس نسخة احتياطية صالحة');
  const u = c.user!, applySettings = c.body?.applySettings !== false;
  const res = { items: 0, customers: 0, quotes: 0, quotesSkipped: 0, receipts: 0, receiptsSkipped: 0 };
  await tx(async cl => {
    if (applySettings) {
      const cur = (await row('select data from settings where id = 1', [], cl))?.data || {};
      const clean: any = cleanSettings(d.settings);
      clean.nextSeq = Math.max(Number(cur.nextSeq || 1), Math.floor(num(d.settings.nextSeq, 1)));
      clean.rcNext = Math.max(Number(cur.rcNext || 1), Math.floor(num(d.settings.rcNext, 1)));
      clean.invNext = Math.max(Number(cur.invNext || 1), Math.floor(num(d.settings.invNext, 1)));
      clean.agNext = Math.max(Number(cur.agNext || 1), Math.floor(num(d.settings.agNext, 1)));
      await cl.query('insert into settings (id, data) values (1, $1) on conflict (id) do update set data = $1, version = settings.version + 1, updated_at = now()', [clean]);
    }
    for (const i of d.items) {
      const x = cleanItem(i); if (!x.id || !x.desc) continue;
      await cl.query('insert into items (id, data) values ($1,$2) on conflict (id) do update set data = $2, version = items.version + 1, updated_at = now()', [x.id, x]); res.items++;
    }
    const custIds = new Set<string>();
    for (const cu of d.customers || []) {
      const x = cleanCustomer(cu); if (!x.id) continue;
      await cl.query('insert into customers (id, owner_id, name, data) values ($1,$2,$3,$4) on conflict (id) do update set name = $3, data = $4, version = customers.version + 1, updated_at = now()', [x.id, u.id, x.name, x]); custIds.add(x.id); res.customers++;
    }
    for (const qq of d.quotes) {
      const x: any = cleanQuote(qq); const id = sanitizeId(qq.id); if (!id) continue;
      if (x.custId && !custIds.has(x.custId) && !(await row('select 1 from customers where id = $1', [x.custId], cl))) x.custId = '';
      const r = await cl.query(
        `insert into quotes (id, no, owner_id, cust_id, status, rev, fam, data, decision) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (id) do nothing`,
        [id, x.no, u.id, x.custId || null, x.status, x.rev, x.fam || null, { ...x }, qq._decision && typeof qq._decision === 'object' ? qq._decision : null]);
      if (r.rowCount) res.quotes++; else res.quotesSkipped++;
    }
    for (const rc of d.receipts || []) {
      const id = sanitizeId(rc?.id), amount = Math.round(num(rc?.amount) * 100) / 100;
      if (!id || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(rc?.date || '')) || !rc.no) { res.receiptsSkipped++; continue; }
      const cu = await row('select 1 from customers where id = $1', [sanitizeId(rc.custId)], cl);
      if (!cu) { res.receiptsSkipped++; continue; }
      const qid = rc.qid && (await row('select 1 from quotes where id = $1', [sanitizeId(rc.qid)], cl)) ? sanitizeId(rc.qid) : null;
      const r = await cl.query(
        `insert into receipts (id, no, date, cust_id, quote_id, pay_id, amount, method, ref, notes, created_by, void, void_reason, void_at, void_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict do nothing`,
        [id, String(rc.no).slice(0, 40), rc.date, sanitizeId(rc.custId), qid, qid && rc.payId ? sanitizeId(rc.payId) : null, amount, METHODS.includes(rc.method) ? rc.method : METHODS[0], String(rc.ref || '').slice(0, 100), String(rc.notes || '').slice(0, 600), u.id, !!rc.void, rc.void ? String(rc.voidReason || 'مستورد').slice(0, 400) : null, rc.void ? new Date().toISOString() : null, rc.void ? u.id : null]);
      if (r.rowCount) res.receipts++; else res.receiptsSkipped++;
    }
    for (const iv of d.invoices || []) {
      const id = sanitizeId(iv?.id), total = Math.round(num(iv?.total) * 100) / 100;
      if (!id || !iv.no || !(total > 0) || !/^\d{4}-\d{2}-\d{2}/.test(String(iv.date || '')) || !iv.data || typeof iv.data !== 'object') continue;
      await cl.query(`insert into invoices (id, no, kind, date, cust_id, quote_id, pay_id, ref_id, data, subtotal, vat, total, issued_at, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,coalesce($13::timestamptz, now()),$14) on conflict do nothing`,
        [id, String(iv.no).slice(0, 40), iv.kind === 'credit' ? 'credit' : 'invoice', String(iv.date).slice(0, 10), iv.cust_id || null, iv.quote_id || null, iv.pay_id || null, iv.ref_id || null, iv.data, num(iv.subtotal), num(iv.vat), total, iv.issued_at || null, u.id]);
    }
    for (const ag of d.agreements || []) {
      const id = sanitizeId(ag?.id); if (!id || !ag.no || !ag.data) continue;
      await cl.query('insert into agreements (id, no, kind, status, owner_id, cust_id, quote_id, data) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing', [id, String(ag.no).slice(0, 40), String(ag.kind || 'custom').slice(0, 20), ['draft', 'sent', 'signed', 'void'].includes(ag.status) ? ag.status : 'draft', u.id, ag.cust_id || null, ag.quote_id || null, cleanAgreement(ag.data)]);
    }
    for (const pd of d.pdocs || []) {
      const id = sanitizeId(pd?.id); if (!id || !pd.no || !pd.data || !['vo', 'ipc', 'chq', 'rfq'].includes(pd.kind)) continue;
      await cl.query('insert into pdocs (id, kind, no, quote_id, cust_id, status, owner_id, data, amount) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing', [id, pd.kind, String(pd.no).slice(0, 40), pd.quote_id || null, pd.cust_id || null, String(pd.status || 'draft').slice(0, 20), u.id, pd.data, num(pd.amount)]);
      const m = /-(\d+)$/.exec(String(pd.no)); if (m) await cl.query('insert into doc_counters (kind, n) values ($1,$2) on conflict (kind) do update set n = greatest(doc_counters.n, $2)', [pd.kind, Number(m[1])]);
    }
    await audit({ id: u.id, username: u.username, ip: c.ip }, 'backup.import', 'backup', null, `استيراد بيانات: ${res.quotes} عرض، ${res.customers} عميل، ${res.receipts} سند`, res, cl);
  });
  return { ok: true, result: res };
}

/* ---------- reports ---------- */
export async function monthlyReport(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw bad('الشهر غير صالح');
  const from = `${month}-01`;
  const rc = await rows(
    `select r.*, c.name as cust_name, c.data->>'name' as cname, q.no as quote_no, q.owner_id, ou.full_name as sales_name
     from receipts r left join customers c on c.id = r.cust_id left join quotes q on q.id = r.quote_id left join users ou on ou.id = q.owner_id
     where r.date >= $1::date and r.date < ($1::date + interval '1 month') order by r.date, r.no`, [from]);
  const live = rc.filter((r: any) => !r.void), voided = rc.filter((r: any) => r.void);
  const group = (key: (r: any) => string) => { const m = new Map<string, { name: string; count: number; amount: number }>(); live.forEach((r: any) => { const k = key(r); const e = m.get(k) || { name: k, count: 0, amount: 0 }; e.count++; e.amount = R.r2(e.amount + r.amount); m.set(k, e); }); return [...m.values()].sort((a, b) => b.amount - a.amount); };
  const contracts = await rows(`select q.no, q.data, u.full_name from quotes q left join users u on u.id = q.owner_id where q.data->'contract' is not null and q.data->'contract'->>'date' >= $1 and q.data->'contract'->>'date' < to_char($1::date + interval '1 month', 'YYYY-MM-DD') and q.status <> 'lost'`, [from]);
  const conTotal = R.r2(contracts.reduce((a: number, q: any) => a + R.cTotal(q.data), 0));
  return {
    month, total: R.r2(live.reduce((a: number, r: any) => a + r.amount, 0)), count: live.length, voidedCount: voided.length, voidedTotal: R.r2(voided.reduce((a: number, r: any) => a + r.amount, 0)),
    byMethod: group(r => r.method), byCustomer: group(r => r.cust_name || '—'), bySales: group(r => r.sales_name || 'غير مرتبط بعقد'),
    contracts: { count: contracts.length, total: conTotal },
    list: live.map((r: any) => ({ no: r.no, date: r.date, customer: r.cust_name || '', method: r.method, amount: r.amount, quote: r.quote_no || '' })),
  };
}
export async function reportRoute(c: Ctx) {
  if (!c.user!.perms.reports) throw forbidden();
  return monthlyReport(c.query.get('month') || new Date().toISOString().slice(0, 7));
}

export function reportHtml(rep: any) {
  const t = (rows: any[]) => `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 14px"><tr style="background:#D9EAF7"><th style="text-align:right;padding:5px 8px">البيان</th><th style="padding:5px 8px">العدد</th><th style="text-align:left;padding:5px 8px">المبلغ</th></tr>${rows.map(r => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eef2f7">${r.name}</td><td style="text-align:center;border-bottom:1px solid #eef2f7">${r.count}</td><td style="text-align:left;border-bottom:1px solid #eef2f7">${R.fmt(r.amount)}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:8px;color:#7b89a1">لا توجد حركات</td></tr>'}</table>`;
  return mailShell(`التقرير الشهري للتحصيل - ${rep.month}`,
    `<p>إجمالي المقبوض: <b>${R.fmt(rep.total)}</b> ر.س (${rep.count} سند)${rep.voidedCount ? `، سندات ملغاة: ${rep.voidedCount} بمبلغ ${R.fmt(rep.voidedTotal)}` : ''}</p><p>عقود جديدة: <b>${rep.contracts.count}</b> بقيمة ${R.fmt(rep.contracts.total)} ر.س</p><h4>حسب طريقة الدفع</h4>${t(rep.byMethod)}<h4>حسب العميل</h4>${t(rep.byCustomer)}<h4>حسب مسؤول المبيعات</h4>${t(rep.bySales)}<p><a href="${appUrl()}">فتح النظام</a></p>`);
}
