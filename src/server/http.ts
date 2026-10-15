import { NextRequest, NextResponse } from 'next/server';
import { SessionUser } from '@/lib/auth';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public extra?: any) { super(message); }
}
export const bad = (m: string, code?: string, extra?: any) => new HttpError(400, m, code, extra);
export const forbidden = (m = 'غير مصرح لك بهذا الإجراء', code = 'forbidden') => new HttpError(403, m, code);
export const notFound = (m = 'غير موجود') => new HttpError(404, m, 'not_found');

export interface Ctx {
  req: NextRequest;
  user: SessionUser | null;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string;
  body: any;
}
export type Handler = (c: Ctx) => Promise<any | NextResponse>;

export const json = (data: any, status = 200) => NextResponse.json(data, { status });

export async function readBody(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') {
    try { const t = await req.text(); return t ? JSON.parse(t) : {}; } catch { return {}; }
  }
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 8_000_000) throw new HttpError(413, 'الحجم كبير جداً');
  try { return await req.json(); } catch { return {}; }
}

/** CSRF guard for state-changing requests: custom header + same-origin check. */
export function csrfCheck(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (req.headers.get('x-requested-with') !== 'rass') throw forbidden('طلب غير صالح', 'csrf');
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    try { if (new URL(origin).host !== host) throw 0; } catch { throw forbidden('طلب غير صالح', 'csrf'); }
  }
}

export const str = (v: any, max = 500) => String(v ?? '').slice(0, max);
export const num = (v: any, def = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : def; };
export const validId = (v: any) => typeof v === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(v);
