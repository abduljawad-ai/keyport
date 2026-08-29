// ============================================================================
// _shared/redact.ts
// Redaction utilities. Nothing secret may reach logs or client responses.
// ============================================================================

const SENSITIVE_KEY_PATTERN =
  /^(api[_-]?key|apikey|authorization|auth|token|access[_-]?token|refresh[_-]?token|secret|password|credential|x-api-key|x-goog-api-key|key|encrypted[_-]?key|iv|wrapped[_-]?data[_-]?key|wrap[_-]?iv|master[_-]?key|cookie|set-cookie)$/i;

const HEADER_DENYLIST = [
  "authorization",
  "x-api-key",
  "x-goog-api-key",
  "apikey",
  "cookie",
  "set-cookie",
  "proxy-authorization",
];

/** Patterns that look like provider API keys inside free text. */
const SECRET_TEXT_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g, // OpenAI style
  /\bsk-ant-[A-Za-z0-9_-]{12,}\b/g, // Anthropic style
  /\bAIza[A-Za-z0-9_-]{20,}\b/g, // Google style
  /\bsk-proj-[A-Za-z0-9_-]{12,}\b/g,
  /\bcrd_[A-Za-z0-9]{10,}\b/g,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/** Redact a header map: drops credential headers entirely. */
export function redactHeaders(
  headers: Record<string, string> | Headers | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const entries =
    headers instanceof Headers
      ? Array.from(headers.entries())
      : Object.entries(headers);
  for (const [name, value] of entries) {
    if (HEADER_DENYLIST.includes(name.toLowerCase())) continue;
    out[name] = value;
  }
  return out;
}

/** Deep-redact any object before logging. Returns a JSON-safe copy. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSecretStrings(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? "[REDACTED]" : redactValue(val, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Scrub strings that look like provider keys out of arbitrary text. */
export function redactSecretStrings(text: string): string {
  let out = text;
  for (const pattern of SECRET_TEXT_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

/**
 * Produce a non-reversible hint for log correlation only.
 * Never include more than a salted prefix length; never the key itself.
 */
export function keyFingerprint(plainKey: string): string {
  return `len:${plainKey.length}`;
}
