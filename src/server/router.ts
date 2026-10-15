import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { clientIp } from '@/lib/auth';
import { HttpError, Ctx, Handler, json, readBody, csrfCheck, forbidden } from './http';
import * as A from './authroutes';
import * as D from './data';
import * as M from './admin';
import * as P from './publicq';
import * as PD from './projdocs';
import * as AT from './attach';
import * as AQ from './aiquote';
import * as T from './takeoff';
import * as X from './docs';
import { cronBackup, cronMonthly } from './cron';

type Auth = 'public' | 'user' | 'any' | ((u: NonNullable<Ctx['user']>) => boolean);
interface Route { method: string; re: RegExp; keys: string[]; auth: Auth; h: Handler; allowMustChange?: boolean; cron?: boolean }
const routes: Route[] = [];
function r(method: string, path: string, auth: Auth, h: Handler, o: { allowMustChange?: boolean; cron?: boolean } = {}) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, auth, h, ...o });
}
const admin = (u: any) => u.role === 'admin';

// auth
r('POST', '/auth/login', 'public', A.login);
r('POST', '/auth/logout', 'any', A.logout, { allowMustChange: true });
r('POST', '/auth/forgot', 'public', A.forgot);
r('POST', '/auth/reset', 'public', A.reset);
r('GET', '/auth/reset-check', 'public', A.resetTokenCheck);
r('GET', '/setup/status', 'public', A.setupStatus);
r('POST', '/setup', 'public', A.setup);
r('GET', '/me', 'user', A.me, { allowMustChange: true });
r('POST', '/me/password', 'user', A.changePassword, { allowMustChange: true });

// data
r('GET', '/bootstrap', 'user', D.bootstrap);
r('POST', '/sync', 'user', D.sync);
r('POST', '/quotes', 'user', D.createQuote);
r('POST', '/quotes/:id/approval', admin, D.approveDiscount);
r('POST', '/quotes/:id/approval-request', 'user', D.requestApproval);
r('GET', '/approvals', admin, D.pendingApprovals);
r('POST', '/quotes/:id/share', 'user', D.createShare);
r('DELETE', '/quotes/:id/share', 'user', D.revokeShare);
r('POST', '/receipts', 'user', D.createReceipt);
r('POST', '/receipts/:id/void', 'user', D.voidReceipt);
r('PUT', '/counters', admin, D.setCounters);
r('POST', '/items/std', 'user', D.addStdItems);
r('GET', '/takeoffs', 'user', T.list);
r('POST', '/takeoffs', 'user', T.create);
r('GET', '/takeoffs/:id', 'user', T.get);
r('PUT', '/takeoffs/:id', 'user', T.save);
r('DELETE', '/takeoffs/:id', 'user', T.remove);
r('GET', '/takeoff-ai/status', 'user', T.aiStatus);
r('POST', '/takeoff-ai', 'user', T.aiSuggest);

r('GET', '/invoices', 'user', X.invList);
r('POST', '/invoices', 'user', X.invCreate);
r('GET', '/agreements', 'user', X.agList);
r('POST', '/agreements', 'user', X.agCreate);
r('PUT', '/agreements/:id', 'user', X.agSave);
r('DELETE', '/agreements/:id', 'user', X.agDelete);
r('POST', '/ai/lines', 'user', AQ.aiLines);
r('GET', '/attachments', 'user', AT.attList);
r('GET', '/attachments/:id', 'user', AT.attGet);
r('POST', '/attachments', 'user', AT.attCreate);
r('DELETE', '/attachments/:id', 'user', AT.attDelete);
r('GET', '/pdocs', 'user', PD.pdList);
r('POST', '/pdocs', 'user', PD.pdCreate);
r('PUT', '/pdocs/:id', 'user', PD.pdSave);
r('DELETE', '/pdocs/:id', 'user', PD.pdDelete);

// admin
r('GET', '/users', admin, A.listUsers);
r('POST', '/users', admin, A.createUser);
r('PUT', '/users/:id', admin, A.updateUser);
r('POST', '/users/:id/reset-password', admin, A.adminReset);
r('POST', '/users/:id/unlock', admin, A.unlockUser);
r('GET', '/audit', admin, M.auditList);
r('GET', '/backups', admin, M.listBackups);
r('POST', '/backups', admin, M.manualBackup);
r('GET', '/backups/:id', admin, M.downloadBackup);
r('GET', '/export', admin, M.liveExport);
r('POST', '/import', admin, M.importData);
r('GET', '/reports/monthly', 'user', M.reportRoute);

// public + cron
r('GET', '/public/quote/:token', 'public', P.publicGet);
r('POST', '/public/quote/:token', 'public', P.publicDecide);
r('GET', '/cron/backup', 'public', cronBackup, { cron: true });
r('GET', '/cron/monthly', 'public', cronMonthly, { cron: true });

export async function dispatch(req: NextRequest, segs: string[]): Promise<NextResponse | Response> {
  const path = '/' + segs.join('/');
  try {
    const route = routes.find(x => x.method === req.method && x.re.test(path));
    if (!route) {
      if (routes.some(x => x.re.test(path))) return json({ error: 'الطريقة غير مسموحة' }, 405);
      return json({ error: 'غير موجود' }, 404);
    }
    if (!route.cron) csrfCheck(req);
    const user = await getSession(req);
    if (route.auth !== 'public') {
      if (!user) throw new HttpError(401, 'انتهت الجلسة، سجّل الدخول مرة أخرى', 'unauth');
      if (typeof route.auth === 'function' && !route.auth(user)) throw forbidden();
      if (user.must_change && !route.allowMustChange) throw new HttpError(403, 'يجب تغيير كلمة المرور أولاً', 'must_change');
    }
    const m = route.re.exec(path)!;
    const params: Record<string, string> = {};
    route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const ctx: Ctx = { req, user, params, query: req.nextUrl.searchParams, ip: clientIp(req), body: await readBody(req) };
    const out = await route.h(ctx);
    return out instanceof Response ? out : json(out);
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code, ...(e.extra || {}) }, e.status);
    console.error('API error', req.method, path, e);
    return json({ error: 'حدث خطأ في الخادم، حاول مرة أخرى' }, 500);
  }
}
