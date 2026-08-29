// ============================================================================
// _shared/errors.ts
// Standard error model for all Edge Functions.
// Rules enforced here:
//   * every non-streaming error uses { error: { code, message, details } }
//   * messages never contain secrets, ciphertext, or upstream headers
//   * upstream provider errors are sanitized before surfacing
// ============================================================================

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation_error"
  | "not_found"
  | "missing_api_key"
  | "invalid_api_key"
  | "decryption_failed"
  | "provider_error"
  | "rate_limited"
  | "model_not_supported"
  | "internal_error";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  validation_error: 400,
  not_found: 404,
  missing_api_key: 400,
  invalid_api_key: 400,
  decryption_failed: 500,
  provider_error: 502,
  rate_limited: 429,
  model_not_supported: 400,
  internal_error: 500,
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "Authentication is required.",
  forbidden: "This request is not allowed.",
  validation_error: "The request is invalid.",
  not_found: "The requested resource was not found.",
  missing_api_key: "No API key is available for this provider.",
  invalid_api_key: "The provider rejected the API key.",
  decryption_failed: "The stored key could not be decrypted.",
  provider_error: "The AI provider request failed.",
  rate_limited: "Too many requests. Please slow down.",
  model_not_supported: "The selected model is not supported.",
  internal_error: "Something went wrong. Please try again.",
};

export interface ErrorDetails {
  request_id?: string;
  retry_after_seconds?: number;
  fields?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Application error carrying a safe, client-visible message.
 * `internalMessage` (never sent to the client) may carry extra context
 * for redacted server logs.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetails;
  readonly internalMessage?: string;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { status?: number; details?: ErrorDetails; internalMessage?: string },
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? ERROR_STATUS[code];
    this.details = options?.details;
    this.internalMessage = options?.internalMessage;
  }
}

export function appError(
  code: ErrorCode,
  message?: string,
  options?: { status?: number; details?: ErrorDetails; internalMessage?: string },
): AppError {
  return new AppError(code, message, options);
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
}

export function errorBody(
  code: ErrorCode,
  message?: string,
  details?: ErrorDetails,
): ErrorEnvelope {
  return {
    error: {
      code,
      message: message ?? DEFAULT_MESSAGES[code],
      ...(details && Object.keys(details).length > 0 ? { details } : {}),
    },
  };
}

/** Build a JSON error Response from any thrown value. Fails closed. */
export function errorResponse(
  err: unknown,
  requestId?: string,
  extraHeaders?: Record<string, string>,
): Response {
  let code: ErrorCode = "internal_error";
  let message = DEFAULT_MESSAGES.internal_error;
  let status = 500;
  let details: ErrorDetails | undefined;

  if (err instanceof AppError) {
    code = err.code;
    message = err.message;
    status = err.status;
    details = err.details;
  } else if (err instanceof SyntaxError) {
    code = "validation_error";
    message = "The request body is not valid JSON.";
    status = 400;
  }

  if (requestId) {
    details = { ...details, request_id: requestId };
  }

  // Never leak retry-after unless it was intentionally produced.
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  };
  if (code === "rate_limited" && typeof details?.retry_after_seconds === "number") {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(details.retry_after_seconds)));
  }
  if (requestId) headers["x-request-id"] = requestId;

  return new Response(JSON.stringify(errorBody(code, message, details)), {
    status,
    headers,
  });
}

/**
 * Map an upstream provider HTTP failure to a safe application error.
 * The raw body is truncated and redacted before any part of it is kept.
 */
export function mapProviderHttpError(
  status: number,
  bodyText: string,
): { code: ErrorCode; message: string; isAuthFailure: boolean } {
  const safeDetail = extractSafeProviderMessage(bodyText);

  if (status === 401 || status === 403) {
    return {
      code: "invalid_api_key",
      message: "The provider rejected the API key.",
      isAuthFailure: true,
    };
  }
  if (status === 404) {
    const mentionsModel = /model/i.test(safeDetail);
    return {
      code: mentionsModel ? "model_not_supported" : "provider_error",
      message: mentionsModel
        ? "The selected model is not supported by the provider."
        : "The provider endpoint was not found.",
      isAuthFailure: false,
    };
  }
  if (status === 429) {
    return {
      code: "provider_error",
      message: "The provider rate limit was exceeded. Please try again later.",
      isAuthFailure: false,
    };
  }
  if (status >= 500) {
    return {
      code: "provider_error",
      message: "The provider is temporarily unavailable. Please try again later.",
      isAuthFailure: false,
    };
  }
  return {
    code: "provider_error",
    message: safeDetail
      ? `The provider rejected the request: ${safeDetail}`
      : "The provider rejected the request.",
    isAuthFailure: false,
  };
}

/**
 * Extract a short, human-readable message from a provider error body.
 * Supports the OpenAI/Anthropic `{error:{message}}` shape and the Google
 * `{error:{message}}` shape. Anything unparseable yields an empty string.
 */
export function extractSafeProviderMessage(bodyText: string): string {
  if (!bodyText) return "";
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: unknown; status?: unknown };
      message?: unknown;
    };
    const raw =
      typeof parsed?.error?.message === "string"
        ? parsed.error.message
        : typeof parsed?.message === "string"
          ? parsed.message
          : "";
    // Collapse whitespace, truncate hard. No headers, no stack traces.
    return raw.replace(/\s+/g, " ").trim().slice(0, 240);
  } catch {
    return "";
  }
}
