import { row } from './db';

/** Fixed-window counter in Postgres. Returns true when the call is allowed. */
export async function allow(key: string, max: number, windowSec: number): Promise<boolean> {
  const r = await row(
    `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count`, [key, windowSec]);
  return !!r && r.count <= max;
}
