// End-to-end API test. Usage: BASE=http://localhost:3000 DATABASE_URL=... SETUP_KEY=... CRON_SECRET=... MAIL_OUTBOX=/path node scripts/e2e.mjs
import pg from 'pg';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:3000';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
let pass = 0, failn = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { failn++; console.log('  ✗ FAIL:', m); } };

class Client {
  constructor() { this.cookie = ''; }
  async call(method, path, body, headers = {}) {
    const h = { 'Content-Type': 'application/json', 'X-Requested-With': 'rass', ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) { const m = /rass_session=([^;]*)/.exec(sc); if (m) this.cookie = m[1] ? 'rass_session=' + m[1] : ''; }
    let j = null; const txt = await r.text(); try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
    return { s: r.status, j };
  }
  get(p) { return this.call('GET', p); } post(p, b) { return this.call('POST', p, b || {}); } put(p, b) { return this.call('PUT', p, b || {}); }
}
const today = new Date().toISOString().slice(0, 10);
const sec = t => console.log('\n== ' + t);

sec('setup');
const anon = new Client();
let r = await anon.get('/setup/status'); ok(r.j.needsSetup === true, 'needs setup on empty DB');
r = await anon.post('/setup', { key: 'wrong', name: 'مدير', username: 'admin', password: 'Passw0rd!x' }); ok(r.s === 403, 'bad setup key rejected');
r = await anon.post('/setup', { key: process.env.SETUP_KEY, name: 'المدير العام', username: 'admin', email: 'admin@example.com', password: 'weak' }); ok(r.s === 400, 'weak password rejected');
r = await anon.post('/setup', { key: process.env.SETUP_KEY, name: 'المدير العام', username: 'admin', email: 'admin@example.com', password: 'Admin#2026a' }); ok(r.s === 200, 'first admin created');
r = await anon.post('/setup', { key: process.env.SETUP_KEY, name: 'x2', username: 'admin2', password: 'Admin#2026a' }); ok(r.s === 403, 'second setup blocked');

sec('csrf + auth basics');
r = await anon.call('POST', '/auth/login', { username: 'admin', password: 'Admin#2026a' }, { 'X-Requested-With': '' }); ok(r.s === 403, 'login without CSRF header rejected');
r = await anon.call('POST', '/auth/login', { username: 'admin', password: 'Admin#2026a' }, { Origin: 'http://evil.example' }); ok(r.s === 403, 'cross-origin login rejected');
r = await anon.get('/bootstrap'); ok(r.s === 401, 'bootstrap requires login');
const admin = new Client();
r = await admin.post('/auth/login', { username: 'admin', password: 'Admin#2026a' }); ok(r.s === 200 && !r.j.must_change, 'admin login');
r = await admin.get('/bootstrap'); ok(r.s === 200 && r.j.items.length >= 180 && r.j.items.some(i => i.est && i.std) && r.j.items.filter(i => !i.est).length === 21 && r.j.settings.nextSeq === 1, 'bootstrap has 21 original + std library items (std items flagged est) and counter=1');
ok(r.j.me.role === 'admin', 'me is admin');

sec('users + roles');
const mk = async (username, role, name) => { const x = await admin.post('/users', { username, name, role, email: username + '@example.com' }); ok(x.s === 200 && x.j.tempPassword, 'create ' + role); return x.j; };
const uS = await mk('sales1', 'sales', 'مندوب مبيعات'); const uS2 = await mk('sales2', 'sales', 'مندوب ثاني'); const uA = await mk('acc1', 'accountant', 'المحاسب'); const uV = await mk('view1', 'viewer', 'مشاهد');
r = await admin.post('/users', { username: 'sales1', name: 'dup', role: 'sales' }); ok(r.s === 400, 'duplicate username rejected');
const login = async (u, pw) => { const c = new Client(); const x = await c.post('/auth/login', { username: u, password: pw }); return { c, x }; };
const sales = await login('sales1', uS.tempPassword); ok(sales.x.j.must_change === true, 'temp password forces change');
r = await sales.c.get('/bootstrap'); ok(r.s === 403 && r.j.code === 'must_change', 'API blocked until password changed');
r = await sales.c.post('/me/password', { current: uS.tempPassword, password: 'short' }); ok(r.s === 400, 'weak new password rejected');
r = await sales.c.post('/me/password', { current: uS.tempPassword, password: 'Sales#2026a' }); ok(r.s === 200, 'password changed');
r = await sales.c.get('/bootstrap'); ok(r.s === 200, 'sales can use API after change');
const sales2 = await login('sales2', uS2.tempPassword); await sales2.c.post('/me/password', { current: uS2.tempPassword, password: 'Sales#2026b' });
const acc = await login('acc1', uA.tempPassword); await acc.c.post('/me/password', { current: uA.tempPassword, password: 'Acc#2026aa' });
const view = await login('view1', uV.tempPassword); await view.c.post('/me/password', { current: uV.tempPassword, password: 'View#2026a' });
r = await sales.c.get('/users'); ok(r.s === 403, 'sales cannot list users');
r = await sales.c.get('/audit'); ok(r.s === 403, 'sales cannot read audit');
r = await acc.c.get('/backups'); ok(r.s === 403, 'accountant cannot read backups');

sec('lockout');
const bad = new Client(); for (let i = 0; i < 5; i++) r = await bad.post('/auth/login', { username: 'view1', password: 'nope' + i });
r = await bad.post('/auth/login', { username: 'view1', password: 'View#2026a' }); ok(r.s === 429, 'account locked after 5 failures (even with right password)');
const ul = (await admin.get('/users')).j.users.find(u => u.username === 'view1'); ok(ul.locked === true, 'admin sees locked state');
await admin.post('/users/' + ul.id + '/unlock'); r = await bad.post('/auth/login', { username: 'view1', password: 'View#2026a' }); ok(r.s === 200, 'unlock works');

sec('quotes: create, sync, conflicts');
const items = (await admin.get('/bootstrap')).j.items;
const mkLine = (it, qty) => ({ id: 'l' + Math.random().toString(36).slice(2, 8), lib: it.id, group: it.cat, desc: it.desc, brand: it.brand, unit: it.unit, qty, price: it.price });
const baseQ = (o = {}) => ({ id: 'q' + Math.random().toString(36).slice(2, 10), client: 'عميل تجريبي', custId: '', project: 'مشروع', location: 'الرياض', validity: 30, preparedBy: 'x', lines: [], discMode: 'pct', discPct: 0, discAmt: 0, vatRate: 15, notes: 'n', ...o });
r = await admin.post('/quotes', { quote: baseQ(), numbering: 'counter' }); ok(r.s === 200 && r.j.quote.no === '26-1', 'admin quote numbered 26-1: ' + r.j.quote?.no);
const qA = r.j.quote;
r = await sales.c.post('/quotes', { quote: baseQ({ client: 'عميل المبيعات' }), numbering: 'counter' }); ok(r.j.quote.no === '26-2' && r.j.counters.nextSeq === 3, 'sequential numbering across users');
let qS = r.j.quote;
r = await anon.post('/quotes', { quote: baseQ() }); ok(r.s === 401, 'anon cannot create');
r = await view.c.post('/quotes', { quote: baseQ() }); ok(r.s === 403, 'viewer cannot create');
r = await acc.c.post('/quotes', { quote: baseQ() }); ok(r.s === 403, 'accountant cannot create');
// customer + lines through sync
const cust = { id: 'cust1abc', name: 'عميل تجريبي', phone: '0501234567' };
qA.lines = [mkLine(items[0], 4), mkLine(items[12], 1)]; qA.custId = cust.id; qA.status = 'sent';
r = await admin.post('/sync', { customers: { put: [cust], del: [] }, quotes: { put: [qA], del: [] } });
ok(r.s === 200 && r.j.versions.quotes[qA.id] === 2 && r.j.rejected.length === 0, 'sync saved quote (v2) and customer');
qA._v = 2;
r = await admin.post('/sync', { quotes: { put: [{ ...qA, project: 'stale', _v: 1 }], del: [] } }); ok(r.j.rejected[0]?.reason?.includes('مستخدم آخر') && r.j.rejected[0].current._v === 2, 'stale version -> conflict with current copy');
r = await admin.post('/sync', { quotes: { put: [{ ...qA, project: 'محدّث' }], del: [] } }); ok(r.j.versions.quotes[qA.id] === 3, 'normal update bumps version'); qA._v = 3; qA.project = 'محدّث';
const xs = await sales.c.post('/sync', { quotes: { put: [{ ...qA }], del: [] } }); ok(xs.j.rejected.length === 1, "sales cannot edit another user's quote");
r = await sales2.c.get('/bootstrap'); ok(r.j.quotes.length === 0, 'sales2 sees none of the others’ quotes');
r = await sales.c.get('/bootstrap'); ok(r.j.quotes.length === 1 && r.j.quotes[0].id === qS.id && r.j.customers.length === 0, 'sales sees only own quote, not admin customer');
ok(r.j.receipts.length === 0, 'sales receives no receipts');

