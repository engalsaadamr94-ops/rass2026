(function () {
  'use strict';
  function api(path, opts) {
    opts = opts || {};
    return fetch('/api' + path, {
      method: opts.method || 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rass' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'تعذر تنفيذ الطلب'); e.code = j.code; throw e; } return j; }); });
  }
  var f = document.querySelector('form[data-form]');
  if (!f) return;
  var kind = f.dataset.form, err = f.querySelector('.auth-err'), ok = f.querySelector('.auth-ok'), btn = f.querySelector('button[type=submit]');
  function show(el, t) { if (!el) return; el.textContent = t; el.hidden = !t; }
  function val(n) { return (f.elements[n] || {}).value || ''; }
  var lo = document.querySelector('[data-logout]');
  if (lo) lo.addEventListener('click', function (e) { e.preventDefault(); api('/auth/logout').finally(function () { location.href = '/login'; }); });
  f.addEventListener('submit', function (e) {
    e.preventDefault(); show(err, ''); show(ok, '');
    var p, after;
    if (kind === 'login') { p = api('/auth/login', { body: { username: val('username'), password: val('password') } }); after = function (j) { location.href = j.must_change ? '/change-password' : '/'; }; }
    else if (kind === 'forgot') { p = api('/auth/forgot', { body: { identifier: val('identifier') } }); after = function (j) { show(ok, j.message); }; }
    else if (kind === 'reset') {
      if (val('password') !== val('password2')) return show(err, 'كلمتا المرور غير متطابقتين');
      var token = new URLSearchParams(location.search).get('token') || '';
      p = api('/auth/reset', { body: { token: token, password: val('password') } }); after = function () { show(ok, 'تم تعيين كلمة المرور. جارٍ التحويل لتسجيل الدخول…'); setTimeout(function () { location.href = '/login'; }, 1200); };
    }
    else if (kind === 'change') {
      if (val('password') !== val('password2')) return show(err, 'كلمتا المرور غير متطابقتين');
      p = api('/me/password', { body: { current: val('current'), password: val('password') } }); after = function () { location.href = '/'; };
    }
    else if (kind === 'setup') {
      p = api('/setup', { body: { key: val('key'), name: val('name'), username: val('username'), email: val('email'), password: val('password') } }); after = function () { location.href = '/login'; };
    }
    if (!p) return;
    btn.disabled = true;
    p.then(after).catch(function (x) { show(err, x.message); }).finally(function () { btn.disabled = false; });
  });
  if (kind === 'reset') {
    var t = new URLSearchParams(location.search).get('token') || '';
    fetch('/api/auth/reset-check?token=' + encodeURIComponent(t)).then(function (r) { return r.json(); }).then(function (j) { if (!j.valid) { show(err, 'الرابط غير صالح أو منتهي. اطلب رابطاً جديداً من صفحة استعادة كلمة المرور.'); btn.disabled = true; } }).catch(function () {});
  }
})();
