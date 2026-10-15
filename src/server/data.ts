import crypto from 'node:crypto';
import { rows, row, tx, pool } from '@/lib/db';
import { audit } from '@/lib/audit';
import { randomToken } from '@/lib/auth';
import type { Perms } from '@/lib/perms';
import { bad, forbidden, notFound, Ctx, validId, num } from './http';
import { STD_ITEMS } from './stdlib';
import { CLAUSES } from './clauses';
import { stdItem } from './defaults';
import { cleanQuote, cleanCustomer, cleanItem, cleanSettings, sanitizeId } from './sanitize';
// shared with the browser: one source of truth for the money math
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require('@/shared/rass-doc.js');

export const METHODS = ['تحويل بنكي', 'نقدي', 'شيك', 'مدى / بطاقة', 'حوالة'];
const uid = () => crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12);
const actor = (c: Ctx) => ({ id: c.user!.id, username: c.user!.username, ip: c.ip });

/* ---------- serialisation ---------- */
const QSEL = `select q.*, u.full_name as owner_name, ab.full_name as approval_by_name from quotes q left join users u on u.id = q.owner_id left join users ab on ab.id = q.approval_by`;
const noCost = (d: any) => (d?.lines ? { ...d, lines: d.lines.map(({ cost: _c, ...l }: any) => l) } : d);
export function quoteOut(r: any, perms: Perms, ownerId: string) {
  const canWrite = perms.quotesWrite === 'all' || (perms.quotesWrite === 'own' && r.owner_id === ownerId);
  return {
    ...(perms.seeCost ? r.data : noCost(r.data)), id: r.id, no: r.no, status: r.status, custId: r.cust_id || '', rev: r.rev, fam: r.fam || undefined,
    _v: r.version, _owner: r.owner_id, _ownerName: r.owner_name || '', _updated: r.updated_at,
    _approval: { state: r.approval_state, pct: r.approval_pct, by: r.approval_by_name || '', at: r.approval_at, note: r.approval_note || '' },
    _decision: r.decision || null, _sentAt: r.sent_at || null,
    _views: { n: r.view_count || 0, first: r.first_view || null, last: r.last_view || null },
    _share: canWrite && r.share_token ? { token: r.share_token, expires: r.share_expires } : null,
  };
}
export const customerOut = (r: any) => ({ ...r.data, id: r.id, _v: r.version, _owner: r.owner_id });
export const itemOut = (r: any, seeCost = true) => { const { cost, ...d } = r.data; return { ...(seeCost ? r.data : d), id: r.id, _v: r.version }; };
export const receiptOut = (r: any) => ({
  id: r.id, no: r.no, date: r.date, custId: r.cust_id, qid: r.quote_id || '', payId: r.pay_id || '', amount: r.amount, method: r.method, ref: r.ref, notes: r.notes,
  void: r.void, voidReason: r.void_reason || '', voidAt: r.void_at, createdAt: r.created_at, createdBy: r.created_by_name || '',
});
export async function loadReceipts() {
  return (await rows(`select r.*, u.full_name as created_by_name from receipts r left join users u on u.id = r.created_by order by r.date desc, r.no desc`)).map(receiptOut);
}

export async function loadSettings() {
  const s = await row('select data, version from settings where id = 1');
  if (!s) return null;
  // the starter clause library is shown until an admin saves their own list
  const clauses = s.data.clauses || CLAUSES.map(k => ({ id: k[0], cat: k[1], title: k[2], text: k[3], kinds: k[4] }));
  return { ...s.data, clauses, _v: s.version };
}

export async function bootstrap(c: Ctx) {
  const u = c.user!, p = u.perms;
  const own = p.ownOnly;
  const [settings, items, customers, quotes, receipts, pending] = await Promise.all([
    loadSettings(),
    rows('select * from items order by seq'),
    own ? rows('select * from customers where owner_id = $1 order by created_at', [u.id]) : rows('select * from customers order by created_at'),
    own ? rows(`${QSEL} where q.owner_id = $1 order by q.created_at desc`, [u.id]) : rows(`${QSEL} order by q.created_at desc`),
    p.receipts ? loadReceipts() : Promise.resolve([]),
    p.approve ? row(`select count(*)::int as n from quotes where approval_state = 'pending'`) : Promise.resolve(null),
  ]);
  return {
    me: { id: u.id, username: u.username, name: u.full_name, email: u.email, role: u.role, perms: p },
    settings, items: items.map((r: any) => itemOut(r, p.seeCost)), customers: customers.map(customerOut),
    quotes: quotes.map((r: any) => quoteOut(r, p, u.id)), receipts, pendingApprovals: pending ? pending.n : 0,
  };
}