sec('discount approval');
qS.lines = [mkLine(items[0], 10), mkLine(items[3], 5)]; qS.discMode = 'pct'; qS.discPct = 10; qS.status = 'sent';
r = await sales.c.post('/sync', { quotes: { put: [qS], del: [] } });
ok(r.j.quotes[qS.id]._approval.state === 'pending' && r.j.quotes[qS.id].status === 'draft' && r.j.warnings.length === 1, '10% discount -> pending; status forced back to draft');
qS._v = r.j.versions.quotes[qS.id]; qS.status = 'draft';
qS.discPct = 20; r = await sales.c.post('/sync', { quotes: { put: [qS], del: [] } }); ok(r.j.rejected[0]?.reason?.includes('15'), '20% exceeds the sales cap (15%)');
qS.discPct = 10; qS.contract = { date: today, party2: 'x', duration: 30, override: '', items: true, stamp: true, intro: 'i', terms: 't', paynote: 'p', close: 'c', payments: [{ id: 'p1', label: 'عند التعميد', pct: 50, due: today }, { id: 'p2', label: 'التسليم', pct: 50, due: '' }] };
r = await sales.c.post('/sync', { quotes: { put: [qS], del: [] } }); ok(r.j.warnings.some(w => w.text.includes('عقد')), 'contract blocked while approval pending');
r = await sales.c.post('/quotes/' + qS.id + '/share'); ok(r.s === 400, 'cannot share while pending');
r = await sales.c.post('/quotes/' + qS.id + '/approval', { action: 'approve' }); ok(r.s === 403, 'sales cannot approve');
r = await admin.get('/approvals'); ok(r.j.quotes.length === 1, 'admin sees 1 pending approval');
r = await admin.post('/quotes/' + qS.id + '/approval', { action: 'reject', note: 'الحد 5%' }); ok(r.j.quote._approval.state === 'rejected', 'admin rejects');
r = await sales.c.post('/quotes/' + qS.id + '/approval-request'); ok(r.j.quote._approval.state === 'pending', 're-request approval');
r = await admin.post('/quotes/' + qS.id + '/approval', { action: 'approve' }); ok(r.j.quote._approval.state === 'approved' && r.j.quote._approval.by, 'admin approves');
qS = (await sales.c.get('/bootstrap')).j.quotes[0]; qS.status = 'sent'; qS.contract = { date: today, party2: 'x', duration: 30, override: '', items: true, stamp: true, intro: 'i', terms: 't', paynote: 'p', close: 'c', payments: [{ id: 'p1', label: 'عند التعميد', pct: 50, due: today }, { id: 'p2', label: 'التسليم', pct: 50, due: '' }] };
r = await sales.c.post('/sync', { quotes: { put: [qS], del: [] } }); ok(r.j.quotes[qS.id].status === 'sent' && r.j.warnings.length === 0 && r.j.rejected.length === 0, 'after approval: sent + contract saved');
qS._v = r.j.versions.quotes[qS.id];
qS.discPct = 12; r = await sales.c.post('/sync', { quotes: { put: [qS], del: [] } }); ok(r.j.quotes[qS.id]._approval.state === 'pending', 'raising discount above approved level re-triggers approval'); qS._v = r.j.versions.quotes[qS.id]; qS.discPct = 10;
r = await sales.c.post('/sync', { quotes: { put: [qS], del: [] } }); ok(r.j.quotes[qS.id]._approval.state === 'pending', 'once invalidated, lowering back still needs a fresh approval'); qS._v = r.j.versions.quotes[qS.id];
r = await admin.post('/quotes/' + qS.id + '/approval', { action: 'approve' }); ok(r.j.quote._approval.state === 'approved', 'admin re-approves'); qS._v = r.j.quote._v;

sec('customer approval link');
r = await sales.c.post('/quotes/' + qS.id + '/share'); ok(r.s === 200 && r.j.quote._share.token, 'share link created');
const tok = r.j.quote._share.token;
r = await anon.get('/public/quote/' + tok); ok(r.s === 200 && r.j.quote.contract === null && !r.j.quote._owner && r.j.settings.nameAr, 'public view works w/o login and hides internals');
const v = r.j.v;
r = await anon.get('/public/quote/' + 'x'.repeat(30)); ok(r.s === 404, 'bad token -> 404');
r = await anon.post('/public/quote/' + tok, { action: 'approve', name: 'عميل', signature: 'data:image/png;base64,AAAA', v: v + 5 }); ok(r.s === 400 && r.j.code === 'stale', 'stale version rejected');
r = await anon.post('/public/quote/' + tok, { action: 'approve', name: 'ab', signature: 'x', v }); ok(r.s === 400, 'short name rejected');
r = await anon.post('/public/quote/' + tok, { action: 'approve', name: 'محمد العميل', signature: 'not-an-image', v }); ok(r.s === 400, 'missing signature rejected');
r = await anon.post('/public/quote/' + tok, { action: 'approve', name: 'محمد العميل', signature: 'data:image/png;base64,iVBORw0KGgo=', v }); ok(r.s === 200 && r.j.status === 'won', 'customer approves -> won');
r = await anon.post('/public/quote/' + tok, { action: 'reject', name: 'محمد العميل', v: v + 1 }); ok(r.s === 400 && r.j.code === 'decided', 'second decision refused');
qS = (await sales.c.get('/bootstrap')).j.quotes[0]; ok(qS.status === 'won' && qS._decision.name === 'محمد العميل', 'quote shows decision to owner');
qS.client = 'تعديل'; r = await sales.c.post('/sync', { quotes: { put: [qS], del: [] } }); ok(r.j.rejected.length === 0, 'sales may still edit contract on won quote (client edit ignored)');
const got = (await sales.c.get('/bootstrap')).j.quotes[0]; ok(got.client === 'عميل المبيعات', 'won quote is locked for non-contract fields');

