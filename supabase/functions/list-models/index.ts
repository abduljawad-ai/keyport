// ============================================================================
// Edge Function: list-models
// POST /functions/v1/list-models
//
// Returns the model ids available to a submitted API key so the "Add
// provider key" dialog can offer a live, key-specific model dropdown
// (like opencode) instead of relying only on curated catalogs.
//
// Security:
//   * the key is used ONLY for the provider model-listing request and is
//     never stored, logged, or returned
//   * user-supplied base URLs pass the SSRF guard (assertSafePublicUrl +
//     safeFetch, redirects rejected) exactly like test-api-key
//   * responses are normalized and capped (MAX_MODELS) so a long vendor
//     catalog cannot bloat the payload
// ============================================================================

import { authenticate } from "../_shared/auth.ts";
import { finalizeCors, handleCorsPreflight } from "../_shared/cors.ts";
import { appError, errorResponse, mapProviderHttpError } from "../_shared/errors.ts";
import { ANTHROPIC_BASE_URL } from "../_shared/providers/anthropic.ts";
import { GOOGLE_BASE_URL } from "../_shared/providers/google.ts";
import { OPENAI_BASE_URL } from "../_shared/providers/openai.ts";
import { getNamedProvider, isCustomProvider, resolveBaseUrl } from "../_shared/providers/registry.ts";
import { safeReadText } from "../_shared/providers/types.ts";
import { RATE_LIMITS, enforceRateLimit } from "../_shared/rateLimit.ts";
import { getRequestRequestId } from "../_shared/requestId.ts";
import { safeLog, startServer } from "../_shared/serve.ts";
import { createAdminClient, type EdgeEnv } from "../_shared/supabaseAdmin.ts";
import { assertSafePublicUrl, safeFetch } from "../_shared/urlSafety.ts";
import { parseListModelsBody, readJsonBody, type ListModelsInput } from "../_shared/validation.ts";

const ANTHROPIC_VERSION = "2023-06-01";
/** Safety cap on the number of model ids returned to the client. */
const MAX_MODELS = 200;
const TIMEOUT_MS = 30_000;

// --- normalization ------------------------------------------------------------

/** OpenAI-compatible shape: { "data": [{ "id": "gpt-4o", ... }, ...] }. */
function normalizeOpenAiModels(json: unknown): string[] {
  if (typeof json !== "object" || json === null || !("data" in json)) return [];
  const data = (json as { data: unknown }).data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null || !("id" in item)) continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) ids.push(id.trim());
  }
  return [...new Set(ids)].sort().slice(0, MAX_MODELS);
}

/** Google shape: { "models": [{ "name": "models/gemini-2.5-flash", ... }] }. */
function normalizeGoogleModels(json: unknown): string[] {
  if (typeof json !== "object" || json === null || !("models" in json)) return [];
  const models = (json as { models: unknown }).models;
  if (!Array.isArray(models)) return [];
  const ids: string[] = [];
  for (const item of models) {
    if (typeof item !== "object" || item === null || !("name" in item)) continue;
    const entry = item as { name?: unknown; supportedGenerationMethods?: unknown };
    if (typeof entry.name !== "string") continue;
    const methods = entry.supportedGenerationMethods;
    // Keep only chat-capable models when the vendor declares capabilities.
    if (Array.isArray(methods) && methods.length > 0) {
      if (!methods.includes("generateContent")) continue;
    }
    const id = entry.name.replace(/^models\//, "").trim();
    if (id) ids.push(id);
  }
  return [...new Set(ids)].sort().slice(0, MAX_MODELS);
}

// --- provider requests ----------------------------------------------------------

async function requestOpenAiFormatModels(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw appError("provider_error", "Could not reach the provider.", {
      internalMessage: `list-models fetch failed for ${baseUrl}: ${String(err)}`,
    });
  }
  if (!response.ok) {
    const bodyText = await safeReadText(response);
    const mapped = mapProviderHttpError(response.status, bodyText);
    throw appError(mapped.code, mapped.message);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return [];
  }
  return normalizeOpenAiModels(json);
}