/* ---------- numbering ---------- */
const NUMBERING = { quote: ['nextSeq', 'prefix', 0, '26'], receipt: ['rcNext', 'rcPrefix', 3, 'RC-26'], invoice: ['invNext', 'invPrefix', 4, 'INV-26'], agreement: ['agNext', 'agPrefix', 3, 'AG-26'] } as const;
const PD_PREFIX = { vo: 'VO-26', ipc: 'IPC-26', chq: 'CHQ-26', rfq: 'RFQ-26' } as const;
export async function nextPdocNumber(c: any, kind: keyof typeof PD_PREFIX): Promise<string> {
  const r = await row('insert into doc_counters (kind, n) values ($1, 1) on conflict (kind) do update set n = doc_counters.n + 1 returning n', [kind], c);
  return `${PD_PREFIX[kind]}-${String(r.n).padStart(3, '0')}`;
}
export async function nextNumber(c: any, kind: keyof typeof NUMBERING): Promise<string> {
  const [seqKey, prefKey, pad, dp] = NUMBERING[kind];
  const r = await row(
    `update settings set data = jsonb_set(data, $1::text[], to_jsonb(coalesce((data->>$2)::int, 1) + 1))
     where id = 1 returning coalesce((data->>$2)::int, 2) - 1 as n, coalesce(nullif(data->>$3, ''), $4) as p`, [`{${seqKey}}`, seqKey, prefKey, dp], c);
  if (!r) throw bad('الإعدادات غير مهيأة');
  return `${r.p}-${pad ? String(r.n).padStart(pad, '0') : r.n}`;
}

/* ---------- discount approval ---------- */
function approvalFor(role: string, merged: any, prev: any, settings: any) {
  const c = R.calc(merged);
  const pct = c.pct, th = Number(settings?.discApprovalPct ?? 5);
  if (role === 'admin') return { state: pct > th + 1e-9 ? 'approved' : 'none', pct: pct > th + 1e-9 ? pct : null, byAdmin: true, calc: c };
  if (pct <= th + 1e-9) return { state: 'none', pct: null, calc: c };
  if (prev && prev.approval_state === 'approved' && prev.approval_pct != null && pct <= Number(prev.approval_pct) + 1e-6) return { state: 'approved', pct: prev.approval_pct, keep: true, calc: c };
  return { state: 'pending', pct, calc: c };
}

