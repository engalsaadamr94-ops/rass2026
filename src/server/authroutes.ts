import { NextResponse } from 'next/server';
import { rows, row, tx, pool } from '@/lib/db';
import { audit } from '@/lib/audit';
import { allow } from '@/lib/ratelimit';
import { appUrl, mailShell, sendMail, mailConfigured } from '@/lib/mail';
import { permsFor, ROLES, Role } from '@/lib/perms';
import { clearSessionCookie, dummyVerify, hashPassword, passwordProblem, randomToken, setSessionCookie, sha256, signSession, tempPassword, verifyPassword } from '@/lib/auth';
import crypto from 'node:crypto';
import { bad, forbidden, HttpError, notFound, Ctx, str } from './http';
import { defaultItems, defaultSettings } from './defaults';

const MAX_FAILS = 5, LOCK_MIN = 15;

export async function login(c: Ctx) {
  const idf = str(c.body?.username, 120).trim().toLowerCase(), pw = str(c.body?.password, 200);
  if (!idf || !pw) throw bad('أدخل اسم المستخدم وكلمة المرور');
  if (!(await allow(`login:ip:${c.ip}`, 30, 600)) || !(await allow(`login:u:${idf}`, 15, 600))) throw new HttpError(429, 'محاولات كثيرة، حاول بعد قليل', 'rate');
  const u = await row('select * from users where lower(username) = $1 or lower(email) = $1', [idf]);
  const fail = async (why: string) => { await audit({ username: idf, ip: c.ip }, 'auth.login_failed', 'user', u?.id || null, `فشل تسجيل الدخول (${why})`); throw bad('اسم المستخدم أو كلمة المرور غير صحيحة', 'invalid'); };
  if (!u) { await dummyVerify(pw); return fail('مستخدم غير موجود'); }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    await dummyVerify(pw);
    throw new HttpError(429, 'الحساب مقفل مؤقتاً بسبب كثرة المحاولات، حاول بعد 15 دقيقة', 'locked');
  }
  const ok = await verifyPassword(pw, u.password_hash);
  if (!ok || !u.active) {
    if (!ok) {
      const n = u.failed_attempts + 1;
      if (n >= MAX_FAILS) await pool.query('update users set failed_attempts = 0, locked_until = now() + make_interval(mins => $2) where id = $1', [u.id, LOCK_MIN]);
      else await pool.query('update users set failed_attempts = $2 where id = $1', [u.id, n]);
    }
    return fail(ok ? 'حساب موقوف' : 'كلمة مرور خاطئة');
  }
  await pool.query('update users set failed_attempts = 0, locked_until = null, last_login = now() where id = $1', [u.id]);
  await audit({ id: u.id, username: u.username, ip: c.ip }, 'auth.login', 'user', u.id, 'تسجيل دخول');
  const res = NextResponse.json({ ok: true, must_change: u.must_change });
  setSessionCookie(res, await signSession(u.id, u.token_version));
  return res;
}

export async function logout(c: Ctx) {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  if (c.user) await audit({ id: c.user.id, username: c.user.username, ip: c.ip }, 'auth.logout', 'user', c.user.id, 'تسجيل خروج');
  return res;
}

export async function me(c: Ctx) {
  const u = c.user!;
  return { id: u.id, username: u.username, name: u.full_name, email: u.email, role: u.role, must_change: u.must_change, perms: u.perms };
}

export async function changePassword(c: Ctx) {
  const u = c.user!, cur = str(c.body?.current, 200), np = str(c.body?.password, 200);
  const r = await row('select password_hash, token_version from users where id = $1', [u.id]);
  if (!r || !(await verifyPassword(cur, r.password_hash))) throw bad('كلمة المرور الحالية غير صحيحة');
  const prob = passwordProblem(np); if (prob) throw bad(prob);
  if (np === cur) throw bad('اختر كلمة مرور مختلفة عن الحالية');
  const upd = await row('update users set password_hash = $2, must_change = false, token_version = token_version + 1 where id = $1 returning token_version', [u.id, await hashPassword(np)]);
  await audit({ id: u.id, username: u.username, ip: c.ip }, 'auth.password_change', 'user', u.id, 'تغيير كلمة المرور');
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, await signSession(u.id, upd!.token_version));
  return res;
}

