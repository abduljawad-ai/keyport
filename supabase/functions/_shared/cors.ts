// ============================================================================
// _shared/cors.ts
// Fail-closed CORS handling for every Edge Function.
//
// Rules:
//   * only origins listed in FRONTEND_ORIGIN (comma-separated) are allowed
//   * if FRONTEND_ORIGIN is missing/empty, every cross-origin request
//     (i.e. any request carrying an Origin header) is rejected
//   * wildcard "*" is never used
//   * OPTIONS preflight is answered with exactly the allowed surface
// ============================================================================

import { appError, errorResponse } from "./errors.ts";

export interface CorsEnv {
  FRONTEND_ORIGIN?: string;
}

export function getAllowedOrigins(env: CorsEnv): string[] {
  return (env.FRONTEND_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Returns the allowed origin for this request, or null. */
export function matchAllowedOrigin(req: Request, env: CorsEnv): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const allowed = getAllowedOrigins(env);
  return allowed.includes(origin) ? origin : null;
}

export function corsResponseHeaders(origin: string, methods: string[]): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": methods.join(", "),
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-Id",
    "Access-Control-Max-Age": "600",
  };
}

/**
 * Pre-request CORS gate.
 * Returns a Response when the request must stop here (rejected origin or
 * completed preflight), or null when the handler should continue.
 */
export function handleCorsPreflight(
  req: Request,
  env: CorsEnv,
  methods: string[],
): Response | null {
  const origin = req.headers.get("origin");

  if (origin) {
    const allowed = matchAllowedOrigin(req, env);
    if (!allowed) {
      // Fail closed: unknown or unconfigured origin.
      return errorResponse(
        appError("forbidden", "Origin not allowed."),
        undefined,
        { Vary: "Origin" },
      );
    }
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsResponseHeaders(allowed, methods),
      });
    }
  } else if (req.method === "OPTIONS") {
    // Non-browser preflight without Origin: answer without CORS grants.
    return new Response(null, { status: 204, headers: { Vary: "Origin" } });
  }

  return null;
}

/** Attach CORS response headers (when applicable) to an outgoing response. */
export function finalizeCors(
  response: Response,
  req: Request,
  env: CorsEnv,
): Response {
  const origin = req.headers.get("origin");
  if (!origin) return response;
  const allowed = matchAllowedOrigin(req, env);
  if (!allowed) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", allowed);
  headers.append("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
