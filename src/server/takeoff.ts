import { rows, row } from '@/lib/db';
import { audit } from '@/lib/audit';
import { allow } from '@/lib/ratelimit';
import { bad, forbidden, notFound, Ctx, validId, num, str } from './http';

const actor = (c: Ctx) => ({ id: c.user!.id, username: c.user!.username, ip: c.ip });
const need = (c: Ctx) => { if (!c.user!.perms.takeoff) throw forbidden(); };
const MAX = 1_800_000;

/** Keep only the known top-level keys and cap sizes; inner structures are plain measurement data. */
export function cleanTakeoff(d: any) {
  const arr = (v: any, n: number) => (Array.isArray(v) ? v.slice(0, n) : []);
  const o = {
    files: arr(d?.files, 40), sheets: arr(d?.sheets, 400), marks: arr(d?.marks, 20000), meas: arr(d?.meas, 5000),
    assign: d?.assign && typeof d.assign === 'object' ? d.assign : {}, adopt: d?.adopt && typeof d.adopt === 'object' ? d.adopt : {},
    manual: d?.manual && typeof d.manual === 'object' ? d.manual : {}, consts: d?.consts && typeof d.consts === 'object' ? d.consts : {},
    vars: arr(d?.vars, 200), notes: str(d?.notes, 4000), sys: str(d?.sys, 60),
  };
  if (JSON.stringify(o).length > MAX) throw bad('بيانات الحصر كبيرة جداً، قسّم المشروع إلى أكثر من ملف حصر');
  return o;
}
const out = (r: any, full = false) => ({
  id: r.id, name: r.name, quoteId: r.quote_id || '', owner: r.owner_id, ownerName: r.owner_name || '', updated: r.updated_at, v: r.version,
  ...(full ? { data: r.data } : { n: (r.data?.marks || []).length }),
});
const SEL = `select t.*, u.full_name as owner_name from takeoffs t left join users u on u.id = t.owner_id`;

async function mine(c: Ctx, id: string) {
  if (!validId(id)) throw notFound();
  const r = await row(`${SEL} where t.id = $1`, [id]);
  if (!r) throw notFound();
  if (c.user!.perms.ownOnly && r.owner_id !== c.user!.id) throw notFound();
  return r;
}
export async function list(c: Ctx) {
  need(c);
  const own = c.user!.perms.ownOnly;
  return { takeoffs: (await rows(`${SEL} ${own ? 'where t.owner_id = $1' : ''} order by t.updated_at desc limit 300`, own ? [c.user!.id] : [])).map(r => out(r)) };
}
export async function get(c: Ctx) { need(c); return out(await mine(c, c.params.id), true); }
async function checkQuote(c: Ctx, qid: any) {
  if (!qid) return null;
  if (!validId(String(qid))) throw bad('عرض السعر غير صالح');
  const q = await row('select id, owner_id from quotes where id = $1', [String(qid)]);
  if (!q || (c.user!.perms.ownOnly && q.owner_id !== c.user!.id)) throw bad('عرض السعر غير موجود');
  return q.id;
}
export async function create(c: Ctx) {
  need(c);
  const name = str(c.body?.name, 200) || 'حصر جديد';
  const qid = await checkQuote(c, c.body?.quoteId);
  const r = await row('insert into takeoffs (owner_id, quote_id, name, data) values ($1,$2,$3,$4) returning id', [c.user!.id, qid, name, cleanTakeoff(c.body?.data || {})]);
  await audit(actor(c), 'takeoff.create', 'takeoff', r!.id, `إنشاء ملف حصر «${name}»`);
  return out(await mine(c, r!.id), true);
}
export async function save(c: Ctx) {
  need(c);
  const cur = await mine(c, c.params.id);
  if (c.body?.v !== cur.version) throw new (await import('./http')).HttpError(409, 'تم تعديل ملف الحصر من جهاز أو مستخدم آخر. أعد تحميل الصفحة.', 'conflict', { current: out(cur, true) });
  const name = c.body?.name === undefined ? cur.name : str(c.body.name, 200) || cur.name;
  const qid = c.body?.quoteId === undefined ? cur.quote_id : await checkQuote(c, c.body.quoteId);
  const data = c.body?.data === undefined ? cur.data : cleanTakeoff(c.body.data);
  const r = await row('update takeoffs set name=$2, quote_id=$3, data=$4, version=version+1, updated_at=now() where id=$1 returning version, updated_at', [cur.id, name, qid, data]);
  await audit(actor(c), 'takeoff.update', 'takeoff', cur.id, `تعديل ملف الحصر «${name}»`, null, undefined, true);
  return { v: r!.version, updated: r!.updated_at };
}
export async function remove(c: Ctx) {
  need(c);
  const cur = await mine(c, c.params.id);
  await row('delete from takeoffs where id = $1 returning id', [cur.id]);
  await audit(actor(c), 'takeoff.delete', 'takeoff', cur.id, `حذف ملف الحصر «${cur.name}»`);
  return { ok: true };
}