/* ----- forgot / reset ----- */
export async function forgot(c: Ctx) {
  const idf = str(c.body?.identifier, 200).trim().toLowerCase();
  const generic = { ok: true, message: 'إن كان الحساب مسجلاً وله بريد إلكتروني فسيصله رابط إعادة التعيين خلال دقائق.' };
  if (!idf) throw bad('أدخل اسم المستخدم أو البريد الإلكتروني');
  if (!(await allow(`forgot:ip:${c.ip}`, 10, 3600))) return generic;
  const u = await row('select id, username, email, full_name, active from users where lower(username) = $1 or lower(email) = $1', [idf]);
  if (!u || !u.active || !u.email) return generic;
  if (!(await allow(`forgot:u:${u.id}`, 3, 3600))) return generic;
  const token = randomToken(32);
  await tx(async cl => {
    await cl.query('update password_resets set used_at = now() where user_id = $1 and used_at is null', [u.id]);
    await cl.query(`insert into password_resets (user_id, token_hash, expires_at, ip) values ($1,$2, now() + interval '60 minutes', $3)`, [u.id, sha256(token), c.ip]);
  });
  const link = `${appUrl() || new URL(c.req.url).origin}/reset?token=${token}`;
  const r = await sendMail(u.email, 'إعادة تعيين كلمة المرور - رسس',
    mailShell('إعادة تعيين كلمة المرور', `<p>مرحباً ${u.full_name}،</p><p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط الزر التالي لاختيار كلمة مرور جديدة. الرابط صالح لمدة 60 دقيقة ويُستخدم مرة واحدة.</p><p><a href="${link}" style="display:inline-block;background:#17365D;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none">إعادة تعيين كلمة المرور</a></p><p style="color:#7b89a1;font-size:12px">إن لم تطلب ذلك فتجاهل هذه الرسالة، ولن يتغير شيء في حسابك.</p>`),
    `رابط إعادة تعيين كلمة المرور (صالح 60 دقيقة): ${link}`);
  await audit({ id: u.id, username: u.username, ip: c.ip }, 'auth.forgot', 'user', u.id, r.ok ? 'طلب إعادة تعيين كلمة المرور (أُرسل البريد)' : `طلب إعادة تعيين كلمة المرور (تعذر إرسال البريد: ${r.error})`);
  return generic;
}

export async function reset(c: Ctx) {
  const token = str(c.body?.token, 200), pw = str(c.body?.password, 200);
  const prob = passwordProblem(pw); if (prob) throw bad(prob);
  if (!(await allow(`reset:ip:${c.ip}`, 20, 3600))) throw bad('محاولات كثيرة، حاول لاحقاً');
  const r = await row('select id, user_id from password_resets where token_hash = $1 and used_at is null and expires_at > now()', [sha256(token)]);
  if (!r) throw bad('الرابط غير صالح أو منتهي، اطلب رابطاً جديداً', 'bad_token');
  await tx(async cl => {
    await cl.query('update password_resets set used_at = now() where id = $1', [r.id]);
    await cl.query('update users set password_hash = $2, must_change = false, token_version = token_version + 1, failed_attempts = 0, locked_until = null where id = $1', [r.user_id, await hashPassword(pw)]);
  });
  const u = await row('select username from users where id = $1', [r.user_id]);
  await audit({ id: r.user_id, username: u?.username, ip: c.ip }, 'auth.reset', 'user', r.user_id, 'تعيين كلمة مرور جديدة عبر رابط البريد');
  return { ok: true };
}

export async function resetTokenCheck(c: Ctx) {
  const r = await row('select 1 from password_resets where token_hash = $1 and used_at is null and expires_at > now()', [sha256(str(c.query.get('token'), 200))]);
  return { valid: !!r };
}

/* ----- first-run setup ----- */
export async function setupStatus() {
  const n = await row('select count(*)::int as n from users');
  return { needsSetup: n!.n === 0, hasKey: !!process.env.SETUP_KEY };
}
export async function setup(c: Ctx) {
  const key = process.env.SETUP_KEY || '';
  if (!key) throw forbidden('لم يُضبط SETUP_KEY في متغيرات البيئة', 'no_key');
  if (!(await allow(`setup:ip:${c.ip}`, 10, 3600))) throw bad('محاولات كثيرة');
  const b = c.body || {};
  const a = Buffer.from(str(b.key, 200)), k = Buffer.from(key);
  if (a.length !== k.length || !crypto.timingSafeEqual(a, k)) throw forbidden('مفتاح الإعداد غير صحيح', 'bad_key');
  const username = str(b.username, 60).trim(), name = str(b.name, 120).trim(), email = str(b.email, 200).trim();
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) throw bad('اسم المستخدم: 3 إلى 40 حرفاً إنجليزياً أو أرقاماً');
  if (name.length < 2) throw bad('اكتب الاسم الكامل');
  const prob = passwordProblem(str(b.password, 200)); if (prob) throw bad(prob);
  const id = await tx(async cl => {
    await cl.query('lock table users in exclusive mode');
    const n = await row('select count(*)::int as n from users', [], cl);
    if (n!.n > 0) throw forbidden('تم الإعداد مسبقاً', 'done');
    const u = await row('insert into users (username, email, full_name, role, password_hash) values ($1,$2,$3,$4,$5) returning id', [username, email || null, name, 'admin', await hashPassword(str(b.password, 200))], cl);
    await cl.query('insert into settings (id, data) values (1, $1) on conflict (id) do nothing', [defaultSettings()]);
    const has = await row('select count(*)::int as n from items', [], cl);
    if (!has!.n) for (const it of defaultItems()) await cl.query('insert into items (id, data) values ($1,$2)', [it.id, it]);
    return u!.id;
  });
  await audit({ id, username, ip: c.ip }, 'setup', 'user', id, 'إنشاء أول مدير وتهيئة النظام');
  return { ok: true };
}

