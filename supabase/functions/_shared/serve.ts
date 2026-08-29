// ============================================================================
// _shared/serve.ts
// Deno bootstrap shared by all Edge Functions + safe structured logging.
// Keeping this in one module prevents duplicated server wiring.
// ============================================================================

import { redactValue } from "./redact.ts";
import type { EdgeEnv } from "./supabaseAdmin.ts";

export type EdgeHandler = (req: Request, env: EdgeEnv) => Promise<Response>;

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MASTER_ENCRYPTION_KEY",
  "MASTER_ENCRYPTION_KEY_ID",
  "FRONTEND_ORIGIN",
  "ALLOW_LOCAL_PROVIDER_URLS",
] as const;

interface DenoLike {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
}

function getDeno(): DenoLike | undefined {
  return (globalThis as { Deno?: DenoLike }).Deno;
}

/** Read the Edge Function environment into a typed object. */
export function readEnvFromDeno(deno: DenoLike): EdgeEnv {
  const env = {} as Record<string, string | undefined>;
  for (const key of ENV_KEYS) {
    env[key] = deno.env.get(key);
  }
  return env as unknown as EdgeEnv;
}

/**
 * Start the Deno.serve loop for an Edge Function handler.
 * No-op outside the Deno runtime (e.g. unit tests importing handlers).
 *
 * NOTE: intentionally does NOT gate on `import.meta.main` — the Supabase
 * Edge Runtime does not reliably mark the entrypoint as main when it
 * compiles the module, which left functions hanging with no bound server.
 * The runtime check on `Deno.serve` alone is both test-safe (Deno is
 * undefined under vitest) and production-correct.
 */
export function startServer(handler: EdgeHandler): void {
  const deno = getDeno();
  if (!deno?.serve) return;
  deno.serve((req: Request) => handler(req, readEnvFromDeno(deno)));
}

/** Structured, always-redacted log line. Safe for any payload. */
export function safeLog(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ event, ...(redactValue(data) as Record<string, unknown>) }));
  } catch {
    console.log(event);
  }
}
