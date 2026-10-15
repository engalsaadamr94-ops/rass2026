import { redirect } from 'next/navigation';
import { row } from '@/lib/db';
export const dynamic = 'force-dynamic';

export default async function Setup() {
  const n = await row('select count(*)::int as n from users').catch(() => null);
  if (!n) return <div className="auth-wrap"><div className="auth-card"><h1>قاعدة البيانات غير متصلة</h1><p className="muted">تأكد من DATABASE_URL وأن عملية البناء نفّذت الترحيلات.</p></div></div>;
  if (n.n > 0) redirect('/login');
  const hasKey = !!process.env.SETUP_KEY;
  return (
    <div className="auth-wrap">
      <form className="auth-card" data-form="setup">
        <img src="/logo.png" alt="رسس" className="auth-logo" />
        <h1>الإعداد الأول</h1>
        <p className="muted">إنشاء حساب المدير الأول وتهيئة النظام ببيانات الشركة والمكتبة الافتراضية.</p>
        {!hasKey && <div className="auth-err">لم يُضبط المتغير SETUP_KEY في إعدادات Vercel. أضفه ثم أعد النشر.</div>}
        <label className="fld"><span>مفتاح الإعداد (SETUP_KEY)</span><input name="key" type="password" className="ltr" required /></label>
        <label className="fld"><span>الاسم الكامل</span><input name="name" required /></label>
        <label className="fld"><span>اسم المستخدم (إنجليزي)</span><input name="username" className="ltr" autoComplete="username" required /></label>
        <label className="fld"><span>البريد الإلكتروني (لاستعادة كلمة المرور)</span><input name="email" type="email" className="ltr" /></label>
        <label className="fld"><span>كلمة المرور</span><input name="password" type="password" autoComplete="new-password" className="ltr" required /></label>
        <div className="auth-err" role="alert" hidden></div>
        <button className="btn pri wide" type="submit" disabled={!hasKey}>إنشاء المدير</button>
      </form>
      <script src="/auth.js" defer></script>
    </div>
  );
}
