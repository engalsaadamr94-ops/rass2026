import { row, rows, pool } from '@/lib/db';
import crypto from 'node:crypto';
import { audit } from '@/lib/audit';
import { allow } from '@/lib/ratelimit';
import { appUrl, mailShell, sendMail } from '@/lib/mail';
import { bad, notFound, Ctx, str, HttpError } from './http';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require('@/shared/rass-doc.js');

const PUB_SETTINGS = ['portalOn', 'nameAr', 'nameEn', 'brandEn', 'cr', 'vat', 'phone1', 'phone2', 'email', 'web', 'bankName', 'iban', 'thanks', 'logo', 'stamp'];

async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  return row(`select q.*, u.full_name as owner_name, u.email as owner_email from quotes q left join users u on u.id = q.owner_id where q.share_token = $1`, [token]);
}

export async function publicGet(c: Ctx) {
  if (!(await allow(`pq:ip:${c.ip}`, 120, 600))) throw new HttpError(429, 'محاولات كثيرة', 'rate');
  const q = await load(c.params.token);
  if (!q) throw notFound('الرابط غير صالح');
  const s = (await row('select data from settings where id = 1'))!.data;
  const settings: any = {}; PUB_SETTINGS.forEach(k => settings[k] = s[k] ?? '');
  // only the template this quote uses (and the uploaded fonts that template needs) goes to the customer's browser
  const tid = q.data?.tpl || s.tplDef?.quote || ''; const tpl = (s.templates || []).find((t: any) => t.id === tid);
  settings.templates = tpl ? [tpl] : []; settings.tplDef = { quote: tpl ? tpl.id : '' };
  const fk = tpl ? [tpl.font?.body, tpl.font?.head].map((x: any) => /^c:(.+)$/.exec(x || '')?.[1]).filter(Boolean) : [];
  settings.fonts = (s.fonts || []).filter((f: any) => fk.includes(f.id));
  const expired = q.share_expires && new Date(q.share_expires) < new Date();
  const ua = String(c.req.headers.get('user-agent') || '');
  if (!expired && q.status !== 'superseded' && !/bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|curl|wget|headless/i.test(ua)) {
    const first = !q.first_view;
    await pool.query('update quotes set view_count = view_count + 1, first_view = coalesce(first_view, now()), last_view = now() where id = $1', [q.id]);
    if (first && q.owner_email) await sendMail(q.owner_email, `فتح العميل العرض ${q.no}`, mailShell('تم فتح العرض', `<p>فتح العميل رابط عرض السعر <b>${q.no}</b> لأول مرة. يُنصح بالتواصل معه لمتابعة القرار.</p>`)).catch(() => undefined);
  }
  const quote = { ...q.data, lines: (q.data.lines || []).map(({ cost: _c, ...l }: any) => l), id: q.id, no: q.no, status: q.status, contract: null, _decision: q.decision || null };
  let portal: any = null;
  if (s.portalOn && q.data?.contract && q.status === 'won') {
    const base = R.cTotal(q.data), pays = R.payRows(q.data.contract, base);
    const rc = await rows('select no, date, amount, method, pay_id from receipts where quote_id = $1 and not void order by date, created_at', [q.id]);
    const vos = await rows(`select no, amount, data from pdocs where kind = 'vo' and quote_id = $1 and status = 'approved' order by created_at`, [q.id]);
    const ipcs = await rows(`select no, amount, status, data from pdocs where kind = 'ipc' and quote_id = $1 and status in ('approved','paid') order by (data->>'seq')::int`, [q.id]);
    const voSum = Math.round(vos.reduce((a: number, v: any) => a + Number(v.amount), 0) * 100) / 100, paid = Math.round(rc.reduce((a: number, r: any) => a + Number(r.amount), 0) * 100) / 100;
    portal = {
      base, current: Math.round((base + voSum) * 100) / 100, paid, remaining: Math.max(0, Math.round((base + voSum - paid) * 100) / 100),
      payments: pays.map((p: any) => ({ label: p.label, pct: p.pct, amt: p.amt, due: p.due || '', paid: Math.round(rc.filter((r: any) => r.pay_id === p.id).reduce((a: number, r: any) => a + Number(r.amount), 0) * 100) / 100 })),
      receipts: rc.map((r: any) => ({ no: r.no, date: String(r.date).slice(0, 10), amount: Number(r.amount), method: r.method })),
      variations: vos.map((v: any) => ({ no: v.no, title: v.data.title, amount: Number(v.amount) })),
      certificates: ipcs.map((i: any) => ({ no: i.no, seq: i.data.seq, date: i.data.date, payable: Number(i.amount), status: i.status })),
    };
  }
  return { settings, quote, portal, v: q.version, expired: !!expired, superseded: q.status === 'superseded' };
}

