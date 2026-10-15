import { row, rows, Q, pool } from './db';

export interface Actor { id?: string | null; username?: string | null; ip?: string | null }

/** Append an audit entry. Repeated autosaves of the same entity by the same user within 10 minutes collapse into one entry. */
export async function audit(a: Actor, action: string, entity: string | null, entityId: string | null, summary: string, detail: any = null, c: Q = pool, collapse = false) {
  try {
    if (collapse && a.id && entityId) {
      const last = await row(
        `select id from audit_log where user_id = $1 and action = $2 and entity_id = $3 and at > now() - interval '10 minutes' order by id desc limit 1`,
        [a.id, action, entityId], c);
      if (last) {
        await c.query('update audit_log set at = now(), summary = $2, detail = $3 where id = $1', [last.id, summary, detail]);
        return;
      }
    }
    await c.query(
      'insert into audit_log (user_id, username, action, entity, entity_id, summary, detail, ip) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [a.id || null, a.username || null, action, entity, entityId, summary, detail, a.ip || null]);
  } catch (e) {
    console.error('audit failed', e);
  }
}

export async function listAudit(opts: { limit?: number; before?: number; entity?: string; entityId?: string; user?: string; action?: string }) {
  const w: string[] = [], p: any[] = [];
  if (opts.before) { p.push(opts.before); w.push(`id < $${p.length}`); }
  if (opts.entity) { p.push(opts.entity); w.push(`entity = $${p.length}`); }
  if (opts.entityId) { p.push(opts.entityId); w.push(`entity_id = $${p.length}`); }
  if (opts.user) { p.push(opts.user); w.push(`username = $${p.length}`); }
  if (opts.action) { p.push(opts.action + '%'); w.push(`action like $${p.length}`); }
  p.push(Math.min(opts.limit || 100, 300));
  return rows(`select id, at, username, action, entity, entity_id, summary, ip from audit_log ${w.length ? 'where ' + w.join(' and ') : ''} order by id desc limit $${p.length}`, p);
}
