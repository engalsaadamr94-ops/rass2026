import { Pool, PoolClient, QueryResultRow, types } from 'pg';

// dates stay plain 'YYYY-MM-DD' strings, numerics become numbers
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(1700, (v: string) => parseFloat(v));
types.setTypeParser(20, (v: string) => parseInt(v, 10));

const g = globalThis as unknown as { __rassPool?: Pool };
export const pool: Pool =
  g.__rassPool ||
  (g.__rassPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  }));

export type Q = { query: PoolClient['query'] } | Pool;

export async function rows<T extends QueryResultRow = any>(text: string, params: any[] = [], c: Q = pool): Promise<T[]> {
  return (await c.query(text, params)).rows as T[];
}
export async function row<T extends QueryResultRow = any>(text: string, params: any[] = [], c: Q = pool): Promise<T | null> {
  return (await rows<T>(text, params, c))[0] || null;
}
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
