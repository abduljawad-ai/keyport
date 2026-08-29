// ============================================================================
// _shared/providers/openai.ts
// OpenAI adapter (chat completions, SSE streaming).
// Test connection uses the low-cost GET /v1/models endpoint.
// ============================================================================

import { mapProviderHttpError } from "../errors.ts";
import { LIMITS } from "../validation.ts";
import { iterateSseEvents } from "../streaming.ts";
import {
  isAbortError,
  throwForProviderResponse,
  toSafeProviderError,
  withTimeout,
  type NormalizedStreamChunk,
  type ProviderAdapter,
  type ProviderAdapterOptions,
  type ProviderChatMessage,
  type ProviderChatParams,
  type ProviderCredentials,
  type StreamChatRequest,
  type TestResult,
} from "./types.ts";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

interface OpenAiStreamOptions {
  baseUrl: string;
  apiKey: string;
  organizationId?: string | null;
  request: StreamChatRequest;
  /** stream_options.include_usage is OpenAI-specific; off for compatibles */
  includeUsageOption: boolean;
  fetchImpl: typeof fetch;
  extraHeaders?: Record<string, string>;
}

export function buildOpenAiChatBody(
  model: string,
  messages: ProviderChatMessage[],
  params: ProviderChatParams | undefined,
  includeUsageOption: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    stream: true,
    // `tool` rows are not produced by v1 chat; pass them through as user
    // content rather than dropping history.
    messages: messages.map((message) => ({
      role: message.role === "tool" ? "user" : message.role,
      content: message.content,
    })),
  };
  if (params?.temperature !== undefined) body.temperature = params.temperature;
  if (params?.top_p !== undefined) body.top_p = params.top_p;
  if (params?.max_tokens !== undefined) body.max_tokens = params.max_tokens;
  if (params?.stop?.length) body.stop = params.stop;
  if (includeUsageOption) body.stream_options = { include_usage: true };
  return body;
}

/** Shared OpenAI-format streaming implementation. */
export async function* openAiChatStream(
  options: OpenAiStreamOptions,
): AsyncGenerator<NormalizedStreamChunk> {
  const { baseUrl, apiKey, request, includeUsageOption, fetchImpl } = options;
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(options.extraHeaders ?? {}),
  };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildOpenAiChatBody(request.model, request.messages, request.params, includeUsageOption),
      ),
      signal: withTimeout(request.signal, LIMITS.providerTimeoutMs),
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    yield { type: "error", ...toSafeProviderError(err) };
    return;
  }

  if (!response.ok) {
    try {
      await throwForProviderResponse(response);
    } catch (err) {
      if (isAbortError(err)) throw err;
      yield { type: "error", ...toSafeProviderError(err) };
      return;
    }
  }
  if (!response.body) {
    yield { type: "error", code: "provider_error", message: "The provider returned an empty response." };
    return;
  }

  try {
    for await (const event of iterateSseEvents(response.body, request.signal)) {
      if (request.signal.aborted) break;
      const data = event.data.trim();
      if (!data || data === "[DONE]") {
        if (data === "[DONE]") break;
        continue;
      }
      let parsed: {
        choices?: Array<{ delta?: { content?: string; role?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue; // tolerate malformed keep-alive payloads
      }
      if (parsed.error?.message) {
        yield {
          type: "error",
          code: "provider_error",
          message: String(parsed.error.message).slice(0, 240),
        };
        return;
      }
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        yield { type: "text_delta", text: delta };
      }
      if (parsed.usage) {
        yield {
          type: "usage",
          input_tokens: parsed.usage.prompt_tokens,
          output_tokens: parsed.usage.completion_tokens,
        };
      }
    }
  } catch (err) {
    if (isAbortError(err)) throw err;
    yield { type: "error", ...toSafeProviderError(err) };
    return;
  }
  yield { type: "done" };
}

/** Test a key against GET /models (free, low-cost). */
export async function openAiTestConnection(
  baseUrl: string,
  credentials: ProviderCredentials,
  fetchImpl: typeof fetch,
  extraHeaders?: Record<string, string>,
): Promise<TestResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        ...(extraHeaders ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return {
      ok: false,
      code: "provider_error",
      message: "Could not reach the provider.",
    };
  }
  if (response.ok) {
    return { ok: true, message: "API key is valid." };
  }
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

export function createOpenAiAdapter(options: ProviderAdapterOptions = {}): ProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    providerId: "openai",
    testConnection(credentials) {
      return openAiTestConnection(OPENAI_BASE_URL, credentials, fetchImpl);
    },
    streamChat(request, credentials) {
      return openAiChatStream({
        baseUrl: OPENAI_BASE_URL,
        apiKey: credentials.apiKey,
        organizationId: credentials.organizationId,
        request,
        includeUsageOption: true,
        fetchImpl,
      });
    },
  };
}