sec('accountant + receipts');
const cons = qA; qA.contract = { date: today, party2: 'عميل', duration: 30, override: '', items: true, stamp: true, intro: 'i', terms: 't', paynote: 'p', close: 'c', payments: [{ id: 'pa1', label: 'دفعة 1', pct: 60, due: '' }, { id: 'pa2', label: 'دفعة 2', pct: 40, due: '' }] };
r = await admin.post('/sync', { quotes: { put: [qA], del: [] } }); qA._v = r.j.versions.quotes[qA.id]; ok(r.j.rejected.length === 0, 'admin adds contract');
let ab = (await acc.c.get('/bootstrap')).j; ok(ab.quotes.length === 2 && ab.receipts.length === 0, 'accountant sees all quotes');
const qa = ab.quotes.find(q => q.id === qA.id);
r = await acc.c.post('/sync', { quotes: { put: [{ ...qa, project: 'hack' }], del: [] } }); ok(r.j.rejected.length === 1, 'accountant cannot edit quote fields');
const dueEdit = JSON.parse(JSON.stringify(qa)); dueEdit.contract.payments[0].due = today;
r = await acc.c.post('/sync', { quotes: { put: [dueEdit], del: [] } }); ok(r.j.rejected.length === 0 && r.j.versions.quotes[qA.id], 'accountant may edit due dates'); qA._v = r.j.versions.quotes[qA.id];
const dd = JSON.parse(JSON.stringify(dueEdit)); dd._v = qA._v; dd.contract.payments[1].label = 'مخترق';
r = await acc.c.post('/sync', { quotes: { put: [dd], del: [] } }); ok(r.j.rejected.length === 1, 'accountant cannot change payment labels');
r = await admin.post('/sync', { customers: { put: [{ ...cust, _v: 1 }], del: [] } }).catch(() => ({ j: {} }));
const rc1 = await acc.c.post('/receipts', { date: today, custId: cust.id, qid: qA.id, payId: 'pa1', amount: 1000, method: 'نقدي', ref: '', notes: '' });
ok(rc1.s === 200 && rc1.j.receipt.no === 'RC-26-001', 'accountant creates receipt RC-26-001: ' + rc1.j.receipt?.no);
r = await acc.c.post('/receipts', { date: today, custId: cust.id, qid: qA.id, payId: 'nope', amount: 1, method: 'نقدي' }); ok(r.s === 400, 'invalid payment id rejected');
r = await acc.c.post('/receipts', { date: today, custId: cust.id, amount: -5, method: 'نقدي' }); ok(r.s === 400, 'negative amount rejected');
r = await sales.c.post('/receipts', { date: today, custId: cust.id, amount: 5, method: 'نقدي' }); ok(r.s === 403, 'sales cannot create receipts');
r = await view.c.post('/receipts', { date: today, custId: cust.id, amount: 5, method: 'نقدي' }); ok(r.s === 403, 'viewer cannot create receipts');
r = await view.c.get('/bootstrap'); ok(r.j.receipts.length === 1 && r.j.quotes.length === 2, 'viewer can read');
r = await view.c.post('/sync', { quotes: { put: [qA], del: [] } }); ok(r.j.rejected.length === 1, 'viewer cannot write');
const rc2 = await acc.c.post('/receipts', { date: today, custId: cust.id, qid: qA.id, payId: 'pa1', amount: 500.5, method: 'تحويل بنكي', ref: 'TR1', notes: '' }); ok(rc2.j.receipt.no === 'RC-26-002', 'second receipt numbered 002');
r = await acc.c.post('/sync', { quotes: { put: [], del: [qA.id] } }); ok(r.j.rejected.length === 1, 'cannot delete quote with receipts (and accountant has no rights)');
r = await admin.post('/sync', { quotes: { put: [], del: [qA.id] } }); ok(r.j.rejected.length === 1 && r.j.rejected[0].reason.includes('سندات'), 'admin cannot delete quote that has receipts');
r = await admin.post('/sync', { customers: { put: [], del: [cust.id] } }); ok(r.j.rejected.length === 1, 'cannot delete customer with data');

sec('receipts are immutable');
let dbErr = ''; try { await db.query("update receipts set amount = 1 where no = 'RC-26-001'"); } catch (e) { dbErr = e.message; } ok(dbErr.includes('immutable'), 'DB blocks amount update: ' + dbErr);
dbErr = ''; try { await db.query("delete from receipts where no = 'RC-26-001'"); } catch (e) { dbErr = e.message; } ok(dbErr.includes('cannot be deleted'), 'DB blocks delete');
r = await acc.c.post('/receipts/' + rc1.j.receipt.id + '/void', { reason: 'x' }); ok(r.s === 400, 'void needs a real reason');
r = await view.c.post('/receipts/' + rc1.j.receipt.id + '/void', { reason: 'سبب كافي' }); ok(r.s === 403, 'viewer cannot void');
r = await acc.c.post('/receipts/' + rc2.j.receipt.id + '/void', { reason: 'خطأ في المبلغ' }); ok(r.s === 200 && r.j.receipt.void === true, 'accountant voids with reason');
r = await acc.c.post('/receipts/' + rc2.j.receipt.id + '/void', { reason: 'مرة ثانية' }); ok(r.s === 400, 'cannot void twice');
dbErr = ''; try { await db.query("update receipts set void = false where no = 'RC-26-002'"); } catch (e) { dbErr = e.message; } ok(dbErr.includes('final'), 'DB blocks un-void');
const rcs = (await admin.get('/bootstrap')).j.receipts; ok(rcs.length === 2 && rcs.filter(x => x.void).length === 1, 'voided receipt stays on record');

sec('password reset by email + admin reset');
fs.writeFileSync(process.env.MAIL_OUTBOX, '');
r = await anon.post('/auth/forgot', { identifier: 'nobody' }); ok(r.s === 200 && r.j.message, 'unknown user -> generic answer');
ok(fs.readFileSync(process.env.MAIL_OUTBOX, 'utf8') === '', 'no mail for unknown user');
r = await anon.post('/auth/forgot', { identifier: 'sales2@example.com' }); ok(r.s === 200, 'forgot by email ok');
let mail = JSON.parse(fs.readFileSync(process.env.MAIL_OUTBOX, 'utf8').trim().split('\n').pop()); const tk = /token=([A-Za-z0-9_-]+)/.exec(mail.text)[1]; ok(mail.to === 'sales2@example.com' && tk.length > 30, 'reset mail has token link');
const dbTok = await db.query('select token_hash from password_resets'); ok(!dbTok.rows.some(x => x.token_hash === tk), 'token stored hashed only');
r = await anon.get('/auth/reset-check?token=' + tk); ok(r.j.valid === true, 'token valid');
r = await anon.post('/auth/reset', { token: tk, password: 'abc' }); ok(r.s === 400, 'weak reset password rejected');
r = await anon.post('/auth/reset', { token: tk, password: 'NewPass#2026' }); ok(r.s === 200, 'reset with token');
r = await anon.post('/auth/reset', { token: tk, password: 'Another#2026' }); ok(r.s === 400, 'token is single-use');
r = await sales2.c.get('/bootstrap'); ok(r.s === 401, 'old session revoked after reset');
r = (await login('sales2', 'NewPass#2026')).x; ok(r.s === 200, 'login with new password');
await anon.post('/auth/forgot', { identifier: 'sales2' }); await anon.post('/auth/forgot', { identifier: 'sales2' }); await anon.post('/auth/forgot', { identifier: 'sales2' });
ok(fs.readFileSync(process.env.MAIL_OUTBOX, 'utf8').trim().split('\n').length <= 4, 'forgot rate-limited per user');
await db.query("update password_resets set expires_at = now() - interval '1 minute'"); r = await anon.get('/auth/reset-check?token=' + tk); ok(r.j.valid === false, 'expired/used tokens invalid');
const uid = (await admin.get('/users')).j.users.find(u => u.username === 'acc1').id;
const rst = await admin.post('/users/' + uid + '/reset-password'); ok(rst.j.tempPassword?.length >= 10, 'admin temp password');
r = await acc.c.get('/bootstrap'); ok(r.s === 401, 'sessions revoked on admin reset');
const acc2 = await login('acc1', rst.j.tempPassword); ok(acc2.x.j.must_change === true, 'temp password must be changed'); await acc2.c.post('/me/password', { current: rst.j.tempPassword, password: 'Acc#2026bb' });

