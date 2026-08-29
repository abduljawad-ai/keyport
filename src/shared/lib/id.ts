// ID helpers for client-side identifiers.

export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers; still random, just not RFC-shaped.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Temporary message id for optimistic UI rows (never persisted). */
export function tempMessageId(): string {
  return `tmp_${randomId()}`;
}

/** Idempotency key for a single chat submission attempt. */
export function newIdempotencyKey(): string {
  return `idem_${randomId().replace(/-/g, "")}`;
}