/* ----- users admin ----- */
const USEL = 'select id, username, email, full_name, role, active, must_change, last_login, locked_until, created_at from users';
const userOut = (u: any) => ({ ...u, locked: !!(u.locked_until && new Date(u.locked_until) > new Date()) });
export async function listUsers() { return { users: (await rows(`${USEL} order by created_at`)).map(userOut), mail: mailConfigured() }; }

async function activeAdmins(excludeId?: string) {
  return (await row(`select count(*)::int as n from users where role = 'admin' and active ${excludeId ? 'and id <> $1' : ''}`, excludeId ? [excludeId] : []))!.n;
}
export async function createUser(c: Ctx) {
  const b = c.body || {}, username = str(b.username, 60).trim(), name = str(b.name, 120).trim(), email = str(b.email, 200).trim().toLowerCase();
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) throw bad('اسم المستخدم: 3 إلى 40 حرفاً إنجليزياً أو أرقاماً');
  if (name.length < 2) throw bad('اكتب الاسم الكامل');
  if (!ROLES.includes(b.role)) throw bad('الدور غير صالح');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('البريد الإلكتروني غير صالح');
  const pw = tempPassword();
  try {
    const u = await row('insert into users (username, email, full_name, role, password_hash, must_change) values ($1,$2,$3,$4,$5,true) returning id', [username, email || null, name, b.role, await hashPassword(pw)]);
    await audit({ id: c.user!.id, username: c.user!.username, ip: c.ip }, 'user.create', 'user', u!.id, `إنشاء مستخدم ${username} بدور ${b.role}`);
    return { user: userOut((await row(`${USEL} where id = $1`, [u!.id]))!), tempPassword: pw };
  } catch (e: any) { if (e.code === '23505') throw bad('اسم المستخدم أو البريد مستخدم مسبقاً'); throw e; }
}
export async function updateUser(c: Ctx) {
  const id = c.params.id, b = c.body || {};
  const cur = await row('select * from users where id = $1', [id]); if (!cur) throw notFound();
  const name = b.name != null ? str(b.name, 120).trim() : cur.full_name;
  const email = b.email != null ? str(b.email, 200).trim().toLowerCase() : cur.email;
  const role: Role = b.role != null ? b.role : cur.role, active = b.active != null ? !!b.active : cur.active;
  if (!ROLES.includes(role)) throw bad('الدور غير صالح');
  if (name.length < 2) throw bad('اكتب الاسم الكامل');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('البريد الإلكتروني غير صالح');
  if (cur.role === 'admin' && cur.active && (role !== 'admin' || !active) && (await activeAdmins(id)) < 1) throw bad('لا يمكن إيقاف أو تخفيض آخر مدير في النظام');
  if (id === c.user!.id && (!active || role !== cur.role)) throw bad('لا يمكنك تغيير دورك أو إيقاف حسابك بنفسك');
  try {
    const bump = role !== cur.role || active !== cur.active;
    await pool.query(`update users set full_name=$2, email=$3, role=$4, active=$5, token_version = token_version + $6 where id = $1`, [id, name, email || null, role, active, bump ? 1 : 0]);
  } catch (e: any) { if (e.code === '23505') throw bad('البريد مستخدم مسبقاً'); throw e; }
  await audit({ id: c.user!.id, username: c.user!.username, ip: c.ip }, 'user.update', 'user', id, `تعديل المستخدم ${cur.username}${role !== cur.role ? ` (الدور: ${cur.role} ← ${role})` : ''}${active !== cur.active ? (active ? ' (تفعيل)' : ' (إيقاف)') : ''}`);
  return { user: userOut((await row(`${USEL} where id = $1`, [id]))!) };
}
export async function adminReset(c: Ctx) {
  const id = c.params.id, cur = await row('select username from users where id = $1', [id]); if (!cur) throw notFound();
  const pw = tempPassword();
  await pool.query('update users set password_hash = $2, must_change = true, token_version = token_version + 1, failed_attempts = 0, locked_until = null where id = $1', [id, await hashPassword(pw)]);
  await audit({ id: c.user!.id, username: c.user!.username, ip: c.ip }, 'user.reset_password', 'user', id, `إعادة تعيين كلمة مرور ${cur.username} (مؤقتة)`);
  return { tempPassword: pw };
}
export async function unlockUser(c: Ctx) {
  await pool.query('update users set failed_attempts = 0, locked_until = null where id = $1', [c.params.id]);
  await audit({ id: c.user!.id, username: c.user!.username, ip: c.ip }, 'user.unlock', 'user', c.params.id, 'فك قفل حساب');
  return { ok: true };
}
export { permsFor };
