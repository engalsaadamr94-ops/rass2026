import crypto from 'node:crypto';
import { rows } from '@/lib/db';
import { audit } from '@/lib/audit';
import { sendMail } from '@/lib/mail';
import { Ctx, forbidden } from './http';
import { createBackup, monthlyReport, reportHtml } from './admin';

function guard(c: Ctx) {
  const secret = process.env.CRON_SECRET || '';
  const got = (c.req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw forbidden('غير مصرح', 'cron');
}
export async function cronBackup(c: Ctx) {
  guard(c);
  const b = await createBackup('auto');
  await audit({ username: 'system' }, 'backup.auto', 'backup', String(b.id), `نسخة احتياطية تلقائية (${b.counts.quotes} عرض، ${b.counts.receipts} سند)`);
  return { ok: true, backup: b };
}
export async function cronMonthly(c: Ctx) {
  guard(c);
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  const month = d.toISOString().slice(0, 7);
  const rep = await monthlyReport(month);
  const admins = await rows(`select email from users where role = 'admin' and active and email is not null and email <> ''`);
  let sent = 0;
  for (const a of admins) { if ((await sendMail(a.email, `التقرير الشهري للتحصيل ${month}`, reportHtml(rep))).ok) sent++; }
  await audit({ username: 'system' }, 'report.monthly', 'report', month, `التقرير الشهري ${month}: أُرسل إلى ${sent} من ${admins.length}`);
  return { ok: true, month, sent };
}
