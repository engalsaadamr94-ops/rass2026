import nodemailer from 'nodemailer';
import fs from 'node:fs';

export interface MailResult { ok: boolean; error?: string }

export function mailConfigured() {
  return !!(process.env.MAIL_OUTBOX || process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER));
}

export async function sendMail(to: string, subject: string, html: string, text?: string): Promise<MailResult> {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@localhost';
  try {
    // test/dev only: write messages to a file instead of sending
    if (process.env.MAIL_OUTBOX) { fs.appendFileSync(process.env.MAIL_OUTBOX, JSON.stringify({ to, subject, html, text }) + '\n'); return { ok: true }; }
    if (process.env.RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      });
      if (!r.ok) return { ok: false, error: `resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
      return { ok: true };
    }
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      const port = Number(process.env.SMTP_PORT || 465);
      const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      await t.sendMail({ from, to, subject, html, text });
      return { ok: true };
    }
    return { ok: false, error: 'mail is not configured' };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
}

export const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');

export function mailShell(title: string, bodyHtml: string) {
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f3f6fa;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #d9e1ec;border-radius:10px;overflow:hidden"><div style="background:#17365D;color:#fff;padding:14px 20px;font-weight:700">${title}</div><div style="padding:20px;color:#12203a;line-height:1.9;font-size:14px">${bodyHtml}</div><div style="padding:10px 20px;color:#7b89a1;font-size:12px;border-top:1px solid #eef2f7">شركة رسس للمقاولات العامة</div></div></div>`;
}
