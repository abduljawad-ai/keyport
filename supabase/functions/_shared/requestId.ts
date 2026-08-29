// ============================================================================
// _shared/requestId.ts
// Unique request IDs attached to logs, responses, and safe error details.
// ============================================================================

const REQUEST_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Use the caller-supplied x-request-id when it is a safe opaque token,
 * otherwise generate a fresh one. Never trusts arbitrary header content.
 */
export function getRequestRequestId(req: Request): string {
  const supplied = req.headers.get("x-request-id");
  if (supplied && REQUEST_ID_RE.test(supplied)) return supplied;
  return newRequestId();
}

export function withRequestIdHeader(
  headers: Record<string, string>,
  requestId: string,
): Record<string, string> {
  return { ...headers, "x-request-id": requestId };
}
