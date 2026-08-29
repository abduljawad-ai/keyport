// Edge Function HTTP client.
//
// All secret-related operations and all AI provider calls go through
// Supabase Edge Functions — never directly from the browser.
//
// SECURITY rules honored here:
//   * every request carries Authorization: Bearer <session access token>
//   * API keys are only ever sent to save-api-key / test-api-key
//   * errors are parsed from the standard envelope and normalized
//   * nothing is persisted; plaintext keys never live beyond form state

import { supabase } from "@/shared/supabase/client";
import { AppError, normalizeError } from "@/shared/lib/errors";
import { isMockMode } from "@/shared/supabase/mockMode";
import { mockEdgeFetch, mockEdgeStreamRequest } from "@/shared/api/mockEdgeApi";

/** Base URL of the Edge Functions; derived when not explicitly configured. */
export function getFunctionsBaseUrl(): string {
  const explicit = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, "");
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  return `${base}/functions/v1`;
}

/** Current session access token; throws `unauthorized` when signed out. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new AppError("unauthorized", "Your session expired. Please sign in again.");
  }
  return token;
}

export interface EdgeRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

interface EdgeFetchInit {
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

async function buildEdgeRequest(
  path: string,
  options: EdgeRequestOptions,
): Promise<{ url: string; init: EdgeFetchInit }> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...options.headers,
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  return {
    url: `${getFunctionsBaseUrl()}/${path}`,
    init: { method: options.method ?? "POST", headers, body, signal: options.signal },
  };
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Perform an Edge Function request and parse the JSON response.
 * Throws AppError with the server-provided safe message on failure.
 */
export async function edgeFetch<T>(path: string, options: EdgeRequestOptions = {}): Promise<T> {
  if (isMockMode()) {
    return mockEdgeFetch(path, {
      method: options.method ?? "POST",
      body: options.body,
      signal: options.signal,
      headers: options.headers,
    }) as Promise<T>;
  }

  const { url, init } = await buildEdgeRequest(path, options);

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    if (isAbort(err)) throw new AppError("aborted", "The request was cancelled.");
    throw new AppError("network_error", "Network error. Check your connection and try again.");
  }

  const text = await response.text().catch(() => "");
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    const normalized = parsed !== undefined ? normalizeError(parsed) : null;
    if (normalized && normalized.code !== "unknown_error" && normalized.code !== "internal_error") {
      throw normalized;
    }
    // Non-JSON or unknown failure: keep the safe generic message.
    throw new AppError(
      response.status === 401 ? "unauthorized" : "internal_error",
      response.status === 401
        ? "Your session expired. Please sign in again."
        : "Something went wrong. Please try again.",
      { status: response.status },
    );
  }

  return parsed as T;
}

/**
 * Open a streaming Edge Function request (SSE).
 * Returns the raw Response for stream consumption; throws AppError when the
 * function answers with a JSON error (errors before streaming starts).
 */
export async function edgeStreamRequest(
  path: string,
  options: EdgeRequestOptions,
): Promise<Response> {
  if (isMockMode()) {
    return mockEdgeStreamRequest(path, {
      method: options.method ?? "POST",
      body: options.body,
      signal: options.signal,
      headers: { Accept: "text/event-stream", ...options.headers },
    });
  }

  const { url, init } = await buildEdgeRequest(path, {
    ...options,
    headers: { Accept: "text/event-stream", ...options.headers },
  });

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    if (isAbort(err)) throw new AppError("aborted", "The request was cancelled.");
    throw new AppError("network_error", "Network error. Check your connection and try again.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/event-stream")) {
    // Error phase: the function answered with a JSON error envelope.
    const text = await response.text().catch(() => "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    const normalized = parsed !== undefined ? normalizeError(parsed) : null;
    if (normalized && normalized.code !== "unknown_error" && normalized.code !== "internal_error") {
      throw normalized;
    }
    throw new AppError(
      response.status === 401 ? "unauthorized" : "internal_error",
      "Something went wrong. Please try again.",
      { status: response.status },
    );
  }

  if (!response.body) {
    throw new AppError("internal_error", "The server returned an empty stream.");
  }
  return response;
}