/* ---------- sync (autosave) ---------- */
export async function sync(c: Ctx) {
  const u = c.user!, p = u.perms, b = c.body || {};
  const out: any = { versions: { settings: null, items: {}, customers: {}, quotes: {} }, quotes: {}, rejected: [], warnings: [] };
  const rej = (kind: string, id: string, reason: string, current?: any) => out.rejected.push({ kind, id, reason, current });

  await tx(async cl => {
    const settings = (await row('select data from settings where id = 1', [], cl))?.data || {};

    /* settings */
    if (b.settings) {
      if (!p.settingsWrite) rej('settings', '1', 'ليس لديك صلاحية تعديل الإعدادات');
      else {
        const cur = await row('select version from settings where id = 1 for update', [], cl);
        if (cur && Number(b.settings._v) !== cur.version) rej('settings', '1', 'تم تعديل الإعدادات من مستخدم آخر', await loadSettings());
        else {
          const clean = cleanSettings(b.settings);
          const r = await row(
            `update settings set data = $1::jsonb || jsonb_build_object('nextSeq', data->'nextSeq', 'rcNext', data->'rcNext', 'invNext', data->'invNext', 'agNext', data->'agNext'), version = version + 1, updated_at = now() where id = 1 returning version`,
            [JSON.stringify(clean)], cl);
          out.versions.settings = r.version;
          await audit(actor(c), 'settings.update', 'settings', '1', 'تعديل إعدادات الشركة', null, cl, true);
        }
      }
    }

    /* items */
    for (const it of b.items?.put || []) {
      if (!p.itemsWrite) { rej('item', it?.id, 'ليس لديك صلاحية تعديل المكتبة'); continue; }
      const d = cleanItem(it); if (!validId(d.id)) { rej('item', String(it?.id), 'معرّف غير صالح'); continue; }
      const cur = await row('select version from items where id = $1 for update', [d.id], cl);
      if (!cur) {
        await cl.query('insert into items (id, data) values ($1, $2)', [d.id, d]);
        out.versions.items[d.id] = 1;
      } else if (Number(it._v) !== cur.version) {
        rej('item', d.id, 'تم تعديل الصنف من مستخدم آخر', itemOut(await row('select * from items where id = $1', [d.id], cl)));
      } else {
        const r = await row('update items set data = $2, version = version + 1, updated_at = now() where id = $1 returning version', [d.id, d], cl);
        out.versions.items[d.id] = r.version;
      }
    }
    for (const id of b.items?.del || []) {
      if (!p.itemsWrite) { rej('item', id, 'ليس لديك صلاحية حذف الأصناف'); continue; }
      await cl.query('delete from items where id = $1', [String(id)]);
    }
    if ((b.items?.put?.length || b.items?.del?.length) && p.itemsWrite) await audit(actor(c), 'items.update', 'items', null, `تعديل مكتبة الأصناف (${(b.items.put || []).length} تعديل، ${(b.items.del || []).length} حذف)`, null, cl, true);

    /* customers */
    for (const cu of b.customers?.put || []) {
      if (!p.customersWrite) { rej('customer', cu?.id, 'ليس لديك صلاحية تعديل العملاء'); continue; }
      const d = cleanCustomer(cu); if (!validId(d.id)) { rej('customer', String(cu?.id), 'معرّف غير صالح'); continue; }
      const cur = await row('select * from customers where id = $1 for update', [d.id], cl);
      if (!cur) {
        await cl.query('insert into customers (id, owner_id, name, data) values ($1,$2,$3,$4)', [d.id, u.id, d.name, d]);
        out.versions.customers[d.id] = 1;
        await audit(actor(c), 'customer.create', 'customer', d.id, `إضافة عميل: ${d.name}`, null, cl);
      } else if (p.ownOnly && cur.owner_id !== u.id) {
        rej('customer', d.id, 'هذا العميل غير مسجل باسمك');
      } else if (Number(cu._v) !== cur.version) {
        rej('customer', d.id, 'تم تعديل العميل من مستخدم آخر', customerOut(cur));
      } else {
        const r = await row('update customers set name = $2, data = $3, version = version + 1, updated_at = now() where id = $1 returning version', [d.id, d.name, d], cl);
        out.versions.customers[d.id] = r.version;
        await audit(actor(c), 'customer.update', 'customer', d.id, `تعديل عميل: ${d.name}`, null, cl, true);
      }
    }
    for (const id of b.customers?.del || []) {
      const cur = await row('select * from customers where id = $1', [String(id)], cl);
      if (!cur) continue;
      if (!p.customersWrite || (p.ownOnly && cur.owner_id !== u.id)) { rej('customer', id, 'ليس لديك صلاحية حذف هذا العميل', customerOut(cur)); continue; }
      const used = await row('select (select count(*) from quotes where cust_id = $1) + (select count(*) from receipts where cust_id = $1) as n', [String(id)], cl);
      if (used.n > 0) { rej('customer', id, 'لا يمكن حذف عميل له عروض أو سندات', customerOut(cur)); continue; }
      await cl.query('delete from customers where id = $1', [String(id)]);
      await audit(actor(c), 'customer.delete', 'customer', String(id), `حذف عميل: ${cur.name}`, null, cl);
    }

    /* quotes */
    for (const qq of b.quotes?.put || []) {
      const id = String(qq?.id || '');
      const cur = await row(`${QSEL} where q.id = $1 for update of q`, [id], cl);
      if (!cur) { rej('quote', id, 'العرض غير موجود'); continue; }
      const mode = quoteMode(p, u.id, cur);
      if (!mode) { rej('quote', id, 'ليس لديك صلاحية تعديل هذا العرض', quoteOut(cur, p, u.id)); continue; }
      if (Number(qq._v) !== cur.version) { rej('quote', id, 'تم تعديل العرض من مستخدم آخر', quoteOut(cur, p, u.id)); continue; }
      const incoming = cleanQuote(qq);
      let merged: any;
      if (mode === 'due') {
        merged = mergeDueOnly(cur.data, incoming);
        if (!merged) { rej('quote', id, 'يمكن للمحاسب تعديل تواريخ استحقاق الدفعات فقط', quoteOut(cur, p, u.id)); continue; }
      } else if (mode === 'contract') {
        merged = { ...cur.data, contract: incoming.contract };
      } else merged = { ...incoming };
      const warns: string[] = [];
      if (mode === 'full') await fillCosts(cl, merged, cur, p.seeCost);

      // sales discount hard cap
      const ap = approvalFor(u.role, merged, cur, settings);
      const cap = Number(settings.salesMaxDiscPct ?? 15);
      if (u.role === 'sales' && cap > 0 && ap.calc.pct > cap + 1e-9) {
        rej('quote', id, `الخصم يتجاوز الحد المسموح لك (${cap}%)`, quoteOut(cur, p, u.id)); continue;
      }
      // gating while a discount awaits approval
      if (ap.state === 'pending' && u.role !== 'admin' && mode !== 'due') {
        if (['sent', 'won'].includes(merged.status)) { merged.status = ['sent', 'won'].includes(cur.status) ? 'draft' : cur.status; warns.push('الخصم يحتاج اعتماد المدير قبل إرسال العرض أو اعتماده'); }
        if (merged.contract && !cur.data.contract) { merged.contract = null; warns.push('لا يمكن إنشاء عقد قبل اعتماد الخصم'); }
      }
      // minimum margin: only the admin may send / win a quote whose margin is below the configured floor
      const minM = Number(settings.minMarginPct ?? 0);
      if (minM > 0 && u.role !== 'admin' && mode !== 'due' && ['sent', 'won'].includes(merged.status)) {
        const mg = R.margin(merged);
        if (mg.pct != null && mg.pct < minM - 1e-9) { merged.status = ['sent', 'won'].includes(cur.status) ? 'draft' : cur.status; warns.push('هامش الربح أقل من الحد الأدنى المعتمد، راجع المدير قبل الإرسال'); }
      }
      // customers may only be linked when visible to the user
      if (merged.custId && p.ownOnly) {
        const cu = await row('select owner_id from customers where id = $1', [merged.custId], cl);
        if (!cu || cu.owner_id !== u.id) merged.custId = '';
      }
      const same = JSON.stringify(cur.data) === JSON.stringify(strip(merged)) && cur.no === merged.no && cur.status === merged.status;
      if (same && ap.state === cur.approval_state) { out.versions.quotes[id] = cur.version; out.quotes[id] = serverFields(cur); continue; }

      const newApprovalState = ap.state;
      const approvalPct = ap.state === 'none' ? null : ap.pct;
      const byAdmin = (ap as any).byAdmin;
      const r = await row(
        `update quotes set no=$2, cust_id=$3, status=$4, rev=$5, fam=$6, data=$7,
           approval_state=$8, approval_pct=$9,
           approval_by = case when $10::boolean and $8::text = 'approved' then $11::uuid when $8::text = 'none' then null else approval_by end,
           approval_at = case when $10::boolean and $8::text = 'approved' then now() when $8::text = 'none' then null else approval_at end,
           approval_note = case when $8::text = 'none' then null else approval_note end,
           sent_at = case when $4::text = 'sent' and status is distinct from 'sent' then now() else sent_at end,
           version = version + 1, updated_at = now() where id = $1 returning *`,
        [id, merged.no, merged.custId || null, merged.status, merged.rev, merged.fam || null, strip(merged), newApprovalState, approvalPct, !!byAdmin && cur.approval_state !== 'approved', u.id], cl);
      out.versions.quotes[id] = r.version;
      out.quotes[id] = { ...serverFields(r), status: r.status, contractDropped: warns.length ? true : undefined };
      out.warnings.push(...warns.map(w => ({ id, text: w })));
      if (newApprovalState === 'pending' && cur.approval_state !== 'pending') await audit(actor(c), 'quote.approval_requested', 'quote', id, `طلب اعتماد خصم ${R.r2(ap.calc.pct)}% على العرض ${merged.no}`, null, cl);
      if (cur.status !== r.status) await audit(actor(c), 'quote.status', 'quote', id, `تغيير حالة العرض ${merged.no}: ${cur.status} ← ${r.status}`, null, cl);
      if (!cur.data.contract && merged.contract) await audit(actor(c), 'contract.create', 'quote', id, `إنشاء عقد للعرض ${merged.no}`, null, cl);
      await audit(actor(c), 'quote.update', 'quote', id, `تعديل العرض ${merged.no}`, null, cl, true);
    }
    for (const id of b.quotes?.del || []) {
      const cur = await row('select * from quotes where id = $1', [String(id)], cl);
      if (!cur) continue;
      const canDel = p.quotesWrite === 'all' || (p.quotesWrite === 'own' && cur.owner_id === u.id && cur.status === 'draft' && !cur.data.contract);
      if (!canDel) { rej('quote', id, 'ليس لديك صلاحية حذف هذا العرض', quoteOut((await row(`${QSEL} where q.id=$1`, [String(id)], cl)), p, u.id)); continue; }
      const rc = await row('select count(*)::int as n from receipts where quote_id = $1', [String(id)], cl);
      if (rc.n > 0) { rej('quote', id, 'لا يمكن حذف عرض عليه سندات قبض', quoteOut((await row(`${QSEL} where q.id=$1`, [String(id)], cl)), p, u.id)); continue; }
      await cl.query('delete from quotes where id = $1', [String(id)]);
      await audit(actor(c), 'quote.delete', 'quote', String(id), `حذف العرض ${cur.no}`, { no: cur.no, client: cur.data.client }, cl);
    }
  });
  return out;
}

