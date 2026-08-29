// Client-side error model + normalization.
// Every error surfaced to the UI passes through normalizeError() so users
// never see raw provider payloads, stack traces, or secret material.

export type AppErrorCode =
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
  | "internal_error"
  | "network_error"
  | "aborted"
  | "unknown_error";

const KNOWN_CODES: ReadonlySet<string> = new Set([
  "unauthorized",
  "forbidden",
  "validation_error",
  "not_found",
  "missing_api_key",
  "invalid_api_key",
  "decryption_failed",
  "provider_error",
  "rate_limited",
  "model_not_supported",
  "internal_error",
]);

export interface AppErrorDetails {
  request_id?: string;
  retry_after_seconds?: number;
  fields?: Record<string, string>;
  [key: string]: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status?: number;
  readonly details?: AppErrorDetails;

  constructor(code: AppErrorCode, message: string, options?: { status?: number; details?: AppErrorDetails }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status;
    this.details = options?.details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shape returned by Edge Functions: { error: { code, message, details } }. */
function fromEdgeEnvelope(value: unknown): AppError | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const err = value.error;
  const code = typeof err.code === "string" && KNOWN_CODES.has(err.code)
    ? (err.code as AppErrorCode)
    : "internal_error";
  const message =
    typeof err.message === "string" && err.message.trim()
      ? err.message
      : getUserFriendlyMessage(code);
  return new AppError(code, message, {
    status: typeof value.status === "number" ? value.status : undefined,
    details: isRecord(err.details) ? (err.details as AppErrorDetails) : undefined,
  });
}

function fromSupabaseError(err: { message?: string; code?: string }): AppError {
  const message = err.message ?? "Something went wrong.";
  if (/invalid login credentials/i.test(message)) {
    return new AppError("unauthorized", "Incorrect email or password.");
  }
  if (/already registered/i.test(message)) {
    return new AppError("validation_error", "An account with this email already exists.");
  }
  if (/password.*short|weak password/i.test(message)) {
    return new AppError("validation_error", "Please choose a longer, stronger password.");
  }
  if (/email not confirmed/i.test(message)) {
    return new AppError("validation_error", "Please confirm your email before signing in.");
  }
  if (/row-level security/i.test(message)) {
    return new AppError("forbidden", "You do not have access to that resource.");
  }
  if (/jwt|token|session/i.test(message) && /invalid|expired|missing/i.test(message)) {
    return new AppError("unauthorized", "Your session expired. Please sign in again.");
  }
  if (/duplicate key/i.test(message)) {
    return new AppError("validation_error", "That record already exists.");
  }
  return new AppError("internal_error", message);
}

/** Normalize any thrown value into a safe, displayable AppError. */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof DOMException && err.name === "AbortError") {
    return new AppError("aborted", "The request was cancelled.");
  }
  if (err instanceof TypeError) {
    // fetch network failures surface as TypeError.
    return new AppError("network_error", "Network error. Check your connection and try again.");
  }
  if (err instanceof SyntaxError) {
    return new AppError("internal_error", "Received an unexpected response.");
  }

  const envelope = fromEdgeEnvelope(err);
  if (envelope) return envelope;

  if (isRecord(err)) {
    if (typeof err.message === "string") {
      return fromSupabaseError(err as { message: string; code?: string });
    }
  }

  if (typeof err === "string" && err.trim()) {
    return new AppError("unknown_error", err.slice(0, 200));
  }

  return new AppError("unknown_error", "Something went wrong. Please try again.");
}

/** Safe, human-friendly messages per error category. */
export function getUserFriendlyMessage(code: AppErrorCode): string {
  switch (code) {
    case "unauthorized":
      return "Your session expired. Please sign in again.";
    case "forbidden":
      return "You do not have access to that resource.";
    case "validation_error":
      return "Please check the form and try again.";
    case "not_found":
      return "We couldn't find what you were looking for.";
    case "missing_api_key":
      return "No API key is connected for this provider. Add one in Settings → Providers.";
    case "invalid_api_key":
      return "The provider rejected your API key. Please check it and try again.";
    case "decryption_failed":
      return "Your stored key could not be read. Try removing and re-adding it.";
    case "provider_error":
      return "The AI provider request failed. Please try again.";
    case "rate_limited":
      return "You're sending requests too quickly. Please wait a moment.";
    case "model_not_supported":
      return "The selected model is not supported by this provider. Please select a valid model from the dropdown.";
    case "network_error":
      return "Network error. Check your connection and try again.";
    case "aborted":
      return "The request was cancelled.";
    case "internal_error":
    case "unknown_error":
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Returns true when retrying the operation could plausibly succeed. */
export function isRetryableError(error: AppError): boolean {
  return (
    error.code === "network_error" ||
    error.code === "provider_error" ||
    error.code === "rate_limited" ||
    error.code === "internal_error"
  );
}
