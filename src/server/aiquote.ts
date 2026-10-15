import { rows } from '@/lib/db';
import { audit } from '@/lib/audit';
import { allow } from '@/lib/ratelimit';
import { bad, forbidden, Ctx, num, str, HttpError } from './http';
import { aiEnabled } from './takeoff';

const AI_URL = () => process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';

/** Turns spoken / pasted / BOQ text into draft quote lines matched against the item library. The user always reviews the result. */
export async function aiLines(c: Ctx) {
  const u = c.user!; if (u.perms.quotesWrite === 'none') throw forbidden();
  if (!aiEnabled()) throw new HttpError(501, 'التحليل الذكي غير مفعّل. أضف المتغير ANTHROPIC_API_KEY في إعدادات Vercel، أو استخدم المطابقة المحلية.', 'ai_off');
  if (!(await allow(`ailines:${u.id}`, 60, 3600))) throw new HttpError(429, 'تجاوزت حد الطلبات في الساعة', 'rate');
  const text = str(c.body?.text, 8000).trim(); if (text.length < 3) throw bad('اكتب أو أملِ نصاً أولاً');
  const items = (await rows('select id, data from items order by seq limit 600')).map((r: any) => ({ id: r.id, d: String(r.data.desc || '').slice(0, 140), b: String(r.data.brand || '').slice(0, 40), u: String(r.data.unit || '').slice(0, 10) }));
  const prompt = `أنت مساعد تسعير لشركة مقاولات أنظمة أمن وسلامة في السعودية. حوّل النص التالي (إملاء صوتي أو طلب عميل أو جدول كميات) إلى بنود عرض سعر.\n` +
    `مكتبة الأصناف (معرّف|وصف|نوع|وحدة):\n${items.map(i => `${i.id}|${i.d}|${i.b}|${i.u}`).join('\n')}\n\n` +
    `النص:\n"""${text}"""\n\n` +
    `القواعد: لكل بند في النص أعد كائناً {"desc":"الوصف","qty":رقم,"unit":"الوحدة","lib":"معرّف الصنف الأقرب من المكتبة أو فارغ إن لم يوجد تطابق مقبول","note":"ملاحظة قصيرة إن كان التطابق غير مؤكد"}. ` +
    `لا تخترع أصنافاً ولا معرّفات؛ استخدم المعرّفات المذكورة أعلاه فقط. لا تضع أسعاراً. إن لم تكن الكمية مذكورة فاجعلها 1. أعد مصفوفة JSON فقط دون أي نص آخر.`;
  let resp: Response;
  try {
    resp = await fetch(AI_URL(), { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: process.env.TAKEOFF_MODEL || 'claude-sonnet-5-5', max_tokens: 4000, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }] }), signal: AbortSignal.timeout(50_000) });
  } catch { throw new HttpError(504, 'انتهت مهلة التحليل الذكي، جرّب نصاً أقصر', 'ai_timeout'); }
  if (!resp.ok) { console.error('AI lines error', resp.status, (await resp.text()).slice(0, 300)); throw new HttpError(502, 'تعذر الحصول على نتيجة من الخدمة الذكية', 'ai_fail'); }
  const j: any = await resp.json(); const out = (j.content || []).map((x: any) => x.text || '').join(''); const mm = /\[[\s\S]*\]/.exec(out);
  let arr: any = null; try { arr = mm ? JSON.parse(mm[0]) : null; } catch { arr = null; }
  if (!Array.isArray(arr)) throw new HttpError(502, 'ردّ غير مفهوم من الخدمة الذكية، أعد المحاولة', 'ai_parse');
  const ids = new Set(items.map(i => i.id));
  const lines = arr.slice(0, 80).map((l: any) => ({ desc: str(l?.desc, 300).trim(), qty: Math.max(0, Math.min(1_000_000, num(l?.qty, 1))) || 1, unit: str(l?.unit, 20).trim(), lib: ids.has(String(l?.lib)) ? String(l.lib) : '', note: str(l?.note, 200) })).filter((l: any) => l.desc);
  await audit({ id: u.id, username: u.username, ip: c.ip }, 'quote.ai_lines', 'quote', null, `تحليل ذكي لنص إلى ${lines.length} بند`, null, undefined, true);
  return { lines };
}