/** costs live on the server side for roles that may not see them: restore them from the previous version or the library */
async function fillCosts(cl: any, merged: any, cur: any, canSee: boolean) {
  const old = new Map<string, any>((cur?.data?.lines || []).map((l: any) => [l.id, l]));
  const libIds = [...new Set((merged.lines || []).map((l: any) => l.lib).filter(Boolean))] as string[];
  const lib = new Map<string, number>();
  if (libIds.length) for (const r of await rows(`select id, data->>'cost' as cost from items where id = any($1::text[])`, [libIds], cl)) if (Number(r.cost) > 0) lib.set(r.id, Number(r.cost));
  for (const l of merged.lines || []) {
    const o = old.get(l.id);
    if (canSee) { if (l.cost == null && !o && l.lib && lib.has(l.lib)) l.cost = lib.get(l.lib); continue; }
    delete l.cost;
    if (o && o.cost > 0) l.cost = o.cost; else if (l.lib && lib.has(l.lib)) l.cost = lib.get(l.lib);
  }
}
const strip = (m: any) => { const { ...d } = m; return d; };
const serverFields = (r: any) => ({
  status: r.status, no: r.no, _approval: { state: r.approval_state, pct: r.approval_pct, note: r.approval_note || '', at: r.approval_at }, _v: r.version,
});
function quoteMode(p: Perms, uid: string, cur: any): 'full' | 'contract' | 'due' | null {
  if (p.quotesWrite === 'all') return 'full';
  if (p.quotesWrite === 'due') return 'due';
  if (p.quotesWrite === 'own' && cur.owner_id === uid) return cur.status === 'won' ? 'contract' : 'full';
  return null;
}
/** accountant: everything must be identical except the due dates of existing payments */
function mergeDueOnly(old: any, inc: any) {
  const o = old.contract, n = inc.contract;
  if (!o || !n || o.payments.length !== n.payments.length) return null;
  const merged = JSON.parse(JSON.stringify(old));
  const dueOf = new Map<string, string>(n.payments.map((x: any) => [x.id, x.due]));
  for (const pay of merged.contract.payments) { if (!dueOf.has(pay.id)) return null; pay.due = dueOf.get(pay.id); }
  const a = JSON.stringify({ ...strip(inc), contract: { ...n, payments: n.payments.map((x: any) => ({ ...x, due: '' })) } });
  const b2 = JSON.stringify({ ...strip(old), contract: { ...o, payments: o.payments.map((x: any) => ({ ...x, due: '' })) } });
  // compare against old data normalised through the same sanitiser
  const norm = JSON.stringify({ ...strip(cleanQuote(old)), contract: { ...cleanQuote(old).contract, payments: cleanQuote(old).contract!.payments.map((x: any) => ({ ...x, due: '' })) } });
  void b2;
  return a === norm ? merged : null;
}

