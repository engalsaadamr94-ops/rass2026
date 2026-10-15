export default function Reset() {
  return (
    <div className="auth-wrap">
      <form className="auth-card" data-form="reset">
        <img src="/logo.png" alt="رسس" className="auth-logo" />
        <h1>كلمة مرور جديدة</h1>
        <p className="muted">8 أحرف على الأقل، وتحتوي على حرف ورقم.</p>
        <label className="fld"><span>كلمة المرور الجديدة</span><input name="password" type="password" autoComplete="new-password" className="ltr" required autoFocus /></label>
        <label className="fld"><span>تأكيد كلمة المرور</span><input name="password2" type="password" autoComplete="new-password" className="ltr" required /></label>
        <div className="auth-err" role="alert" hidden></div>
        <button className="btn pri wide" type="submit">حفظ وتسجيل الدخول</button>
        <a className="auth-link" href="/login">العودة لتسجيل الدخول</a>
      </form>
      <script src="/auth.js" defer></script>
    </div>
  );
}