async function requestAnthropicModels(apiKey: string, fetchImpl: typeof fetch): Promise<string[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${ANTHROPIC_BASE_URL}/models`, {
      method: "GET",
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw appError("provider_error", "Could not reach the provider.", {
      internalMessage: `list-models fetch failed: ${String(err)}`,
    });
  }
  if (!response.ok) {
    const bodyText = await safeReadText(response);
    const mapped = mapProviderHttpError(response.status, bodyText);
    throw appError(mapped.code, mapped.message);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return [];
  }
  return normalizeOpenAiModels(json);
}

async function requestGoogleModels(apiKey: string, fetchImpl: typeof fetch): Promise<string[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${GOOGLE_BASE_URL}/models`, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw appError("provider_error", "Could not reach the provider.", {
      internalMessage: `list-models fetch failed: ${String(err)}`,
    });
  }
  if (!response.ok) {
    const bodyText = await safeReadText(response);
    const mapped = mapProviderHttpError(response.status, bodyText);
    throw appError(mapped.code, mapped.message);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return [];
  }
  return normalizeGoogleModels(json);
}

async function fetchModels(input: ListModelsInput, env: EdgeEnv): Promise<string[]> {
  const { providerId, apiKey } = input;
  // Named providers use the locked registry URL; only the custom provider
  // accepts a client-supplied base URL (SSRF-checked below).
  const baseUrl = resolveBaseUrl(providerId, input.baseUrl);
  const isCustom = isCustomProvider(providerId);

  if (isCustom) {
    const base = baseUrl?.trim().replace(/\/+$/, "");
    if (!base) {
      throw appError("validation_error", "base_url is required for the custom provider.");
    }
    const options = { allowLocal: env.ALLOW_LOCAL_PROVIDER_URLS === "true" };
    await assertSafePublicUrl(base, options);
    // SSRF guard: validate + never follow redirects, mirroring the adapter.
    const guardedFetch: typeof fetch = (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return safeFetch(url, init ?? {}, options);
    };
    return requestOpenAiFormatModels(base, apiKey, guardedFetch);
  }

  const def = getNamedProvider(providerId);
  switch (def?.apiStyle) {
    case "openai":
      return requestOpenAiFormatModels(OPENAI_BASE_URL, apiKey, fetch);
    case "anthropic":
      return requestAnthropicModels(apiKey, fetch);
    case "google":
      return requestGoogleModels(apiKey, fetch);
    case "openai-compatible":
      if (!baseUrl) {
        throw appError("validation_error", "The provider has no configured endpoint.");
      }
      return requestOpenAiFormatModels(baseUrl, apiKey, fetch);
    default:
      throw appError("validation_error", "Unsupported provider.");
  }
}

export async function handler(req: Request, env: EdgeEnv): Promise<Response> {
  const requestId = getRequestRequestId(req);
  const startedAt = Date.now();

  const preflight = handleCorsPreflight(req, env, ["POST"]);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return finalizeCors(
      errorResponse(appError("validation_error", "Method not allowed.", { status: 405 }), requestId),
      req,
      env,
    );
  }

  const admin = createAdminClient(env);
  try {
    const user = await authenticate(req, env);
    await enforceRateLimit(admin, user.id, RATE_LIMITS.listModels);

    const input = parseListModelsBody(await readJsonBody(req));
    const models = await fetchModels(input, env);

    safeLog("list_models", {
      requestId,
      userId: user.id,
      providerId: input.providerId,
      count: models.length,
      durationMs: Date.now() - startedAt,
    });

    return finalizeCors(
      new Response(JSON.stringify({ models }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "x-request-id": requestId },
      }),
      req,
      env,
    );
  } catch (err) {
    safeLog("list_models_error", {
      requestId,
      code: (err as { code?: string })?.code ?? "internal_error",
      durationMs: Date.now() - startedAt,
    });
    return finalizeCors(errorResponse(err, requestId), req, env);
  }
}

startServer(handler);