/* ---------- quote creation ---------- */
export async function createQuote(c: Ctx) {
  const u = c.user!, p = u.perms;
  if (!(p.quotesWrite === 'all' || p.quotesWrite === 'own')) throw forbidden();
  const mode: string = c.body?.numbering === 'keep' ? 'keep' : 'counter';
  const d: any = cleanQuote(c.body?.quote || {});
  const id = sanitizeId(c.body?.quote?.id) || uid();
  if (!validId(id)) throw bad('معرّف غير صالح');
  const settings = (await row('select data from settings where id = 1'))!.data;
  const res = await tx(async cl => {
    if (mode === 'counter' || !d.no) d.no = await nextNumber(cl, 'quote');
    if (c.body?.parentId) {
      const par = await row('select owner_id from quotes where id = $1', [String(c.body.parentId)], cl);
      if (!par || (p.ownOnly && par.owner_id !== u.id)) throw forbidden();
    }
    // a fresh quote can never carry approvals / contracts
    d.status = 'draft'; d.contract = d.contract && c.body?.keepContract ? d.contract : null;
    await fillCosts(cl, d, null, p.seeCost);
    const ap = approvalFor(u.role, d, null, settings);
    if (u.role === 'sales' && Number(settings.salesMaxDiscPct) > 0 && ap.calc.pct > Number(settings.salesMaxDiscPct) + 1e-9) throw bad(`الخصم يتجاوز الحد المسموح لك (${settings.salesMaxDiscPct}%)`);
    await cl.query(
      `insert into quotes (id, no, owner_id, cust_id, status, rev, fam, data, approval_state, approval_pct, approval_by, approval_at)
       values ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9::text,$10, case when $9::text = 'approved' then $3::uuid end, case when $9::text = 'approved' then now() end)`,
      [id, d.no, u.id, d.custId || null, d.status, d.rev, d.fam || null, d, ap.state, ap.state === 'none' ? null : ap.pct]);
    // revising: the previous revision becomes superseded (unless it was won)
    if (c.body?.supersede) {
      await cl.query(`update quotes set status = 'superseded', data = jsonb_set(data, '{status}', '"superseded"'), version = version + 1, updated_at = now() where id = $1 and status <> 'won' and ($2::boolean or owner_id = $3)`, [String(c.body.supersede), !p.ownOnly, u.id]);
    }
    await audit(actor(c), c.body?.parentId ? 'quote.revise' : 'quote.create', 'quote', id, `${c.body?.parentId ? 'إصدار جديد' : 'عرض جديد'}: ${d.no}`, null, cl);
    return (await row(`${QSEL} where q.id = $1`, [id], cl))!;
  });
  const settingsNow = await loadSettings();
  const sup = c.body?.supersede ? await row(`${QSEL} where q.id = $1`, [String(c.body.supersede)]) : null;
  return { quote: quoteOut(res, p, u.id), counters: { nextSeq: settingsNow?.nextSeq, rcNext: settingsNow?.rcNext }, superseded: sup ? quoteOut(sup, p, u.id) : null };
}

