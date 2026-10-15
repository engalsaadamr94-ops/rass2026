import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { COOKIE, userFromToken } from '@/lib/auth';
export const dynamic = 'force-dynamic';

export default async function ChangePassword() {
  const u = await userFromToken((await cookies()).get(COOKIE)?.value);
  if (!u) redirect('/login');
  return (
    <div className="auth-wrap">
      <form className="auth-card" data-form="change">
        <img src="/logo.png" alt="رسس" className="auth-logo" />
        <h1>تغيير كلمة المرور</h1>
        <p className="muted">{u.must_change ? 'كلمة المرور الحالية مؤقتة، اختر كلمة مرور خاصة بك للمتابعة.' : 'أدخل كلمة المرور الحالية ثم الجديدة.'}</p>
        <label className="fld"><span>كلمة المرور الحالية</span><input name="current" type="password" autoComplete="current-password" className="ltr" required autoFocus /></label>
        <label className="fld"><span>كلمة المرور الجديدة</span><input name="password" type="password" autoComplete="new-password" className="ltr" required /></label>
        <label className="fld"><span>تأكيد كلمة المرور الجديدة</span><input name="password2" type="password" autoComplete="new-password" className="ltr" required /></label>
        <div className="auth-err" role="alert" hidden></div>
        <button className="btn pri wide" type="submit">حفظ</button>
        <a className="auth-link" href={u.must_change ? '#' : '/'} data-logout={u.must_change ? '1' : undefined}>{u.must_change ? 'تسجيل الخروج' : 'رجوع'}</a>
      </form>
      <script src="/auth.js" defer></script>
    </div>
  );
}
