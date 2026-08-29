// ============================================================================
// _shared/validation.ts
// Input validation for every Edge Function request. Nothing client-supplied
// is trusted; all bodies are parsed, typed, and bounded here.
// ============================================================================

import { appError } from "./errors.ts";

import { CUSTOM_PROVIDER_ID, NAMED_PROVIDERS } from "./providers/registry.ts";

export const PROVIDER_IDS = [
  ...NAMED_PROVIDERS.map((p) => p.id),
  CUSTOM_PROVIDER_ID,
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const LIMITS = {
  /** Hard cap for any request body accepted by an Edge Function. */
  maxBodyBytes: 262_144,
  /** Longest API key we accept (generous for all known providers). */
  maxApiKeyLength: 1024,
  /** Longest free-text label/identifier field. */
  maxLabelLength: 200,
  /** Longest single chat message in a request context. */
  maxMessageChars: 32_000,
  /** Maximum messages loaded into provider context. */
  maxContextMessages: 100,
  /** Provider-safe upper bound for max_tokens. */
  maxMaxTokens: 32_000,
  /** Provider request timeout. */
  providerTimeoutMs: 120_000,
  maxStopSequences: 4,
  maxStopSequenceLength: 100,
  maxBaseUrlLength: 2048,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read and parse a JSON body with a hard size limit. */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > LIMITS.maxBodyBytes) {
    throw appError("validation_error", "Request exceeds allowed limits.");
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw appError("validation_error", "The request body could not be read.");
  }
  if (text.length > LIMITS.maxBodyBytes) {
    throw appError("validation_error", "Request exceeds allowed limits.");
  }
  if (!text.trim()) {
    throw appError("validation_error", "A JSON request body is required.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw appError("validation_error", "The request body is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw appError("validation_error", "The request body must be a JSON object.");
  }
  return parsed;
}

function fieldError(field: string, message: string): never {
  throw appError("validation_error", message, {
    details: { fields: { [field]: message } },
  });
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string | null {
  const value = body[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fieldError(field, `${field} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    fieldError(field, `${field} exceeds the maximum length of ${maxLength}.`);
  }
  return trimmed;
}

// --- save-api-key -----------------------------------------------------------

export interface SaveApiKeyInput {
  providerId: ProviderId;
  apiKey: string;
  label: string | null;
  baseUrl: string | null;
  organizationId: string | null;
  projectId: string | null;
  defaultModelId: string | null;
}

export function parseSaveApiKeyBody(body: Record<string, unknown>): SaveApiKeyInput {
  const providerRaw = body.provider_id;
  if (!isProviderId(providerRaw)) {
    fieldError("provider_id", "provider_id must be one of: " + PROVIDER_IDS.join(", ") + ".");
  }
  const providerId = providerRaw;

  const apiKeyRaw = body.api_key;
  if (typeof apiKeyRaw !== "string" || !apiKeyRaw.trim()) {
    fieldError("api_key", "api_key is required.");
  }
  const apiKey = apiKeyRaw.trim();
  if (apiKey.length > LIMITS.maxApiKeyLength) {
    fieldError("api_key", "api_key exceeds the maximum allowed length.");
  }

  const baseUrl = optionalString(body, "base_url", LIMITS.maxBaseUrlLength);
  if (providerId === "openai-compatible" && !baseUrl) {
    fieldError("base_url", "base_url is required for openai-compatible providers.");
  }
  if (providerId !== "openai-compatible" && baseUrl) {
    fieldError("base_url", "base_url is only supported for openai-compatible providers.");
  }

  return {
    providerId,
    apiKey,
    label: optionalString(body, "label", LIMITS.maxLabelLength),
    baseUrl,
    organizationId: optionalString(body, "organization_id", LIMITS.maxLabelLength),
    projectId: optionalString(body, "project_id", LIMITS.maxLabelLength),
    defaultModelId: optionalString(body, "default_model_id", LIMITS.maxLabelLength),
  };
}

// --- test-api-key -----------------------------------------------------------

export type TestApiKeyInput =
  | {
      mode: "new";
      providerId: ProviderId;
      apiKey: string;
      baseUrl: string | null;
      organizationId: string | null;
      projectId: string | null;
    }
  | { mode: "existing"; providerConnectionId: string };

export function parseTestApiKeyBody(body: Record<string, unknown>): TestApiKeyInput {
  const connectionId = body.provider_connection_id;
  if (connectionId !== undefined && connectionId !== null) {
    if (!isUuid(connectionId)) {
      fieldError("provider_connection_id", "provider_connection_id must be a valid UUID.");
    }
    return { mode: "existing", providerConnectionId: connectionId };
  }

  const providerRaw = body.provider_id;
  if (!isProviderId(providerRaw)) {
    fieldError("provider_id", "provider_id is required and must be a supported provider.");
  }
  const apiKeyRaw = body.api_key;
  if (typeof apiKeyRaw !== "string" || !apiKeyRaw.trim()) {
    fieldError("api_key", "api_key is required.");
  }
  const apiKey = apiKeyRaw.trim();
  if (apiKey.length > LIMITS.maxApiKeyLength) {
    fieldError("api_key", "api_key exceeds the maximum allowed length.");
  }
  const baseUrl = optionalString(body, "base_url", LIMITS.maxBaseUrlLength);
  if (providerRaw === "openai-compatible" && !baseUrl) {
    fieldError("base_url", "base_url is required for openai-compatible providers.");
  }
  return {
    mode: "new",
    providerId: providerRaw,
    apiKey,
    baseUrl,
    organizationId: optionalString(body, "organization_id", LIMITS.maxLabelLength),
    projectId: optionalString(body, "project_id", LIMITS.maxLabelLength),
  };
}

// --- list-models --------------------------------------------------------------

export interface ListModelsInput {
  providerId: ProviderId;
  apiKey: string;
  baseUrl: string | null;
}

export function parseListModelsBody(body: Record<string, unknown>): ListModelsInput {
  const providerRaw = body.provider_id;
  if (!isProviderId(providerRaw)) {
    fieldError("provider_id", "provider_id must be one of: " + PROVIDER_IDS.join(", ") + ".");
  }
  const apiKeyRaw = body.api_key;
  if (typeof apiKeyRaw !== "string" || !apiKeyRaw.trim()) {
    fieldError("api_key", "api_key is required.");
  }
  const apiKey = apiKeyRaw.trim();
  if (apiKey.length > LIMITS.maxApiKeyLength) {
    fieldError("api_key", "api_key exceeds the maximum allowed length.");
  }
  const baseUrl = optionalString(body, "base_url", LIMITS.maxBaseUrlLength);
  if (providerRaw === "openai-compatible" && !baseUrl) {
    fieldError("base_url", "base_url is required for openai-compatible providers.");
  }
  if (providerRaw !== "openai-compatible" && baseUrl) {
    fieldError("base_url", "base_url is only supported for openai-compatible providers.");
  }
  return { providerId: providerRaw, apiKey, baseUrl };
}

// --- delete-api-key -----------------------------------------------------------

export interface DeleteApiKeyInput {
  providerConnectionId: string;
}

export function parseDeleteApiKeyBody(body: Record<string, unknown>): DeleteApiKeyInput {
  const connectionId = body.provider_connection_id;
  if (!isUuid(connectionId)) {
    fieldError("provider_connection_id", "provider_connection_id is required and must be a valid UUID.");
  }
  return { providerConnectionId: connectionId };
}

// --- chat ---------------------------------------------------------------------

export interface ChatParamsInput {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
}

export interface ChatInput {
  conversationId: string;
  userMessageId: string;
  providerConnectionId: string | null;
  model: string | null;
  params: ChatParamsInput;
  stream: boolean;
  idempotencyKey: string | null;
}

function parseChatParams(raw: unknown): ChatParamsInput {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) fieldError("params", "params must be an object.");
  const out: ChatParamsInput = {};

  if (raw.temperature !== undefined) {
    const t = raw.temperature;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 2) {
      fieldError("params.temperature", "temperature must be a number between 0 and 2.");
    }
    out.temperature = t;
  }
  if (raw.top_p !== undefined) {
    const p = raw.top_p;
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
      fieldError("params.top_p", "top_p must be a number between 0 and 1.");
    }
    out.top_p = p;
  }
  if (raw.max_tokens !== undefined) {
    const m = raw.max_tokens;
    if (
      typeof m !== "number" ||
      !Number.isInteger(m) ||
      m < 1 ||
      m > LIMITS.maxMaxTokens
    ) {
      fieldError(
        "params.max_tokens",
        `max_tokens must be a positive integer no greater than ${LIMITS.maxMaxTokens}.`,
      );
    }
    out.max_tokens = m;
  }
  if (raw.stop !== undefined) {
    if (!Array.isArray(raw.stop) || raw.stop.length > LIMITS.maxStopSequences) {
      fieldError("params.stop", `stop must be an array with at most ${LIMITS.maxStopSequences} items.`);
    }
    const stops: string[] = [];
    for (const item of raw.stop) {
      if (typeof item !== "string" || item.length > LIMITS.maxStopSequenceLength) {
        fieldError(
          "params.stop",
          `each stop sequence must be a string of at most ${LIMITS.maxStopSequenceLength} characters.`,
        );
      }
      stops.push(item);
    }
    out.stop = stops;
  }
  return out;
}

export function parseChatBody(body: Record<string, unknown>): ChatInput {
  if (!isUuid(body.conversation_id)) {
    fieldError("conversation_id", "conversation_id is required and must be a valid UUID.");
  }
  if (!isUuid(body.user_message_id)) {
    fieldError("user_message_id", "user_message_id is required and must be a valid UUID.");
  }

  let providerConnectionId: string | null = null;
  if (body.provider_connection_id !== undefined && body.provider_connection_id !== null) {
    if (!isUuid(body.provider_connection_id)) {
      fieldError("provider_connection_id", "provider_connection_id must be a valid UUID.");
    }
    providerConnectionId = body.provider_connection_id;
  }

  let model: string | null = null;
  if (body.model !== undefined && body.model !== null) {
    if (typeof body.model !== "string" || !body.model.trim() || body.model.trim().length > 200) {
      fieldError("model", "model must be a non-empty string of at most 200 characters.");
    }
    model = body.model.trim();
  }

  let idempotencyKey: string | null = null;
  if (body.idempotency_key !== undefined && body.idempotency_key !== null) {
    if (
      typeof body.idempotency_key !== "string" ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(body.idempotency_key)
    ) {
      fieldError("idempotency_key", "idempotency_key must be 8-128 characters of [a-zA-Z0-9_-].");
    }
    idempotencyKey = body.idempotency_key;
  }

  const stream = body.stream === undefined ? true : body.stream === true;

  return {
    conversationId: body.conversation_id,
    userMessageId: body.user_message_id,
    providerConnectionId,
    model,
    params: parseChatParams(body.params),
    stream,
    idempotencyKey,
  };
}