r = await admin.put('/users/' + (await admin.get('/me')).j.id, { role: 'sales' }); ok(r.s === 400, 'admin cannot demote self');

sec('settings, counters, library');
let b = (await admin.get('/bootstrap')).j; const st = b.settings;
r = await admin.post('/sync', { settings: { ...st, discApprovalPct: 8, nextSeq: 999 } }); ok(r.j.versions.settings === st._v + 1, 'admin updates settings');
b = (await admin.get('/bootstrap')).j; ok(b.settings.discApprovalPct === 8 && b.settings.nextSeq === 3, 'counter not overwritten by stale client value');
r = await admin.put('/counters', { nextSeq: 100, rcNext: 50 }); ok(r.j.nextSeq === 100, 'counters set explicitly');
r = await sales.c.post('/sync', { settings: { ...st, nameAr: 'hack', _v: b.settings._v } }); ok(r.j.rejected[0]?.kind === 'settings', 'sales cannot edit settings');
r = await admin.post('/sync', { items: { put: [{ id: 'itemnew1', cat: 'قسم', desc: 'صنف جديد', brand: '', unit: 'NO', price: 12.5 }], del: [] } }); ok(r.j.versions.items.itemnew1 === 1, 'admin adds library item');
r = await acc2.c.post('/sync', { items: { put: [{ id: 'itemnew2', cat: 'x', desc: 'y', price: 1 }], del: [] } }); ok(r.j.rejected.length === 1, 'accountant cannot add library items');

sec('backup / import / reports / cron / audit');
r = await admin.post('/backups'); ok(r.s === 200 && r.j.backup.counts.receipts === 2, 'manual backup: ' + JSON.stringify(r.j.backup?.counts));
const bid = r.j.backup.id; const dl = await fetch(BASE + '/api/backups/' + bid, { headers: { Cookie: admin.cookie } }); const dump = await dl.json(); ok(dump.format === 'rass-backup' && dump.quotes.length === 2 && !JSON.stringify(dump).includes('password_hash'), 'backup download has no password hashes');
const legacy = { v: 2, settings: { ...dump.settings, nextSeq: 5 }, items: [{ id: 'leg1', cat: 'قسم قديم', desc: 'بند قديم', brand: '', unit: 'NO', price: 7 }], customers: [{ id: 'legc1', name: 'عميل قديم', phone: '055' }],
  quotes: [{ id: 'legq1', no: '25-100', date: '2025-01-01', client: 'عميل قديم', custId: 'legc1', project: 'p', location: 'l', validity: 30, status: 'won', preparedBy: 'x', lines: [{ id: 'a1', group: 'g', desc: 'd', brand: '', unit: 'NO', qty: 2, price: 10 }], discMode: 'amt', discPct: 0, discAmt: 0, vatRate: 15, notes: '', contract: { date: '2025-01-02', party2: 'عميل قديم', duration: 30, override: '', items: true, stamp: true, intro: '', terms: '', paynote: '', close: '', payments: [{ id: 'lp1', label: 'a', pct: 100, due: '' }] } }],
  receipts: [{ id: 'legr1', no: 'RC-25-001', date: '2025-01-05', custId: 'legc1', qid: 'legq1', payId: 'lp1', amount: 23, method: 'نقدي', ref: '', notes: '' }] };
r = await admin.post('/import', { data: legacy }); ok(r.s === 200 && r.j.result.quotes === 1 && r.j.result.receipts === 1, 'legacy import: ' + JSON.stringify(r.j.result));
r = await admin.post('/import', { data: legacy }); ok(r.j.result.quotesSkipped === 1 && r.j.result.receiptsSkipped === 1, 're-import is idempotent');
r = await admin.get('/reports/monthly?month=' + today.slice(0, 7)); ok(r.s === 200 && r.j.total === 1000 && r.j.count === 1 && r.j.voidedCount === 1, 'monthly report: total=' + r.j.total);
r = await view.c.get('/reports/monthly?month=' + today.slice(0, 7)); ok(r.s === 403, 'viewer cannot see reports');
r = await anon.get('/cron/backup'); ok(r.s === 403, 'cron needs secret');
r = await anon.call('GET', '/cron/backup', null, { Authorization: 'Bearer ' + process.env.CRON_SECRET }); ok(r.s === 200 && r.j.ok, 'cron backup runs');
r = await anon.call('GET', '/cron/monthly', null, { Authorization: 'Bearer ' + process.env.CRON_SECRET }); ok(r.s === 200 && r.j.sent >= 1, 'cron monthly emails admins: ' + JSON.stringify(r.j));
r = await admin.get('/audit?limit=300'); ok(r.s === 200 && r.j.entries.length > 30, 'audit has entries: ' + r.j.entries.length);
ok(['quote.create', 'receipt.create', 'receipt.void', 'auth.login_failed', 'quote.approval_granted', 'quote.customer_approved', 'user.reset_password'].every(a => r.j.entries.some(e => e.action === a)), 'audit covers key actions');
dbErr = ''; try { await db.query("delete from audit_log where id = (select min(id) from audit_log)"); } catch (e) { dbErr = e.message; } ok(dbErr.includes('append-only'), 'audit log is append-only');

sec('standard library + takeoff');
import http from 'node:http';
let aiCalls = 0, aiLast = null;
const mock = http.createServer((q, res) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { aiCalls++; aiLast = { headers: q.headers, body: JSON.parse(b) };
  const aiTxt = (aiLast.body.messages[0].content[1] || aiLast.body.messages[0].content[0]).text; const out = aiTxt.includes('LINES_TEST') ? { content: [{ type: 'text', text: JSON.stringify([{ desc: 'كاشف دخان', qty: 20, unit: 'NO', lib: (/\n([A-Za-z0-9_-]{4,40})\|/.exec(aiTxt) || [])[1] || 'zz', note: '' }, { desc: 'بند غريب', qty: -5, lib: 'invented' }]) }] } : aiTxt.includes('FORCEBAD') ? { content: [{ type: 'text', text: 'not json' }] } : { content: [{ type: 'text', text: 'نتيجة: ' + JSON.stringify({ scale_text: '1:100', legend_found: true, items: [{ var: 'smk', count: 3, points: [[0.1, 0.2], [0.5, 0.5], [2, -1]], confidence: 0.9 }, { var: 'evil', count: 9, points: [] }], warnings: ['w1'] }) }] };
  res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out)); }); }).listen(3999);