export async function publicDecide(c: Ctx) {
  if (!(await allow(`pqd:ip:${c.ip}`, 20, 3600))) throw new HttpError(429, 'محاولات كثيرة', 'rate');
  const q = await load(c.params.token);
  if (!q) throw notFound('الرابط غير صالح');
  if (q.share_expires && new Date(q.share_expires) < new Date()) throw bad('انتهت صلاحية رابط الاعتماد، تواصل مع الشركة', 'expired');
  if (q.status === 'superseded') throw bad('تم استبدال هذا العرض بإصدار أحدث، تواصل مع الشركة', 'superseded');
  if (q.decision) throw bad('تم تسجيل قرارك على هذا العرض مسبقاً', 'decided');
  if (Number(c.body?.v) !== q.version) throw bad('تم تحديث العرض، أعد تحميل الصفحة ثم راجع القيمة', 'stale');
  const action = c.body?.action === 'reject' ? 'reject' : 'approve';
  const name = str(c.body?.name, 120).trim();
  if (name.length < 3) throw bad('اكتب اسمك الكامل');
  let signature = String(c.body?.signature || '');
  if (action === 'approve') {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 200_000) throw bad('وقّع في المربع المخصص للتوقيع');
  } else signature = '';
  const total = R.calc(q.data).total;
  const docHash = crypto.createHash('sha256').update(JSON.stringify({ n: q.no, v: q.version, t: total, lines: (q.data.lines || []).map((l: any) => [l.desc, l.qty, l.price, l.unit]), disc: [q.data.discMode, q.data.discPct, q.data.discAmt], vat: q.data.vatRate })).digest('hex');
  const decision = { action, docHash, name, note: str(c.body?.note, 500), signature, at: new Date().toISOString(), ip: c.ip, ua: str(c.req.headers.get('user-agent'), 200), total, quoteVersion: q.version };
  const newStatus = action === 'approve' ? 'won' : 'lost';
  await pool.query(`update quotes set decision = $2, status = $3, data = jsonb_set(data, '{status}', to_jsonb($3::text)), version = version + 1, updated_at = now() where id = $1`, [q.id, decision, newStatus]);
  await audit({ username: `عميل: ${name}`, ip: c.ip }, action === 'approve' ? 'quote.customer_approved' : 'quote.customer_rejected', 'quote', q.id, `${action === 'approve' ? 'اعتمد' : 'رفض'} العميل ${name} العرض ${q.no} إلكترونياً`, { total });
  if (q.owner_email) {
    await sendMail(q.owner_email, `${action === 'approve' ? 'اعتماد' : 'رفض'} العميل للعرض ${q.no}`,
      mailShell('قرار العميل', `<p>${action === 'approve' ? 'اعتمد' : 'رفض'} العميل <b>${decision.name}</b> عرض السعر <b>${q.no}</b> بقيمة ${R.fmt(total)} ر.س.</p>${decision.note ? `<p>ملاحظة العميل: ${decision.note.replace(/</g, '&lt;')}</p>` : ''}<p><a href="${appUrl()}">فتح النظام</a></p>`)).catch(() => {});
  }
  return { ok: true, status: newStatus };
}