/* ---------- discount approval (admin) ---------- */
export async function approveDiscount(c: Ctx) {
  if (!c.user!.perms.approve) throw forbidden();
  const id = c.params.id, act = c.body?.action === 'reject' ? 'reject' : 'approve';
  const note = String(c.body?.note || '').slice(0, 400);
  const cur = await row(`${QSEL} where q.id = $1`, [id]);
  if (!cur) throw notFound();
  if (act === 'approve') {
    const pct = R.calc(cur.data).pct;
    await pool.query(`update quotes set approval_state='approved', approval_pct=$2, approval_by=$3, approval_at=now(), approval_note=$4, version=version+1, updated_at=now() where id=$1`, [id, pct, c.user!.id, note || null]);
    await audit(actor(c), 'quote.approval_granted', 'quote', id, `اعتماد خصم ${R.r2(pct)}% على العرض ${cur.no}`);
  } else {
    await pool.query(`update quotes set approval_state='rejected', approval_by=$2, approval_at=now(), approval_note=$3, version=version+1, updated_at=now() where id=$1`, [id, c.user!.id, note || 'يرجى تخفيض الخصم']);
    await audit(actor(c), 'quote.approval_rejected', 'quote', id, `إرجاع طلب خصم العرض ${cur.no}: ${note}`);
  }
  return { quote: quoteOut((await row(`${QSEL} where q.id = $1`, [id]))!, c.user!.perms, c.user!.id) };
}
export async function pendingApprovals(c: Ctx) {
  if (!c.user!.perms.approve) throw forbidden();
  const r = await rows(`${QSEL} where q.approval_state = 'pending' order by q.updated_at desc`);
  return { quotes: r.map((x: any) => quoteOut(x, c.user!.perms, c.user!.id)) };
}