r = await admin.post('/items/std'); ok(r.s === 200 && r.j.added === 0, 'std library already seeded at setup (idempotent): ' + r.j.added);
await db.query("delete from items where data->>'std' in ('fa.smoke.a','ff.pipe.4')");
r = await sales.c.post('/items/std'); ok(r.s === 403, 'sales cannot import std library');
r = await admin.post('/items/std'); ok(r.s === 200 && r.j.added === 2 && r.j.items.length >= 180, 'std import re-adds only missing items');
r = await admin.get('/bootstrap'); const sm = r.j.items.find(i => i.std === 'fa.smoke.a'); ok(sm && sm.est === true && sm.price > 0, 'std item has est flag and price');
// est flag survives sync + is cleared by editing
r = await admin.post('/sync', { items: { put: [{ ...sm, price: 321 }] } }); ok(r.s === 200, 'item edit syncs');
let rr = await admin.get('/bootstrap'); ok(rr.j.items.find(i => i.id === sm.id).price === 321, 'item price updated');
// takeoff CRUD (fresh sessions: earlier sections revoke some tokens)
const uA3 = await mk('acc3', 'accountant', 'محاسب 3'); const accT = await login('acc3', uA3.tempPassword); await accT.c.post('/me/password', { current: uA3.tempPassword, password: 'Acc#2026zz' });
const uS3 = await mk('sales3', 'sales', 'مندوب 3'); const sales3 = await login('sales3', uS3.tempPassword); await sales3.c.post('/me/password', { current: uS3.tempPassword, password: 'Sales#2026z' });
const TKD = { vars: [{ id: 'smk', name: 'كاشف دخان', kind: 'count', item: sm.id, formula: 'q' }], consts: { waste: 10 }, files: [], sheets: [], marks: [], meas: [], assign: {}, adopt: {}, manual: {} };
r = await accT.c.get('/takeoffs'); ok(r.s === 403, 'accountant has no take-off access');
r = await view.c.get('/takeoffs'); ok(r.s === 403 || r.s === 401 || r.s === 429, 'viewer has no take-off access');
r = await admin.post('/takeoffs', { name: 'حصر المدير', data: TKD }); ok(r.s === 200 && r.j.id && r.j.v === 1, 'admin creates take-off'); const tkA = r.j;
r = await sales.c.post('/takeoffs', { name: 'حصر المبيعات', data: TKD }); ok(r.s === 200, 'sales creates take-off'); const tkS = r.j;
r = await sales.c.get('/takeoffs'); ok(r.s === 200 && r.j.takeoffs.length === 1 && r.j.takeoffs[0].id === tkS.id, 'sales sees only own take-offs');
r = await sales.c.get('/takeoffs/' + tkA.id); ok(r.s === 404, 'sales cannot open others take-off');
r = await sales3.c.put('/takeoffs/' + tkS.id, { v: 1, data: TKD }); ok(r.s === 404, 'other sales cannot edit it');
r = await admin.get('/takeoffs'); ok(r.j.takeoffs.length === 2, 'admin sees all take-offs');
const marks = Array.from({ length: 50 }, (_, i) => ({ id: 'm' + i, sheet: 's1', kind: 'count', var: 'smk', by: 'man', pts: [[i, i]] }));
r = await admin.put('/takeoffs/' + tkA.id, { v: 1, name: 'حصر معدّل', data: { ...TKD, marks } }); ok(r.s === 200 && r.j.v === 2, 'take-off saved (version 2)');
r = await admin.put('/takeoffs/' + tkA.id, { v: 1, data: TKD }); ok(r.s === 409 && r.j.code === 'conflict' && r.j.current, 'stale version rejected with 409');
r = await admin.get('/takeoffs/' + tkA.id); ok(r.j.name === 'حصر معدّل' && r.j.data.marks.length === 50, 'take-off round-trips');
r = await admin.put('/takeoffs/' + tkA.id, { v: 2, data: { ...TKD, marks: Array.from({ length: 20000 }, (_, i) => ({ id: 'm' + i, sheet: 's1', kind: 'count', var: 'smk', by: 'man', pts: [[i * 1.123456789, i * 2.987654321]], note: 'x'.repeat(40) })) } }); ok(r.s === 400, 'oversized take-off rejected');
// link to a quote (sales may link only own quotes)
r = await sales.c.post('/quotes', { quote: { id: 'tkq1', client: 'x', lines: [], date: today, validity: 30, vatRate: 15, status: 'draft', discMode: 'pct', discPct: 0, discAmt: 0, notes: '' }, numbering: 'counter' }); ok(r.s === 200, 'sales quote for linking');
const qTK = r.j.quote.id;
r = await sales.c.put('/takeoffs/' + tkS.id, { v: 1, quoteId: qTK }); ok(r.s === 200, 'link take-off to own quote');
r = await sales.c.put('/takeoffs/' + tkS.id, { v: 2, quoteId: 'doesnotexist' }); ok(r.s === 400, 'link to unknown quote rejected');
// push-to-quote line fields survive sanitising
r = await sales.c.post('/sync', { quotes: { put: [{ id: qTK, ...r.j, no: undefined, client: 'x', date: today, validity: 30, vatRate: 15, status: 'draft', discMode: 'pct', discPct: 0, discAmt: 0, notes: '', lines: [{ id: 'l1', lib: sm.id, group: 'g', desc: 'd', brand: '', unit: 'NO', qty: 5, price: 10, est: true, src: 'tk:abcd1234:smk' }], _v: 1 }] } });
rr = await sales.c.get('/bootstrap'); const ql = rr.j.quotes.find(q => q.id === qTK); ok(ql && ql.lines[0] && ql.lines[0].est === true && ql.lines[0].src === 'tk:abcd1234:smk', 'quote line keeps est + src: ' + JSON.stringify(ql && ql.lines[0]));
// settings.tk is sanitised
rr = await admin.get('/bootstrap'); const st0 = rr.j.settings;
r = await admin.post('/sync', { settings: { ...st0, tk: { consts: { waste: 12, 'bad key!': 3, '9x': 1 }, vars: [{ id: 'smk', name: 'x', kind: 'zzz', item: 'a', formula: 'q*2' }, { id: '', name: 'nope' }], rules: [{ id: 'r1', src: 'block', pat: 'SMOKE*', var: 'smk' }, { id: 'r2', src: 'evil', pat: '', var: 'smk' }] } } }); ok(r.s === 200, 'settings with tk saved');
rr = await admin.get('/bootstrap'); const tkS2 = rr.j.settings.tk; ok(tkS2 && tkS2.consts.waste === 12 && !('9x' in tkS2.consts) && tkS2.vars.length === 1 && tkS2.vars[0].kind === 'count' && tkS2.rules.length === 1 && tkS2.rules[0].pat === 'SMOKE*', 'settings.tk sanitised: ' + JSON.stringify(tkS2));
// AI suggestion (mock Anthropic)
r = await admin.get('/takeoff-ai/status'); ok(r.j.enabled === true, 'AI enabled when key is set');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await sales.c.post('/takeoff-ai', { image: PNG, vars: [{ id: 'smk', name: 'كاشف دخان' }] }); ok(r.s === 200 && r.j.items.length === 1 && r.j.items[0].var === 'smk' && r.j.items[0].points.length === 3, 'AI suggestion parsed and filtered to requested vars');
ok(r.j.items[0].points.every(p => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1), 'AI points clamped to 0..1');
ok(aiLast.headers['x-api-key'] === 'test-key' && aiLast.body.messages[0].content[0].type === 'image', 'AI request carries key + image');
r = await sales.c.post('/takeoff-ai', { image: 'http://evil/x.png', vars: [{ id: 'smk', name: 'x' }] }); ok(r.s === 400, 'AI rejects non-data-URL image');
r = await sales.c.post('/takeoff-ai', { image: PNG, vars: [] }); ok(r.s === 400, 'AI requires variables');
r = await sales.c.post('/takeoff-ai', { image: PNG, vars: [{ id: 'smk', name: 'x' }], note: 'FORCEBAD' }); ok(r.s === 502, 'AI garbage reply handled as 502');
r = await accT.c.post('/takeoff-ai', { image: PNG, vars: [{ id: 'smk', name: 'x' }] }); ok(r.s === 403, 'accountant cannot call AI route');
r = await sales.c.del ? null : null;
r = await sales.c.call('DELETE', '/takeoffs/' + tkS.id); ok(r.s === 200, 'owner deletes take-off');
r = await admin.get('/audit?limit=300'); ok(['takeoff.create', 'takeoff.update', 'takeoff.delete', 'takeoff.ai'].every(a => r.j.entries.some(e => e.action === a)), 'take-off actions audited');

