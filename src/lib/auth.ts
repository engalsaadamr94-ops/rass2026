import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { row } from './db';
import { permsFor, Role, Perms } from './perms';

export const COOKIE = 'rass_session';
const MAX_AGE = 12 * 60 * 60;

export interface SessionUser {
  id: string; username: string; email: string | null; full_name: string; role: Role;
  must_change: boolean; perms: Perms;
}

function secret() {
  const s = process.env.AUTH_SECRET || '';
  if (s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters)');
  return new TextEncoder().encode(s);
}

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
// compare against a dummy hash so a missing user costs the same time as a wrong password
const DUMMY = bcrypt.hashSync('dummy-password-for-timing', 12);
export const dummyVerify = (p: string) => bcrypt.compare(p, DUMMY);

export function passwordProblem(p: string): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف';
  if (p.length > 100) return 'كلمة المرور طويلة جداً';
  if (!/[A-Za-z؀-ۿ]/.test(p) || !/\d/.test(p)) return 'كلمة المرور يجب أن تحتوي على حرف ورقم';
  return null;
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export function tempPassword() {
  const A = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', N = '23456789';
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const out = [pick(N), pick(N), pick(A.toUpperCase().slice(0, 20))];
  while (out.length < 11) out.push(pick(A + N));
  return out.sort(() => crypto.randomInt(3) - 1).join('');
}

export async function signSession(userId: string, tv: number) {
  return new SignJWT({ tv }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE });
}
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function userFromToken(token?: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    const u = await row('select id, username, email, full_name, role, active, must_change, token_version from users where id = $1', [payload.sub]);
    if (!u || !u.active || u.token_version !== payload.tv) return null;
    return { id: u.id, username: u.username, email: u.email, full_name: u.full_name, role: u.role, must_change: u.must_change, perms: permsFor(u.role) };
  } catch {
    return null;
  }
}
export const getSession = (req: NextRequest) => userFromToken(req.cookies.get(COOKIE)?.value);

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || '';
}