/* ---------- AI suggestions (vision) ---------- */
const AI_URL = () => process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export async function aiStatus(c: Ctx) { need(c); return { enabled: aiEnabled(), model: process.env.TAKEOFF_MODEL || 'claude-sonnet-5-5' }; }

export async function aiSuggest(c: Ctx) {
  need(c);
  if (!aiEnabled()) throw new (await import('./http')).HttpError(501, 'الاقتراح الذكي غير مفعّل. أضف المتغير ANTHROPIC_API_KEY في إعدادات Vercel.', 'ai_off');
  if (!(await allow(`ai:${c.user!.id}`, 40, 3600))) throw new (await import('./http')).HttpError(429, 'تجاوزت حد طلبات الاقتراح الذكي في الساعة', 'rate');
  const img = String(c.body?.image || '');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(img);
  if (!m) throw bad('صورة غير صالحة');
  if (m[2].length > 4_000_000) throw bad('الصورة كبيرة جداً');
  const vars = (Array.isArray(c.body?.vars) ? c.body.vars : []).slice(0, 40).map((v: any) => ({ id: str(v?.id, 24), name: str(v?.name, 120), hint: str(v?.hint, 300), kind: v?.kind === 'len' ? 'len' : 'count' })).filter((v: any) => v.id && v.name);
  if (!vars.length) throw bad('حدد المتغيرات المطلوب حصرها');
  const extra = str(c.body?.note, 1500);
  const prompt = `أنت مهندس حصر كميات خبير في مخططات الإنذار والإطفاء والسلامة (NFPA / SBC 801). المرفق صورة لمخطط.\n` +
    `المطلوب: حصر العناصر التالية فقط بدقة، بالاعتماد على مفتاح الرموز (Legend) إن وُجد في الصورة، وإلا بحسب الرموز القياسية. لا تخمّن عناصر غير ظاهرة.\n` +
    vars.map((v: any) => `- ${v.id}: ${v.name}${v.hint ? ' (' + v.hint + ')' : ''} [${v.kind === 'len' ? 'طول' : 'عدد'}]`).join('\n') +
    (extra ? `\nملاحظات المستخدم: ${extra}` : '') +
    `\nأعد JSON فقط بدون أي نص آخر بالشكل: {"scale_text":"نص مقياس الرسم إن وُجد أو null","legend_found":true|false,"items":[{"var":"المعرّف","count":عدد_صحيح,"points":[[x,y],...],"confidence":0..1}],"warnings":["..."]}` +
    `\nالنقاط إحداثيات نسبية بين 0 و1 (x من اليسار، y من الأعلى) لموضع كل رمز تقريباً. للأطوال أعد "length_hint" نصياً إن أمكن بدلاً من points.`;
  const body = { model: process.env.TAKEOFF_MODEL || 'claude-sonnet-5-5', max_tokens: 6000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: prompt }] }] };
  let resp: Response;
  try {
    resp = await fetch(AI_URL(), { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body), signal: AbortSignal.timeout(55_000) });
  } catch { throw new (await import('./http')).HttpError(504, 'انتهت مهلة الاقتراح الذكي، جرّب صورة أصغر أو قسّم المخطط', 'ai_timeout'); }
  if (!resp.ok) { console.error('AI error', resp.status, (await resp.text()).slice(0, 300)); throw new (await import('./http')).HttpError(502, 'تعذر الحصول على اقتراح من الخدمة الذكية', 'ai_fail'); }
  const j: any = await resp.json();
  const text = (j.content || []).map((x: any) => x.text || '').join('');
  const mm = /\{[\s\S]*\}/.exec(text);
  let parsed: any = null;
  try { parsed = mm ? JSON.parse(mm[0]) : null; } catch { parsed = null; }
  if (!parsed || !Array.isArray(parsed.items)) throw new (await import('./http')).HttpError(502, 'ردّ غير مفهوم من الخدمة الذكية، أعد المحاولة', 'ai_parse');
  const ids = new Set(vars.map((v: any) => v.id));
  const items = parsed.items.filter((i: any) => ids.has(i?.var)).map((i: any) => ({
    var: i.var, count: Math.max(0, Math.min(100000, Math.round(num(i.count)))), confidence: Math.max(0, Math.min(1, num(i.confidence, 0.5))),
    points: (Array.isArray(i.points) ? i.points : []).slice(0, 2000).filter((p: any) => Array.isArray(p) && p.length === 2).map((p: any) => [Math.max(0, Math.min(1, num(p[0]))), Math.max(0, Math.min(1, num(p[1])))]),
    length_hint: str(i.length_hint, 120),
  }));
  await audit(actor(c), 'takeoff.ai', 'takeoff', null, `طلب اقتراح ذكي (${vars.length} متغير)`, null, undefined, true);
  return { scale_text: str(parsed.scale_text, 80), legend_found: !!parsed.legend_found, items, warnings: (Array.isArray(parsed.warnings) ? parsed.warnings : []).slice(0, 10).map((w: any) => str(w, 300)) };
}
