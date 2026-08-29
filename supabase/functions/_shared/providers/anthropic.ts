// ============================================================================
// _shared/providers/anthropic.ts
// Anthropic Messages API adapter (SSE streaming).
// Test connection uses GET /v1/models (a low-cost authenticated endpoint).
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
  type StreamChatRequest,
  type ProviderCredentials,
  type TestResult,
} from "./types.ts";

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

/**
 * Build the Messages API body. System messages are lifted into `system`;
 * remaining messages are merged so user/assistant roles strictly
 * alternate (Anthropic requirement).
 */
export function buildAnthropicBody(request: StreamChatRequest): Record<string, unknown> {
  const systemParts: string[] = [];
  const merged: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of request.messages) {
    if (message.role === "system") {
      if (message.content.trim()) systemParts.push(message.content);
      continue;
    }
    const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user";
    if (!message.content.trim()) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === role) {
      last.content += `\n\n${message.content}`;
    } else {
      merged.push({ role, content: message.content });
    }
  }
  // Anthropic requires the first message to be from the user.
  while (merged.length && merged[0].role !== "user") merged.shift();

  const body: Record<string, unknown> = {
    model: request.model,
    // max_tokens is mandatory for Anthropic; default conservatively.
    max_tokens: request.params?.max_tokens ?? 1024,
    stream: true,
    messages: merged,
  };
  if (systemParts.length) body.system = systemParts.join("\n\n");
  if (request.params?.temperature !== undefined) {
    // Anthropic supports 0..1; clamp instead of failing the request.
    body.temperature = Math.min(1, Math.max(0, request.params.temperature));
  }
  if (request.params?.top_p !== undefined) body.top_p = request.params.top_p;
  if (request.params?.stop?.length) body.stop_sequences = request.params.stop;
  return body;
}

export function createAnthropicAdapter(options: ProviderAdapterOptions = {}): ProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function testConnection(credentials: ProviderCredentials): Promise<TestResult> {
    let response: Response;
    try {
      response = await fetchImpl(`${ANTHROPIC_BASE_URL}/models`, {
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
    let response: Response;
    try {
      response = await fetchImpl(`${ANTHROPIC_BASE_URL}/messages`, {
        method: "POST",
        headers: {
          ...authHeaders(credentials.apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildAnthropicBody(request)),
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

    try {
      for await (const event of iterateSseEvents(response.body, request.signal)) {
        if (request.signal.aborted) break;
        if (!event.data.trim()) continue;
        let parsed: {
          type?: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: { input_tokens?: number } };
          usage?: { output_tokens?: number; input_tokens?: number };
          error?: { message?: string };
        };
        try {
          parsed = JSON.parse(event.data);
        } catch {
          continue;
        }

        if (event.event === "error" || parsed.type === "error") {
          yield {
            type: "error",
            code: "provider_error",
            message: String(parsed.error?.message ?? "The provider request failed.").slice(0, 240),
          };
          return;
        }

        switch (parsed.type) {
          case "message_start": {
            const input = parsed.message?.usage?.input_tokens;
            if (typeof input === "number") {
              yield { type: "usage", input_tokens: input };
            }
            break;
          }
          case "content_block_delta": {
            if (parsed.delta?.type === "text_delta" && typeof parsed.delta.text === "string") {
              if (parsed.delta.text.length > 0) {
                yield { type: "text_delta", text: parsed.delta.text };
              }
            }
            break;
          }
          case "message_delta": {
            const output = parsed.usage?.output_tokens;
            if (typeof output === "number") {
              yield { type: "usage", output_tokens: output };
            }
            break;
          }
          case "message_stop": {
            yield { type: "done" };
            return;
          }
          default:
            break;
        }
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
      yield { type: "error", ...toSafeProviderError(err) };
      return;
    }
    yield { type: "done" };
  }

  return { providerId: "anthropic", testConnection, streamChat };
}
