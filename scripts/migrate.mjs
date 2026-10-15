// Idempotent SQL migrations. Runs during `npm run build` (Vercel) and can be run by hand.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.VERCEL || process.env.CI) { console.error('DATABASE_URL is not set'); process.exit(1); }
  console.warn('[migrate] DATABASE_URL not set, skipping.'); process.exit(0);
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  await c.query('select pg_advisory_lock(727001)');
  await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await c.query('select name from schema_migrations')).rows.map(r => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    console.log('[migrate] applying', f);
    await c.query('begin');
    try {
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await c.query('insert into schema_migrations(name) values ($1)', [f]);
      await c.query('commit');
    } catch (e) { await c.query('rollback'); throw e; }
  }
  console.log('[migrate] up to date');
} finally {
  await c.query('select pg_advisory_unlock(727001)').catch(() => {});
  await c.end();
}
