// ============================================================================
// _shared/rateLimit.ts
// Persistent per-user rate limiting backed by Postgres.
//
// In-memory limiting is insufficient for Edge Functions (isolates are
// ephemeral), so counters live in the rate_limit_buckets table and are
// incremented atomically by the increment_rate_limit() SQL function.
// ============================================================================

import { appError } from "./errors.ts";
import type { AdminClient } from "./supabaseAdmin.ts";
import { rpc } from "./supabaseAdmin.ts";

export interface RateLimitConfig {
  action: string;
  limit: number;
  windowSeconds: number;
}

/** Conservative per-user limits for sensitive operations. */
export const RATE_LIMITS: Record<
  "saveApiKey" | "testApiKey" | "chat" | "listModels",
  RateLimitConfig
> = {
  saveApiKey: { action: "save-api-key", limit: 10, windowSeconds: 3600 },
  testApiKey: { action: "test-api-key", limit: 20, windowSeconds: 3600 },
  listModels: { action: "list-models", limit: 60, windowSeconds: 3600 },
  chat: { action: "chat", limit: 120, windowSeconds: 3600 },
};

export interface RateLimitCheckResult {
  allowed: boolean;
  counter: number;
  retryAfterSeconds: number;
}

/** Check and consume one unit from the user's bucket for this action. */
export async function checkRateLimit(
  admin: AdminClient,
  userId: string,
  config: RateLimitConfig,
): Promise<RateLimitCheckResult> {
  const bucket = `${config.action}:${userId}`;
  let result: Array<{ new_counter: number; window_start: string }>;
  try {
    result = await rpc<Array<{ new_counter: number; window_start: string }>>(
      admin,
      "increment_rate_limit",
      { p_bucket: bucket, p_window_seconds: config.windowSeconds },
    );
  } catch {
    // If the limiter itself is broken we fail CLOSED for sensitive
    // endpoints rather than allowing unlimited traffic.
    return { allowed: false, counter: 0, retryAfterSeconds: config.windowSeconds };
  }
  const row = result?.[0];
  if (!row) {
    return { allowed: false, counter: 0, retryAfterSeconds: config.windowSeconds };
  }

  const allowed = row.new_counter <= config.limit;
  let retryAfterSeconds = 0;
  if (!allowed) {
    const windowStart = Date.parse(row.window_start);
    const elapsedSeconds = Number.isFinite(windowStart)
      ? Math.max(0, (Date.now() - windowStart) / 1000)
      : config.windowSeconds;
    retryAfterSeconds = Math.max(1, Math.ceil(config.windowSeconds - elapsedSeconds));
  }
  return { allowed, counter: row.new_counter, retryAfterSeconds };
}

/** Throws a `rate_limited` AppError when the user exceeded their budget. */
export async function enforceRateLimit(
  admin: AdminClient,
  userId: string,
  config: RateLimitConfig,
): Promise<void> {
  const result = await checkRateLimit(admin, userId, config);
  if (!result.allowed) {
    throw appError("rate_limited", "Too many requests. Please slow down.", {
      details: { retry_after_seconds: result.retryAfterSeconds },
    });
  }
}
