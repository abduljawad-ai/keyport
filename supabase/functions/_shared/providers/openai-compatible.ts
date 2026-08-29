// ============================================================================
// _shared/providers/openai-compatible.ts
// Adapter for OpenAI-compatible endpoints with a user-supplied base URL.
//
// SSRF protection (mandatory):
//   * before ANY request the base URL passes assertSafePublicUrl()
//     (scheme/credential/hostname policy + DNS resolution to public IPs)
//   * requests go through safeFetch(), which fails on redirects instead
//     of following them (redirect targets can never be re-validated
//     atomically, so redirects are disallowed entirely)
// ============================================================================

import { appError } from "../errors.ts";
import { assertSafePublicUrl, safeFetch } from "../urlSafety.ts";
import {
  toSafeProviderError,
  type NormalizedStreamChunk,
  type ProviderAdapter,
  type ProviderAdapterOptions,
  type ProviderCredentials,
  type StreamChatRequest,
  type TestResult,
} from "./types.ts";
import { mapProviderHttpError } from "../errors.ts";
import { openAiChatStream } from "./openai.ts";

function requireBaseUrl(credentials: ProviderCredentials): string {
  const baseUrl = credentials.baseUrl?.trim();
  if (!baseUrl) {
    throw appError("validation_error", "base_url is required for openai-compatible providers.");
  }
  return baseUrl.replace(/\/+$/, "");
}

export function createOpenAiCompatibleAdapter(
  options: ProviderAdapterOptions = {},
): ProviderAdapter {
  const urlOptions = {
    allowLocal: options.allowLocalUrls === true,
    resolveDns: options.resolveDns,
  };

  // Every fetch made by the shared OpenAI streaming code is routed through
  // the SSRF guard. The URL was validated before the call and redirects
  // are rejected by safeFetch.
  const guardedFetch: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return safeFetch(url, init ?? {}, urlOptions);
  };

  async function testConnection(credentials: ProviderCredentials): Promise<TestResult> {
    let baseUrl: string;
    try {
      baseUrl = requireBaseUrl(credentials);
      await assertSafePublicUrl(baseUrl, urlOptions);
    } catch (err) {
      const safe = toSafeProviderError(err);
      return { ok: false, code: safe.code, message: safe.message };
    }

    let response: Response;
    try {
      response = await guardedFetch(`${baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const safe = toSafeProviderError(err);
      return { ok: false, code: safe.code, message: safe.message };
    }
    if (response.ok) return { ok: true, message: "API key is valid." };
    const bodyText = await response.text().catch(() => "");
    const mapped = mapProviderHttpError(response.status, bodyText.slice(0, 4096));
    return {
      ok: false,
      code: mapped.code,
      message: mapped.code === "invalid_api_key"
        ? "The provider rejected the API key."
        : mapped.message || "The provider request failed.",
    };
  }

  async function* streamChat(
    request: StreamChatRequest,
    credentials: ProviderCredentials,
  ): AsyncGenerator<NormalizedStreamChunk> {
    let baseUrl: string;
    try {
      baseUrl = requireBaseUrl(credentials);
      await assertSafePublicUrl(baseUrl, urlOptions);
    } catch (err) {
      yield { type: "error", ...toSafeProviderError(err) };
      return;
    }
    yield* openAiChatStream({
      baseUrl,
      apiKey: credentials.apiKey,
      request,
      // stream_options.include_usage is not universally supported by
      // compatible servers; omit it here.
      includeUsageOption: false,
      fetchImpl: guardedFetch,
    });
  }

  return { providerId: "openai-compatible", testConnection, streamChat };
}
