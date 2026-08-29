// ============================================================================
// _shared/providers/google.ts
// Google Generative Language API adapter (Gemini, SSE streaming).
// The API key is sent via the x-goog-api-key header — never in the URL.
// Test connection lists models (GET /v1beta/models?pageSize=1).
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
  type ProviderCredentials,
  type StreamChatRequest,
  type TestResult,
} from "./types.ts";

export const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function authHeaders(apiKey: string): Record<string, string> {
  return { "x-goog-api-key": apiKey };
}

/**
 * Build the streamGenerateContent body. System messages become
 * `systemInstruction`; user/assistant map to user/model turns.
 */
export function buildGoogleBody(request: StreamChatRequest): Record<string, unknown> {
  const systemParts: string[] = [];
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  for (const message of request.messages) {
    if (message.role === "system") {
      if (message.content.trim()) systemParts.push(message.content);
      continue;
    }
    if (!message.content.trim()) continue;
    const role: "user" | "model" = message.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push({ text: message.content });
    } else {
      contents.push({ role, parts: [{ text: message.content }] });
    }
  }

  const generationConfig: Record<string, unknown> = {};
  if (request.params?.temperature !== undefined) generationConfig.temperature = request.params.temperature;
  if (request.params?.top_p !== undefined) generationConfig.topP = request.params.top_p;
  if (request.params?.max_tokens !== undefined) generationConfig.maxOutputTokens = request.params.max_tokens;
  if (request.params?.stop?.length) generationConfig.stopSequences = request.params.stop;

  return {
    contents,
    ...(systemParts.length ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } } : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };
}

export function createGoogleAdapter(options: ProviderAdapterOptions = {}): ProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function testConnection(credentials: ProviderCredentials): Promise<TestResult> {
    let response: Response;
    try {
      response = await fetchImpl(`${GOOGLE_BASE_URL}/models?pageSize=1`, {
        method: "GET",
        headers: authHeaders(credentials.apiKey),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return { ok: false, code: "provider_error", message: "Could not reach the provider." };
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
    const modelSegment = encodeURIComponent(request.model);
    const url = `${GOOGLE_BASE_URL}/models/${modelSegment}:streamGenerateContent?alt=sse`;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          ...authHeaders(credentials.apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildGoogleBody(request)),
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
      yield {
        type: "error",
        code: "provider_error",
        message: "The provider returned an empty response.",
      };
      return;
    }

    let sawUsage = false;
    try {
      for await (const event of iterateSseEvents(response.body, request.signal)) {
        if (request.signal.aborted) break;
        if (!event.data.trim()) continue;
        let parsed: {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
          error?: { message?: string };
        };
        try {
          parsed = JSON.parse(event.data);
        } catch {
          continue;
        }
        if (parsed.error?.message) {
          yield {
            type: "error",
            code: "provider_error",
            message: String(parsed.error.message).slice(0, 240),
          };
          return;
        }
        const parts = parsed.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (typeof part.text === "string" && part.text.length > 0) {
            yield { type: "text_delta", text: part.text };
          }
        }
        const usage = parsed.usageMetadata;
        if (usage && (usage.promptTokenCount || usage.candidatesTokenCount)) {
          sawUsage = true;
          yield {
            type: "usage",
            input_tokens: usage.promptTokenCount,
            output_tokens: usage.candidatesTokenCount,
          };
        }
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
      yield { type: "error", ...toSafeProviderError(err) };
      return;
    }
    void sawUsage;
    yield { type: "done" };
  }

  return { providerId: "google", testConnection, streamChat };
}
