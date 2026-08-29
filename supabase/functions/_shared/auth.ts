// ============================================================================
// _shared/auth.ts
// Request authentication for Edge Functions.
//
// Identity comes ONLY from the verified access token:
//   Authorization: Bearer <supabase_access_token>
// Body/query-supplied user IDs are never trusted.
// ============================================================================

import { appError } from "./errors.ts";
import type { EdgeEnv, FetchImpl } from "./supabaseAdmin.ts";
import { assertServerConfigured } from "./supabaseAdmin.ts";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const token = match[1];
  // Sanity bound — JWTs are far shorter than this. Reject absurd input.
  if (!token || token.length < 20 || token.length > 8192) return null;
  return token;
}

/**
 * Verify the bearer token against Supabase Auth (GoTrue) and return the
 * authenticated user. Throws `unauthorized` on any failure — fails closed.
 */
export async function authenticate(
  req: Request,
  env: EdgeEnv,
  fetchImpl: FetchImpl = fetch,
): Promise<AuthenticatedUser> {
  assertServerConfigured(env);

  const token = extractBearerToken(req);
  if (!token) {
    throw appError("unauthorized", "Authentication is required.");
  }

  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetchImpl(`${base}/auth/v1/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
  } catch {
    throw appError("unauthorized", "Authentication is required.", {
      internalMessage: "auth verification request failed",
    });
  }

  if (!response.ok) {
    await response.text().catch(() => "");
    throw appError("unauthorized", "Authentication is required.", {
      internalMessage: `auth verification returned ${response.status}`,
    });
  }

  let user: { id?: string; sub?: string; email?: string };
  try {
    user = (await response.json()) as { id?: string; sub?: string; email?: string };
  } catch {
    throw appError("unauthorized", "Authentication is required.");
  }

  const id = user.id ?? user.sub;
  if (!id || typeof id !== "string") {
    throw appError("unauthorized", "Authentication is required.");
  }

  return { id, email: typeof user.email === "string" ? user.email : undefined };
}
