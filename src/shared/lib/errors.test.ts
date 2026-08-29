import { describe, expect, it } from "vitest";
import {
  AppError,
  getUserFriendlyMessage,
  isRetryableError,
  normalizeError,
} from "./errors";

describe("normalizeError", () => {
  it("passes AppError through unchanged", () => {
    const original = new AppError("rate_limited", "Slow down", {
      details: { retry_after_seconds: 30 },
    });
    const result = normalizeError(original);
    expect(result).toBe(original);
    expect(result.code).toBe("rate_limited");
  });

  it("maps the Edge Function error envelope", () => {
    const result = normalizeError({
      error: { code: "missing_api_key", message: "No API key is available for this provider." },
    });
    expect(result.code).toBe("missing_api_key");
    expect(result.message).toBe("No API key is available for this provider.");
  });

  it("falls back to a safe code for unknown envelope codes", () => {
    const result = normalizeError({ error: { code: "weird_code", message: "raw upstream detail" } });
    expect(result.code).toBe("internal_error");
    expect(result.message).toBe("raw upstream detail");
  });

  it("maps fetch network failures (TypeError) to network_error", () => {
    const result = normalizeError(new TypeError("Failed to fetch"));
    expect(result.code).toBe("network_error");
    expect(result.message).toMatch(/network/i);
  });

  it("maps AbortError to aborted", () => {
    const abort = new DOMException("The user aborted a request.", "AbortError");
    const result = normalizeError(abort);
    expect(result.code).toBe("aborted");
  });

  it("maps Supabase-style RLS errors to forbidden", () => {
    const result = normalizeError({
      message: "new row violates row-level security policy",
      code: "42501",
    });
    expect(result.code).toBe("forbidden");
  });

  it("maps invalid login credentials to a friendly unauthorized message", () => {
    const result = normalizeError({ message: "Invalid login credentials" });
    expect(result.code).toBe("unauthorized");
    expect(result.message).toBe("Incorrect email or password.");
  });

  it("never echoes non-string garbage as a stack trace", () => {
    const result = normalizeError({ unexpected: true });
    expect(result.code).toBe("unknown_error");
    expect(result.message).toBe("Something went wrong. Please try again.");
  });
});

describe("getUserFriendlyMessage", () => {
  it("returns a message for every category", () => {
    const codes = [
      "unauthorized",
      "validation_error",
      "network_error",
      "provider_error",
      "missing_api_key",
      "forbidden",
      "unknown_error",
    ] as const;
    for (const code of codes) {
      expect(getUserFriendlyMessage(code).length).toBeGreaterThan(0);
    }
  });
});

describe("isRetryableError", () => {
  it("treats network/provider/rate-limit/internal as retryable", () => {
    expect(isRetryableError(new AppError("network_error", "x"))).toBe(true);
    expect(isRetryableError(new AppError("provider_error", "x"))).toBe(true);
    expect(isRetryableError(new AppError("rate_limited", "x"))).toBe(true);
    expect(isRetryableError(new AppError("internal_error", "x"))).toBe(true);
  });
  it("treats auth/validation as non-retryable", () => {
    expect(isRetryableError(new AppError("unauthorized", "x"))).toBe(false);
    expect(isRetryableError(new AppError("validation_error", "x"))).toBe(false);
    expect(isRetryableError(new AppError("invalid_api_key", "x"))).toBe(false);
  });
});
