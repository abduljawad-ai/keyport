// ============================================================================
// _shared/providers/types.ts
// Provider adapter contracts + shared HTTP utilities.
// Adapters normalize upstream provider formats into app-level chunks and
// never log secrets. Errors are mapped to safe application error codes.
// ============================================================================

import { AppError, mapProviderHttpError, type ErrorCode } from "../errors.ts";
import type { ProviderId } from "../validation.ts";

export type { ProviderId };

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
}

export type TestResult =
  | { ok: true; message?: string }
  | { ok: false; code: string; message: string };

export type NormalizedStreamChunk =
  | { type: "text_delta"; text: string }
  | { type: "usage"; input_tokens?: number; output_tokens?: number }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export interface ProviderChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ProviderChatParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
}

export interface StreamChatRequest {
  model: string;
  messages: ProviderChatMessage[];
  params?: ProviderChatParams;
  signal: AbortSignal;
}

export interface ProviderAdapterOptions {
  /** Injectable fetch for tests / SSRF-guarded fetching. */
  fetchImpl?: typeof fetch;
  /** Allow http:// loopback base URLs (development only). */
  allowLocalUrls?: boolean;
  /** Injectable DNS resolver for SSRF validation. */
  resolveDns?: (hostname: string) => Promise<string[]>;
}

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  testConnection(credentials: ProviderCredentials): Promise<TestResult>;
  streamChat(
    request: StreamChatRequest,
    credentials: ProviderCredentials,
  ): AsyncIterable<NormalizedStreamChunk>;
}

// --- shared error plumbing ----------------------------------------------------

/** Error thrown for provider failures; carries a safe, mapped code. */
export class ProviderRequestError extends Error {
  readonly code: ErrorCode;
  readonly isAuthFailure: boolean;

  constructor(code: ErrorCode, message: string, isAuthFailure = false) {
    super(message);
    this.name = "ProviderRequestError";
    this.code = code;
    this.isAuthFailure = isAuthFailure;
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")
  ) || (err instanceof Error && err.name === "AbortError");
}

export async function safeReadText(response: Response, maxChars = 4096): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}

/**
 * Convert a non-2xx provider response into a ProviderRequestError with a
 * safe, sanitized message.
 */
export async function throwForProviderResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const bodyText = await safeReadText(response);
  const mapped = mapProviderHttpError(response.status, bodyText);
  throw new ProviderRequestError(mapped.code, mapped.message, mapped.isAuthFailure);
}

/** Combine the caller abort signal with the provider request timeout. */
export function withTimeout(signal: AbortSignal, timeoutMs: number): AbortSignal {
  try {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  } catch {
    return signal;
  }
}

/** Map an unknown thrown value from a provider call to a safe chunk/error. */
export function toSafeProviderError(err: unknown): { code: string; message: string } {
  if (err instanceof ProviderRequestError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof AppError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof TypeError) {
    return { code: "provider_error", message: "Could not reach the provider." };
  }
  return {
    code: "provider_error",
    message: "The provider request failed.",
  };
}
