export default function Forgot() {
  return (
    <div className="auth-wrap">
      <form className="auth-card" data-form="forgot">
        <img src="/logo.png" alt="رسس" className="auth-logo" />
        <h1>استعادة كلمة المرور</h1>
        <p className="muted">اكتب اسم المستخدم أو بريدك الإلكتروني، وسيصلك رابط لتعيين كلمة مرور جديدة إن كان للحساب بريد مسجل. إن لم يكن لحسابك بريد، اطلب من المدير تعيين كلمة مرور مؤقتة.</p>
        <label className="fld"><span>اسم المستخدم أو البريد الإلكتروني</span><input name="identifier" className="ltr" required autoFocus /></label>
        <div className="auth-err" role="alert" hidden></div>
        <div className="auth-ok" role="status" hidden></div>
        <button className="btn pri wide" type="submit">إرسال الرابط</button>
        <a className="auth-link" href="/login">العودة لتسجيل الدخول</a>
      </form>
      <script src="/auth.js" defer></script>
    </div>
  );
}