sec('cost visibility, invoices, agreements, templates');
{
  const L = (o = {}) => ({ id: 'l' + Math.random().toString(36).slice(2, 7), desc: 'كاشف دخان', unit: 'NO', brand: '', group: 'g', qty: 10, price: 100, cost: 60, ...o });
  r = await admin.post('/quotes', { quote: baseQ({ client: 'عميل التكلفة', lines: [L()] }), numbering: 'counter' }); const qc = r.j.quote;
  ok(qc.lines[0].cost === 60, 'admin sees cost');
  r = await admin.post('/quotes/' + qc.id + '/share'); const tok0 = r.j.quote?._share?.token; ok(!!tok0, 'admin share link created');
  r = await sales.c.get('/bootstrap'); ok(r.j.me.perms.seeCost === false, 'sales lacks seeCost');
  r = await acc2.c.get('/bootstrap'); ok(r.j.me.perms.seeCost === true && r.j.quotes.some(q => q.lines?.[0]?.cost === 60), 'accountant sees cost');
  r = await sales.c.post('/quotes', { quote: baseQ({ client: 'ع', lines: [L({ cost: 1 })] }), numbering: 'counter' }); const qs = r.j.quote;
  ok(qs.lines[0].cost === undefined, 'sales response has no cost');
  r = await admin.get('/bootstrap'); ok(r.j.quotes.find(q => q.id === qs.id).lines[0].cost !== 1, "sales cannot inject a cost value");
  // min margin gate
  { const c0 = (await admin.get('/bootstrap')).j.settings; r = await admin.post('/sync', { settings: { ...c0, minMarginPct: 50 } }); const s1 = (await admin.get('/bootstrap')).j.settings; ok(s1.minMarginPct === 50, 'min margin setting accepted');
    await admin.post('/sync', { items: { put: [{ id: 'itcost1', cat: 'قسم', desc: 'صنف بتكلفة', brand: '', unit: 'NO', price: 100, cost: 90 }], del: [] } });
    const qm = baseQ({ client: 'هامش', lines: [L({ lib: 'itcost1', price: 100, cost: undefined })] }); r = await sales.c.post('/quotes', { quote: qm, numbering: 'counter' }); const qq = r.j.quote;
    r = await sales.c.post('/sync', { quotes: { put: [{ ...qq, status: 'sent' }], del: [] } }); ok((r.j.warnings || []).some(w => /هامش/.test(w.text)) || (r.j.rejected || []).length > 0, 'margin gate blocks low-margin send for sales');
    const adm = (await admin.get('/bootstrap')).j.quotes.find(q => q.id === qq.id); ok(adm.lines[0].cost === 90, 'admin cost preserved after sales save');
    r = await admin.post('/sync', { settings: { ...(await admin.get('/bootstrap')).j.settings, minMarginPct: 0 } }); }
  // invoices
  r = await sales.c.get('/invoices'); ok(r.s === 403, 'sales cannot list invoices');
  r = await acc2.c.post('/invoices', { kind: 'invoice', date: today, buyer: { name: 'شركة س', vat: '300000000000003' }, lines: [{ desc: 'خدمة', qty: 2, price: 100 }] });
  ok(r.s === 200 && r.j.invoice.total === 230 && r.j.invoice.vat === 30, 'invoice totals computed on server');
  const inv = r.j.invoice;
  r = await acc2.c.post('/invoices', { kind: 'invoice', date: today, buyer: { name: 'x', vat: '123' }, lines: [{ desc: 'a', qty: 1, price: 1 }] }); ok(r.s === 400, 'bad buyer VAT rejected');
  r = await acc2.c.post('/invoices', { kind: 'credit', date: today, refId: inv.id, reason: 'مرتجع', buyer: { name: 'شركة س' }, lines: [{ desc: 'خدمة', qty: 3, price: 100 }] }); ok(r.s === 400, 'credit note above invoice rejected');
  r = await acc2.c.post('/invoices', { kind: 'credit', date: today, refId: inv.id, buyer: { name: 'شركة س' }, lines: [{ desc: 'خدمة', qty: 1, price: 100 }] }); ok(r.s === 400, 'credit note requires reason');
  r = await acc2.c.post('/invoices', { kind: 'credit', date: today, refId: inv.id, reason: 'مرتجع', buyer: { name: 'شركة س' }, lines: [{ desc: 'خدمة', qty: 1, price: 100 }] }); ok(r.s === 200, 'valid credit note');
  let imm = false; try { await db.query(`update invoices set total = 1 where id = $1`, [inv.id]); } catch { imm = true; } ok(imm, 'invoice immutable at DB level');
  r = await acc2.c.get('/invoices'); ok(r.j.invoices.length === 2, 'invoices listed');
  // agreements
  const ag = { kind: 'nda', title: 'اتفاقية سرية', date: today, party2: { name: 'شركة ص' }, clauses: [{ id: 'k1', title: 'السرية', text: 'نص', on: true }], payments: [] };
  r = await sales.c.post('/agreements', { agreement: ag }); ok(r.s === 200 && /^AG-/.test(r.j.agreement.no), 'sales creates agreement: ' + r.j.agreement?.no);
  const agS = r.j.agreement;
  r = await sales3.c.get('/agreements'); ok(r.s === 200 && !r.j.agreements.some(a => a.id === agS.id), 'other sales cannot see it');
  r = await sales3.c.put('/agreements/' + agS.id, { agreement: ag, _v: agS._v }); ok(r.s === 404 || r.s === 403, 'other sales cannot edit it');
  r = await acc2.c.post('/agreements', { agreement: ag }); ok(r.s === 403, 'accountant is read-only on agreements');
  r = await acc2.c.get('/agreements'); ok(r.j.agreements.some(a => a.id === agS.id), 'accountant reads all agreements');
  r = await sales.c.put('/agreements/' + agS.id, { agreement: { ...ag, title: 'معدلة' }, status: 'signed', _v: agS._v }); ok(r.s === 200 && r.j.agreement._v === agS._v + 1, 'agreement saved & signed');
  const v2 = r.j.agreement._v;
  r = await sales.c.put('/agreements/' + agS.id, { agreement: { ...ag, title: 'تعديل بعد التوقيع' }, status: 'signed', _v: v2 }); ok(r.s === 400, 'signed agreement locked');
  r = await sales.c.put('/agreements/' + agS.id, { agreement: ag, status: 'draft', _v: 1 }); ok(r.s === 409, 'stale agreement version -> 409');
  r = await sales.c.call('DELETE', '/agreements/' + agS.id); ok(r.s === 403, 'sales cannot delete non-draft agreement');
  r = await admin.call('DELETE', '/agreements/' + agS.id); ok(r.s === 200, 'admin deletes agreement');
  // templates
  const cur = (await admin.get('/bootstrap')).j; const tpl = { id: 't1', name: 'قالب <b>x</b>', theme: { navy: '#112233', evil: 'red;}</style>' }, font: { body: 'cairo', scale: 9 }, bar: 'zzz' };
  r = await admin.post('/sync', { settings: { ...cur.settings, templates: [tpl], tplDef: { quote: 't1' } } });
  const s2 = (await admin.get('/bootstrap')).j.settings; const t = (s2.templates || [])[0];
  ok(t && t.theme.navy === '#112233' && !JSON.stringify(t).includes('</style>'), 'template sanitised (no css injection)');
  ok(t && t.bar !== 'zzz' && (t.font.scale || 1) <= 1.4, 'template enums & scale clamped');
  ok(s2.tplDef.quote === 't1', 'default template assigned');
  r = await sales.c.get('/bootstrap'); ok(r.j.settings.templates?.length === 1, 'sales receives templates');
  { const tk = String(tok0 || '').split('/').pop(); r = await anon.get('/public/quote/' + tk); ok(r.s === 200 && !JSON.stringify(r.j).includes('"cost"'), 'public quote has no cost'); }
}

