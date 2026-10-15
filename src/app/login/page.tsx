import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { COOKIE, userFromToken } from '@/lib/auth';
import { row } from '@/lib/db';
export const dynamic = 'force-dynamic';

export default async function Login() {
  const n = await row('select count(*)::int as n from users').catch(() => null);
  if (n && n.n === 0) redirect('/setup');
  if (await userFromToken((await cookies()).get(COOKIE)?.value)) redirect('/');
  return (
    <div className="auth-wrap">
      <form className="auth-card" data-form="login" autoComplete="on">
        <img src="/logo.png" alt="رسس" className="auth-logo" />
        <h1>تسجيل الدخول</h1>
        <p className="muted">نظام عروض الأسعار والعقود والتحصيل</p>
        <label className="fld"><span>اسم المستخدم أو البريد الإلكتروني</span><input name="username" autoComplete="username" className="ltr" required autoFocus /></label>
        <label className="fld"><span>كلمة المرور</span><input name="password" type="password" autoComplete="current-password" className="ltr" required /></label>
        <div className="auth-err" role="alert" hidden></div>
        <button className="btn pri wide" type="submit">دخول</button>
        <a className="auth-link" href="/forgot">نسيت كلمة المرور؟</a>
      </form>
      <script src="/auth.js" defer></script>
    </div>
  );
}