/* ---------- customer approval link ---------- */
export async function createShare(c: Ctx) {
  const id = c.params.id, u = c.user!;
  const cur = await row(`${QSEL} where q.id = $1`, [id]);
  if (!cur) throw notFound();
  const mode = quoteMode(u.perms, u.id, cur);
  if (!mode || mode === 'due') throw forbidden();
  if (['pending', 'rejected'].includes(cur.approval_state)) throw bad('لا يمكن مشاركة العرض قبل اعتماد الخصم من المدير');
  {
    const st = (await row('select data from settings where id = 1'))!.data, mm = Number(st.minMarginPct ?? 0);
    if (mm > 0 && u.role !== 'admin') { const mg = R.margin(cur.data); if (mg.pct != null && mg.pct < mm - 1e-9) throw bad('هامش الربح أقل من الحد الأدنى المعتمد، راجع المدير قبل مشاركة العرض'); }
  }
  if (!cur.data.lines?.length) throw bad('أضف أصنافاً للعرض قبل مشاركته');
  const settings = (await row('select data from settings where id = 1'))!.data;
  const days = Number(settings.shareDays || 30);
  const token = randomToken(24);
  await pool.query(`update quotes set share_token = $2, share_expires = now() + make_interval(days => $3), decision = null, view_count = 0, first_view = null, last_view = null, sent_at = coalesce(sent_at, now()), version = version + 1, updated_at = now() where id = $1`, [id, token, days]);
  await audit(actor(c), 'quote.share', 'quote', id, `إنشاء رابط اعتماد للعميل للعرض ${cur.no}`);
  const r = (await row(`${QSEL} where q.id = $1`, [id]))!;
  return { quote: quoteOut(r, u.perms, u.id) };
}
export async function revokeShare(c: Ctx) {
  const id = c.params.id, u = c.user!;
  const cur = await row(`${QSEL} where q.id = $1`, [id]);
  if (!cur) throw notFound();
  const mode = quoteMode(u.perms, u.id, cur);
  if (!mode || mode === 'due') throw forbidden();
  await pool.query('update quotes set share_token = null, share_expires = null, version = version + 1, updated_at = now() where id = $1', [id]);
  await audit(actor(c), 'quote.unshare', 'quote', id, `إلغاء رابط الاعتماد للعرض ${cur.no}`);
  return { quote: quoteOut((await row(`${QSEL} where q.id = $1`, [id]))!, u.perms, u.id) };
}

/* ---------- receipts ---------- */
export async function createReceipt(c: Ctx) {
  const u = c.user!;
  if (!u.perms.receiptsWrite) throw forbidden();
  const b = c.body || {};
  const amount = Math.round(num(b.amount) * 100) / 100;
  if (!(amount > 0) || amount > 1e9) throw bad('أدخل مبلغاً صحيحاً');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) throw bad('التاريخ غير صالح');
  const method = METHODS.includes(b.method) ? b.method : METHODS[0];
  const cust = await row('select id from customers where id = $1', [String(b.custId || '')]);
  if (!cust) throw bad('اختر العميل');
  let qid: string | null = null, payId: string | null = null;
  if (b.qid) {
    const q = await row('select id, cust_id, data from quotes where id = $1', [String(b.qid)]);
    if (!q || !q.data.contract) throw bad('العقد غير موجود');
    if (q.cust_id !== cust.id) throw bad('العقد لا يخص هذا العميل');
    qid = q.id;
    if (b.payId) {
      if (!q.data.contract.payments.some((x: any) => x.id === b.payId)) throw bad('الدفعة غير موجودة في العقد');
      payId = String(b.payId);
    }
  }
  const id = uid();
  let created: any = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await tx(async cl => {
        const no = await nextNumber(cl, 'receipt');
        await cl.query(
          'insert into receipts (id, no, date, cust_id, quote_id, pay_id, amount, method, ref, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [id, no, b.date, cust.id, qid, payId, amount, method, String(b.ref || '').slice(0, 100), String(b.notes || '').slice(0, 600), u.id]);
        await audit(actor(c), 'receipt.create', 'receipt', id, `سند قبض ${no} بمبلغ ${R.fmt(amount)}`, { amount, qid, payId }, cl);
        return no;
      });
    } catch (e: any) { if (e.code !== '23505') throw e; }
  }
  if (!created) throw bad('تعذر توليد رقم السند، راجع الترقيم في الإعدادات');
  const r = await row('select r.*, u.full_name as created_by_name from receipts r left join users u on u.id = r.created_by where r.id = $1', [id]);
  const s = await loadSettings();
  return { receipt: receiptOut(r), counters: { nextSeq: s?.nextSeq, rcNext: s?.rcNext } };
}
export async function voidReceipt(c: Ctx) {
  const u = c.user!;
  if (!u.perms.voidReceipts) throw forbidden();
  const reason = String(c.body?.reason || '').trim().slice(0, 400);
  if (reason.length < 3) throw bad('اكتب سبب الإلغاء');
  const cur = await row('select * from receipts where id = $1', [c.params.id]);
  if (!cur) throw notFound();
  if (cur.void) throw bad('السند ملغى مسبقاً');
  await pool.query('update receipts set void = true, void_reason = $2, void_by = $3, void_at = now() where id = $1', [c.params.id, reason, u.id]);
  await audit(actor(c), 'receipt.void', 'receipt', c.params.id, `إلغاء السند ${cur.no} بمبلغ ${R.fmt(cur.amount)}: ${reason}`, { amount: cur.amount, reason });
  const r = await row('select r.*, u.full_name as created_by_name from receipts r left join users u on u.id = r.created_by where r.id = $1', [c.params.id]);
  return { receipt: receiptOut(r) };
}