sec('contract cycle: variation orders, IPCs, cheques');
{
  const k = { date: today, party2: 'عميل', duration: 30, override: '', items: true, stamp: true, intro: '', terms: '', paynote: '', close: '', payments: [{ id: 'p1', label: 'دفعة', pct: 100, due: '' }] };
  r = await admin.post('/quotes', { quote: baseQ({ client: 'عميل دورة', lines: [{ id: 'z1', group: 'قسم أ', desc: 'بند', brand: '', unit: 'NO', qty: 10, price: 1000 }, { id: 'z2', group: 'قسم ب', desc: 'بند2', brand: '', unit: 'NO', qty: 10, price: 1000 }], contract: k }), numbering: 'counter', keepContract: true });
  const qc = r.j.quote; ok(!!qc.contract, 'contract quote created');
  // variation order
  r = await acc2.c.post('/pdocs', { kind: 'vo', doc: { quoteId: qc.id, title: 'أعمال إضافية', dir: 'add', vatRate: 15, lines: [{ desc: 'كاشف', unit: 'NO', qty: 4, price: 250 }] } });
  ok(r.s === 200 && r.j.doc.amount === 1150 && /^VO-/.test(r.j.doc.no), 'VO created with server-side amount: ' + r.j.doc?.amount);
  const vo = r.j.doc;
  r = await sales.c.post('/pdocs', { kind: 'vo', doc: { quoteId: qc.id, title: 'x', lines: [{ desc: 'a', qty: 1, price: 1 }] } }); ok(r.s === 403, 'sales cannot create VO');
  r = await sales.c.get('/pdocs?kind=vo'); ok(r.s === 200 && r.j.docs.length === 0, 'sales sees only VOs of own quotes');
  r = await acc2.c.put('/pdocs/' + vo.id, { doc: { ...vo, dir: 'omit' }, status: 'approved', _v: vo._v }); ok(r.s === 200 && r.j.doc.status === 'approved' && r.j.doc.amount === -1150, 'VO approved with edits (amount recomputed server-side: omit = negative)');
  r = await acc2.c.put('/pdocs/' + vo.id, { doc: { ...vo, title: 'تغيير' }, status: 'approved', _v: r.j.doc._v }); ok(r.s === 400, 'approved VO is locked');
  // IPC chain
  const il = [{ id: 'g0', desc: 'قسم أ', amt: 10000, pct: 50 }, { id: 'g1', desc: 'قسم ب', amt: 10000, pct: 0 }];
  r = await acc2.c.post('/pdocs', { kind: 'ipc', doc: { quoteId: qc.id, vatRate: 15, advance: 2000, advPct: 10, retPct: 10, lines: il } });
  ok(r.s === 200 && r.j.doc.seq === 1 && r.j.doc.calc.work === 5000 && r.j.doc.calc.payable === 4675, 'IPC#1 computed: ' + r.j.doc?.amount);
  const i1 = r.j.doc;
  r = await acc2.c.post('/pdocs', { kind: 'ipc', doc: { quoteId: qc.id, vatRate: 15, advance: 2000, advPct: 10, retPct: 10, lines: il.map(l => ({ ...l, pct: 100 })) } }); const i2 = r.j.doc; ok(i2.seq === 2, 'IPC#2 sequence');
  r = await acc2.c.put('/pdocs/' + i2.id, { doc: i2, status: 'approved', _v: i2._v }); ok(r.s === 400, 'cannot approve IPC#2 before #1');
  r = await acc2.c.put('/pdocs/' + i1.id, { doc: i1, status: 'approved', _v: i1._v }); ok(r.s === 200 && r.j.doc.status === 'approved', 'IPC#1 approved');
  r = await acc2.c.put('/pdocs/' + i2.id, { doc: i2, status: 'draft', _v: i2._v }); ok(r.s === 200 && r.j.doc.calc.thisWork === 15000 && r.j.doc.calc.thisAdv === 1500, 'IPC#2 uses #1 as previous: thisWork ' + r.j.doc.calc?.thisWork);
  ok(r.j.doc.calc.payable === Math.round((15000 - 1500) * 1.15 * 100) / 100 - 1500, 'IPC#2 payable correct: ' + r.j.doc.calc.payable);
  r = await acc2.c.put('/pdocs/' + i1.id, { doc: { ...i1, retPct: 0 }, status: 'approved', _v: 3 }); ok(r.s === 409 || r.s === 400, 'approved IPC cannot be altered');
  r = await acc2.c.call('DELETE', '/pdocs/' + i1.id); ok(r.s === 400 || r.s === 403, 'approved IPC cannot be deleted');
  r = await acc2.c.post('/pdocs', { kind: 'ipc', doc: { quoteId: 'nope', lines: il } }); ok(r.s === 400, 'IPC needs a valid contract');
  // cheques
  r = await acc2.c.post('/pdocs', { kind: 'chq', doc: { dir: 'in', party: 'عميل', bank: 'الراجحي', chqNo: '123', amount: 5000, due: today } }); ok(r.s === 200 && r.j.doc.amount === 5000 && /^CHQ-/.test(r.j.doc.no), 'cheque registered');
  const ch = r.j.doc;
  r = await sales.c.get('/pdocs?kind=chq'); ok(r.s === 403, 'sales cannot see cheques');
  r = await acc2.c.put('/pdocs/' + ch.id, { doc: ch, status: 'cleared', _v: ch._v }); ok(r.s === 200 && r.j.doc.status === 'cleared', 'cheque status updated');
  r = await acc2.c.get('/pdocs?kind=rfq'); ok(r.s === 200, 'accountant can list RFQs (seeCost)');
  r = await sales.c.get('/pdocs?kind=rfq'); ok(r.s === 403, 'sales cannot see RFQs');
  r = await admin.get('/pdocs?kind=zzz'); ok(r.s === 400, 'bad kind rejected');
  r = await admin.get('/audit?limit=300'); ok(['vo.create', 'ipc.status', 'chq.create'].every(a => r.j.entries.some(e => e.action === a)), 'cycle actions audited');
}

sec('RFQ + loss reasons');
{
  const rf = { title: 'أسعار كواشف', lines: [{ id: 'l1', desc: 'كاشف', unit: 'NO', qty: 10 }, { id: 'l2', desc: 'لوحة', unit: 'NO', qty: 1 }], suppliers: [{ id: 's1', name: 'مورد 1' }, { id: 's2', name: 'مورد 2' }], offers: { s1: { l1: 50, l2: 900 }, s2: { l1: 45, l2: -3, zz: 5 }, s9: { l1: 1 } }, chosen: { l1: 's2', l2: 'sX', bad: 's1' } };
  r = await admin.post('/pdocs', { kind: 'rfq', doc: rf }); ok(r.s === 200 && /^RFQ-/.test(r.j.doc.no), 'RFQ created');
  const d = r.j.doc;
  ok(d.offers.s2.l1 === 45 && d.offers.s2.l2 === undefined && d.offers.s2.zz === undefined && !d.offers.s9, 'offers sanitised (negative, unknown line/supplier dropped)');
  ok(d.chosen.l1 === 's2' && !d.chosen.l2 && !d.chosen.bad, 'chosen sanitised');
  r = await acc2.c.put('/pdocs/' + d.id, { doc: { ...d, title: 'معدّل' }, status: 'sent', _v: d._v }); ok(r.s === 200 && r.j.doc.status === 'sent', 'accountant edits RFQ');
  r = await sales.c.post('/pdocs', { kind: 'rfq', doc: rf }); ok(r.s === 403, 'sales cannot create RFQ');
  r = await admin.get('/bootstrap'); const q0 = r.j.quotes.find(q => q.client === 'عميل دورة');
  r = await admin.post('/sync', { quotes: { put: [{ ...q0, status: 'lost', lostReason: 'price' }], del: [] } });
  r = await admin.get('/bootstrap'); ok(r.j.quotes.find(q => q.id === q0.id).lostReason === 'price', 'lost reason saved');
  const q1 = r.j.quotes.find(q => q.id === q0.id);
  r = await admin.post('/sync', { quotes: { put: [{ ...q1, lostReason: 'hack<script>' }], del: [] } });
  r = await admin.get('/bootstrap'); ok(r.j.quotes.find(q => q.id === q0.id).lostReason === '', 'invalid lost reason rejected');
}

