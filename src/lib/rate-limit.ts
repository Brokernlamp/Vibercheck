import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

/**
 * Fixed-window limiter backed by Postgres. It is safe across app and worker
 * processes and survives restarts. Use only derived keys (email hash, user id,
 * tenant id) so raw PII does not live in the table.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await db.execute(sql`
    select count, window_start
    from rate_limits
    where key = ${key}
    limit 1
  `);
  const row = rows[0] as { count?: number; window_start?: unknown } | undefined;
  if (!row) {
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
  const count = Number(row.count ?? 0);
  const windowStart = toDate(row.window_start);
  const elapsed = (Date.now() - windowStart.getTime()) / 1000;
  if (elapsed >= windowSeconds) {
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count),
    retryAfter: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  };
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(
    now.getTime() - windowSeconds * 1000,
  ).toISOString();
  const rows = await db.execute(sql`
    insert into rate_limits (key, count, window_start, updated_at)
    values (${key}, 1, ${nowIso}::timestamptz, ${nowIso}::timestamptz)
    on conflict (key) do update set
      count = case
        when rate_limits.window_start <= ${cutoffIso}::timestamptz then 1
        else rate_limits.count + 1
      end,
      window_start = case
        when rate_limits.window_start <= ${cutoffIso}::timestamptz then ${nowIso}::timestamptz
        else rate_limits.window_start
      end,
      updated_at = ${nowIso}::timestamptz
    returning count, window_start
  `);
  const row = rows[0] as { count?: number; window_start?: unknown };
  const count = Number(row?.count ?? limit + 1);
  const windowStart = toDate(row?.window_start ?? now);
  const remaining = Math.max(0, limit - count);
  return {
    allowed: count <= limit,
    remaining,
    retryAfter:
      count <= limit
        ? 0
        : Math.max(
            1,
            Math.ceil(windowSeconds - (Date.now() - windowStart.getTime()) / 1000),
          ),
  };
}

export async function clearRateLimit(key: string): Promise<void> {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}

export async function cleanupRateLimits(): Promise<void> {
  await db.execute(
    sql`delete from rate_limits where updated_at < now() - interval '7 days'`,
  );
}