/* ---------- counters (admin) ---------- */
export async function addStdItems(c: Ctx) {
  if (!c.user!.perms.itemsWrite) throw forbidden();
  const have = new Set((await rows(`select data->>'std' as k from items where data ? 'std'`)).map((r: any) => r.k));
  let n = 0;
  await tx(async cl => {
    for (const a of STD_ITEMS) {
      if (have.has(a[0])) continue;
      const it = stdItem(a);
      await cl.query('insert into items (id, data) values ($1, $2)', [it.id, it]);
      n++;
    }
    if (n) await audit(actor(c), 'items.update', 'items', null, `إضافة ${n} صنف من مكتبة الأصناف الشائعة (أسعار تقريبية)`, null, cl);
  });
  return { added: n, items: (await rows('select * from items order by seq')).map((r: any) => itemOut(r)) };
}

export async function setCounters(c: Ctx) {
  if (!c.user!.perms.settingsWrite) throw forbidden();
  const a = Math.max(1, Math.floor(num(c.body?.nextSeq, 1))), b = Math.max(1, Math.floor(num(c.body?.rcNext, 1)));
  const cur = await loadSettings(), iv = Math.max(1, Math.floor(num(c.body?.invNext, cur?.invNext ?? 1))), ag = Math.max(1, Math.floor(num(c.body?.agNext, cur?.agNext ?? 1)));
  await pool.query(`update settings set data = data || jsonb_build_object('nextSeq', $1::int, 'rcNext', $2::int, 'invNext', $3::int, 'agNext', $4::int) where id = 1`, [a, b, iv, ag]);
  await audit(actor(c), 'settings.counters', 'settings', '1', `تغيير الترقيم: عرض ${a}، سند ${b}، فاتورة ${iv}، اتفاقية ${ag}`);
  return { nextSeq: a, rcNext: b, invNext: iv, agNext: ag };
}

export async function requestApproval(c: Ctx) {
  const u = c.user!, id = c.params.id;
  const cur = await row(`${QSEL} where q.id = $1`, [id]);
  if (!cur) throw notFound();
  if (!quoteMode(u.perms, u.id, cur) || quoteMode(u.perms, u.id, cur) === 'due') throw forbidden();
  const settings = (await row('select data from settings where id = 1'))!.data;
  const pct = R.calc(cur.data).pct;
  if (pct <= Number(settings.discApprovalPct ?? 5) + 1e-9) throw bad('الخصم ضمن الحد ولا يحتاج اعتماداً');
  await pool.query(`update quotes set approval_state = 'pending', approval_pct = $2, version = version + 1, updated_at = now() where id = $1 and approval_state <> 'approved'`, [id, pct]);
  await audit(actor(c), 'quote.approval_requested', 'quote', id, `إعادة طلب اعتماد خصم ${R.r2(pct)}% على العرض ${cur.no}`);
  return { quote: quoteOut((await row(`${QSEL} where q.id = $1`, [id]))!, u.perms, u.id) };
}