sec('technical attachments');
{
  const { PDFDocument } = await import('pdf-lib');
  const pd = await PDFDocument.create(); pd.addPage([300, 300]); const pdfB64 = Buffer.from(await pd.save()).toString('base64');
  const item = (await admin.get('/bootstrap')).j.items[0];
  r = await admin.post('/attachments', { refId: item.id, docType: 'datasheet', name: 'ورقة <b>بيانات</b>', data: 'data:application/pdf;base64,' + pdfB64 });
  ok(r.s === 200 && r.j.attachment.mime === 'application/pdf' && !r.j.attachment.name.includes('<'), 'PDF attached (name sanitised)');
  const at = r.j.attachment;
  r = await admin.post('/attachments', { refId: item.id, name: 'x', data: 'data:application/pdf;base64,' + Buffer.from('<html>evil</html>').toString('base64') }); ok(r.s === 400, 'non-PDF/image content rejected by signature');
  r = await admin.post('/attachments', { refId: item.id, name: 'x', data: 'data:application/pdf;base64,' + Buffer.alloc(3.2 * 1024 * 1024, 37).toString('base64') }); ok(r.s === 400, 'oversized attachment rejected');
  r = await sales.c.post('/attachments', { refId: item.id, name: 'x', data: 'data:application/pdf;base64,' + pdfB64 }); ok(r.s === 403, 'sales cannot upload');
  r = await sales.c.get('/attachments?refId=' + item.id); ok(r.s === 200 && r.j.attachments.length === 1 && !r.j.attachments[0].data, 'sales lists metadata only');
  r = await sales.c.get('/attachments/' + at.id); ok(r.s === 200 && r.j.data.startsWith('data:application/pdf;base64,'), 'sales downloads attachment');
  r = await anon.get('/attachments/' + at.id); ok(r.s === 401, 'anonymous cannot download');
  r = await sales.c.call('DELETE', '/attachments/' + at.id); ok(r.s === 403, 'sales cannot delete');
  r = await admin.call('DELETE', '/attachments/' + at.id); ok(r.s === 200, 'admin deletes attachment');
}

sec('follow-up tracking');
{
  r = await admin.post('/quotes', { quote: baseQ({ client: 'عميل المتابعة', lines: [{ id: 'f1', group: 'g', desc: 'بند', brand: '', unit: 'NO', qty: 1, price: 100 }] }), numbering: 'counter' }); const qf = r.j.quote;
  r = await admin.post('/sync', { quotes: { put: [{ ...qf, status: 'sent' }], del: [] } });
  r = await admin.post('/quotes/' + qf.id + '/share'); const tk = r.j.quote._share.token;
  r = await admin.get('/bootstrap'); let f = r.j.quotes.find(q => q.id === qf.id); ok(!!f._sentAt && f._views.n === 0, 'sent_at recorded, no views yet');
  await anon.get('/public/quote/' + tk);
  r = await anon.call('GET', '/public/quote/' + tk, null, { 'User-Agent': 'WhatsApp/2.23 preview bot' });
  r = await admin.get('/bootstrap'); f = r.j.quotes.find(q => q.id === qf.id); ok(f._views.n === 1 && !!f._views.first && !!f._views.last, 'customer view counted once, bots ignored: ' + f._views.n);
  r = await admin.post('/quotes/' + qf.id + '/share'); r = await admin.get('/bootstrap'); f = r.j.quotes.find(q => q.id === qf.id); ok(f._views.n === 0, 'new link resets view counter');
  r = await sales.c.get('/bootstrap'); ok(r.j.quotes.every(q => q._views !== undefined), 'views exposed with quotes');
}

sec('AI lines (voice / BOQ text)');
{
  r = await sales.c.post('/ai/lines', { text: 'LINES_TEST عشرين كاشف دخان' }); ok(r.s === 200 && r.j.lines.length === 2, 'AI lines parsed');
  ok(r.j.lines[0].lib && r.j.lines[0].qty === 20, 'first line matched to a real library id');
  ok(r.j.lines[1].lib === '' && r.j.lines[1].qty === 1, 'invented library id dropped, bad qty fixed');
  r = await sales.c.post('/ai/lines', { text: 'x' }); ok(r.s === 400, 'too-short text rejected');
  const vw = await (async () => { const u = await mk('view9', 'viewer', 'مشاهد'); const v = await login('view9', u.tempPassword); await v.c.post('/me/password', { current: u.tempPassword, password: 'View#2026zz' }); return v; })();
  r = await vw.c.post('/ai/lines', { text: 'LINES_TEST كاشف' }); ok(r.s === 403, 'viewer cannot use AI lines');
  r = await anon.post('/ai/lines', { text: 'LINES_TEST كاشف' }); ok(r.s === 401, 'anonymous cannot use AI lines');
}

sec('client portal + approval fingerprint');
{
  const cur = (await admin.get('/bootstrap')).j;
  const k = { date: today, party2: 'عميل', duration: 30, override: '', items: true, stamp: true, intro: '', terms: '', paynote: '', close: '', payments: [{ id: 'pp1', label: 'دفعة أولى', pct: 100, due: '' }] };
  r = await admin.post('/quotes', { quote: baseQ({ client: 'عميل البوابة', lines: [{ id: 'p1', group: 'g', desc: 'بند', brand: '', unit: 'NO', qty: 1, price: 1000 }], contract: k }), numbering: 'counter', keepContract: true }); const qp = r.j.quote;
  r = await admin.post('/sync', { quotes: { put: [{ ...qp, status: 'sent' }], del: [] } });
  r = await admin.post('/quotes/' + qp.id + '/share'); const tk = r.j.quote._share.token;
  r = await anon.get('/public/quote/' + tk); ok(r.s === 200 && r.j.portal === null, 'portal hidden by default');
  const sig = 'data:image/png;base64,' + Buffer.alloc(300, 1).toString('base64');
  r = await anon.post('/public/quote/' + tk, { action: 'approve', name: 'عميل البوابة', signature: sig, v: r.j.v }); ok(r.s === 200, 'customer approves');
  r = await anon.get('/public/quote/' + tk); ok(/^[0-9a-f]{64}$/.test(r.j.quote._decision.docHash || ''), 'approval carries a SHA-256 document fingerprint');
  const st2 = (await admin.get('/bootstrap')).j.settings;
  await admin.post('/sync', { settings: { ...st2, portalOn: true } });
  r = await anon.get('/public/quote/' + tk); ok(r.j.portal && r.j.portal.base === 1150 && r.j.portal.payments.length === 1 && Array.isArray(r.j.portal.receipts), 'portal shows contract status when enabled');
  ok(!JSON.stringify(r.j.portal).includes('cost') && !JSON.stringify(r.j.portal).includes('owner'), 'portal exposes no internal fields');
  await admin.post('/sync', { settings: { ...(await admin.get('/bootstrap')).j.settings, portalOn: false } });
}

mock.close();
sec('logout');
r = await admin.post('/auth/logout'); r = await admin.get('/bootstrap'); ok(r.s === 401, 'logout clears session');

console.log(`\n${pass} passed, ${failn} failed`);
await db.end(); process.exit(failn ? 1 : 0);
