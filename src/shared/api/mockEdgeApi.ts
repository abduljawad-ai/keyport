// ============================================================================
// MOCK Edge Function API — serves provider-key operations and the streaming
// chat endpoint entirely in the browser (mock mode only, see mockMode.ts).
//
// The mock honors the same security posture as the real functions:
//   * a plaintext provider key is accepted in a request, used to ACK the
//     operation, and is then dropped — it is never written to the mock store
//   * stored key metadata mirrors production (status, timestamps, last use)
//   * chat emits the same SSE event sequence (start/delta/usage/done) through
//     a real ReadableStream so the production stream parser is exercised
// ============================================================================

import { AppError } from "@/shared/lib/errors";
import { getMockDb, persistMockDb, type MockProviderEntry } from "@/shared/supabase/mockClient";
import type { MessageDbRow, ProviderConnectionRow, UsageEventRow } from "@/shared/supabase/types";
import { PROVIDER_DEFAULT_MODELS, type ProviderId } from "@/shared/types/provider";
import type { ProviderWithKey } from "@/shared/types/provider";
import { PROVIDER_PRESETS } from "@/shared/types/providerPresets";
import { OPENCODE_CATALOG } from "@/shared/data/opencodeCatalog.generated";

// --- shared helpers ------------------------------------------------------------

interface MockRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function isoNow(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

function requireSession(db: ReturnType<typeof getMockDb>): string {
  if (!db.session) {
    throw new AppError("unauthorized", "Your session expired. Please sign in again.");
  }
  return db.session.userId;
}

function toProviderWithKey(entry: MockProviderEntry): ProviderWithKey {
  return {
    provider_connection: { ...entry.connection },
    api_key_metadata: {
      exists: true,
      status: entry.key.status,
      created_at: entry.key.createdAt,
      last_verified_at: entry.key.lastVerifiedAt,
      last_used_at: entry.key.lastUsedAt,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// --- provider key handlers -----------------------------------------------------

async function handleProviderKeys(db: ReturnType<typeof getMockDb>, options: MockRequestOptions): Promise<unknown> {
  const userId = requireSession(db);
  const body = asRecord(options.body);

  switch (options.method ?? "POST") {
    case "GET": {
      // list-provider-keys
      const providers = db.providers
        .filter((entry) => entry.connection.user_id === userId)
        .map(toProviderWithKey);
      return { providers };
    }

    case "POST": {
      const withId = body.provider_connection_id;
      if (withId !== undefined) {
        // delete-api-key
        const index = db.providers.findIndex((entry) => entry.connection.id === withId);
        if (index >= 0) db.providers.splice(index, 1);
        persistMockDb(db);
        return { success: true };
      }
      if (body.provider_id !== undefined && typeof body.provider_id === "string") {
        // save-api-key: validate the key looks plausible, then persist metadata
        const plaintext = typeof body.api_key === "string" ? body.api_key : "";
        if (plaintext.length < 8) {
          return { error: { code: "invalid_api_key", message: "The key looks too short to be valid." } };
        }
        const providerId = body.provider_id as ProviderId;
        const existing = db.providers.find(
          (entry) => entry.connection.user_id === userId && entry.connection.provider_id === providerId,
        );
        const connection: ProviderConnectionRow = {
          id: existing?.connection.id ?? uuid(),
          user_id: userId,
          provider_id: providerId,
          display_name: typeof body.label === "string" && body.label ? body.label : null,
          enabled: true,
          base_url: typeof body.base_url === "string" ? body.base_url : null,
          organization_id: typeof body.organization_id === "string" ? body.organization_id : null,
          project_id: typeof body.project_id === "string" ? body.project_id : null,
          default_model_id:
            typeof body.default_model_id === "string"
              ? body.default_model_id
              : (PROVIDER_DEFAULT_MODELS[providerId] ?? null),
          created_at: existing?.connection.created_at ?? isoNow(),
          updated_at: isoNow(),
        };
        const entry: MockProviderEntry = {
          connection,
          key: {
            status: "active",
            createdAt: existing?.key.createdAt ?? isoNow(),
            lastVerifiedAt: isoNow(),
            lastUsedAt: existing?.key.lastUsedAt ?? null,
          },
        };
        if (existing) {
          db.providers[db.providers.indexOf(existing)] = entry;
        } else {
          db.providers.push(entry);
        }
        // NOTE: `plaintext` is intentionally out of scope from here on.
        persistMockDb(db);
        return {
          success: true,
          provider_connection: { ...entry.connection },
          api_key_metadata: {
            status: entry.key.status,
            created_at: entry.key.createdAt,
            last_verified_at: entry.key.lastVerifiedAt,
            last_used_at: entry.key.lastUsedAt,
          },
        };
      }
      // test-api-key (no connection id, no provider selection) — unknown shape
      return { error: { code: "invalid_request", message: "Unrecognized request." } };
    }

    default:
      return { error: { code: "method_not_allowed", message: "Method not allowed." } };
  }
}

// --- list-models (mock) ----------------------------------------------------------

const MOCK_PROVIDER_MODELS: Record<string, string[]> = {
  openai: [
    "gpt-5.5",
    "gpt-5",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o3-mini",
    "o4-mini",
    "gpt-4-turbo",
  ],
  anthropic: [
    "claude-opus-4-20250514",
    "claude-sonnet-4-20250514",
    "claude-haiku-4-20250414",
    "claude-3-7-sonnet-latest",
    "claude-3-5-haiku-latest",
  ],
  google: [
    "gemini-3.5-flash",
    "gemini-3.5-pro",
    "gemini-3.1-flash",
    "gemini-3.1-pro",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  "openai-compatible": [
    "custom-model-a",
    "custom-model-b",
    "custom-model-c",
  ],
};

async function handleListModels(options: MockRequestOptions): Promise<unknown> {
  const body = asRecord(options.body);
  const providerId = typeof body.provider_id === "string" ? body.provider_id : "";
  const key = typeof body.api_key === "string" ? body.api_key : "";
  if (key.length < 8) {
    return { error: { code: "invalid_api_key", message: "The key looks too short to be valid." } };
  }
  // Synced providers fall back to the opencode catalog; other named providers
  // fall back to their preset model list — mirroring the real function, which
  // relies on the same frontend catalog when /models is unavailable.
  const presetModels = PROVIDER_PRESETS.find((p) => p.id === providerId)?.models ?? [];
  return { models: MOCK_PROVIDER_MODELS[providerId] ?? OPENCODE_CATALOG[providerId] ?? presetModels };
}

// --- chat streaming -------------------------------------------------------------

const MOCK_REPLY: string =
  "Thanks for your message. Since this is the mock-mode build of Keyport, your request was handled " +
  "entirely in the browser: no provider was billed and no encrypted key store was touched.\n\n" +
  "The real pipeline works exactly like this, minus the local store: your message is saved, the chat " +
  "Edge Function unlocks your provider key in server memory, streams the completion back as token " +
  "deltas, and records token usage per request. Point this app at a deployed Supabase project and the " +
  "same UI talks to the real functions with your own keys.\n\n" +
  "Check token accounting on the Usage page and manage keys under Settings → Providers. Everything " +
  "you write here is persisted to this browser's local storage only, and a sign-out clears the demo " +
  "dataset so the next tester starts fresh.";

function encodeSseEvent(eventName: string, payload: Record<string, unknown>): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function buildStream(
  reply: string,
  assistantMessageId: string,
  inputTokens: number,
  outputTokens: number,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const CHUNK = 40;
  const TICK_MS = 45;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(encodeSseEvent("start", { assistant_message_id: assistantMessageId })),
        );
        for (let offset = 0; offset < reply.length; offset += CHUNK) {
          await delay(TICK_MS, signal);
          if (signal.aborted) {
            controller.close();
            return;
          }
          controller.enqueue(
            encoder.encode(encodeSseEvent("delta", { content: reply.slice(offset, offset + CHUNK) })),
          );
        }
        await delay(TICK_MS, signal);
        if (signal.aborted) {
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(
            encodeSseEvent("usage", { input_tokens: inputTokens, output_tokens: outputTokens }),
          ),
        );
        controller.enqueue(
          encoder.encode(
            encodeSseEvent("done", { assistant_message_id: assistantMessageId, status: "complete" }),
          ),
        );
        controller.close();
      } catch {
        try {
          controller.error(new Error("mock stream failed"));
        } catch {
          /* controller already closed */
        }
      }
    },
    cancel() {
      /* reader disconnected — nothing to clean up, rows already persisted */
    },
  });
}

async function handleChat(db: ReturnType<typeof getMockDb>, options: MockRequestOptions): Promise<Response> {
  const userId = requireSession(db);
  const body = asRecord(options.body);
  const signal = options.signal ?? new AbortController().signal;

  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
  const userMessageId = typeof body.user_message_id === "string" ? body.user_message_id : "";

  const conversation = db.conversations.find((row) => row.id === conversationId && row.user_id === userId);
  if (!conversation) {
    throw new AppError("internal_error", "Conversation not found. Please start a new chat.");
  }
  const userMessage = db.messages.find((row) => row.id === userMessageId && row.user_id === userId);
  if (!userMessage) {
    throw new AppError("internal_error", "The message was not found. Please try again.");
  }

  let selected: MockProviderEntry | undefined;
  const requestedId = typeof body.provider_connection_id === "string" ? body.provider_connection_id : null;
  if (requestedId) {
    selected = db.providers.find((entry) => entry.connection.id === requestedId && entry.connection.user_id === userId);
  }
  if (!selected) {
    selected = db.providers.find(
      (entry) =>
        entry.connection.user_id === userId &&
        entry.connection.enabled &&
        entry.key.status === "active",
    );
  }
  if (!selected) {
    throw new AppError(
      "missing_api_key",
      "No active provider key was found. Add one in Settings → Providers to start chatting.",
    );
  }

  const connection = selected.connection;
  const requestedModel = typeof body.model === "string" && body.model ? body.model : null;
  const model = requestedModel ?? connection.default_model_id ?? PROVIDER_DEFAULT_MODELS[connection.provider_id] ?? "gpt-4o-mini";

  const inputTokens = Math.max(1, Math.round(userMessage.content.length / 4));
  const outputTokens = Math.max(1, Math.round(MOCK_REPLY.length / 4));

  const assistantMessageId = uuid();
  const now = isoNow();
  const nextSeq = Math.max(0, ...db.messages.map((m) => m.seq)) + 1;

  const assistantMessage: MessageDbRow = {
    id: assistantMessageId,
    seq: nextSeq,
    conversation_id: conversation.id,
    user_id: userId,
    role: "assistant",
    content: MOCK_REPLY,
    provider_id: connection.provider_id,
    model_id: model,
    status: "complete",
    error: null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: {},
    created_at: now,
    updated_at: now,
  };
  db.messages.push(assistantMessage);

  const usageEvent: UsageEventRow = {
    id: uuid(),
    user_id: userId,
    conversation_id: conversation.id,
    message_id: assistantMessageId,
    provider_id: connection.provider_id,
    model_id: model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_estimate: (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.6,
    metadata: {},
    created_at: now,
  };
  db.usageEvents.push(usageEvent);

  conversation.updated_at = now;
  conversation.provider_id = connection.provider_id;
  conversation.model_id = model;
  selected.key.lastUsedAt = now;
  persistMockDb(db);

  const stream = buildStream(MOCK_REPLY, assistantMessageId, inputTokens, outputTokens, signal);
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

// --- public mock surface ---------------------------------------------------------

/**
 * Serve a non-streaming Edge Function call (JSON). Mirrors `edgeFetch`.
 * Throws AppError on failure, exactly like the real transport.
 */
export async function mockEdgeFetch(path: string, options: MockRequestOptions = {}): Promise<unknown> {
  // Small async boundary so callers observe the same promise timing as fetch.
  await Promise.resolve();
  const db = getMockDb();

  switch (path) {
    case "list-provider-keys":
    case "save-api-key":
    case "delete-api-key":
    case "test-api-key": {
      const parsed = await handleProviderKeys(db, options);
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        const err = (parsed as { error: { code: string; message: string } }).error;
        throw new AppError(err.code as AppError["code"], err.message);
      }
      return parsed;
    }
    case "list-models": {
      const parsed = await handleListModels(options);
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        const err = (parsed as { error: { code: string; message: string } }).error;
        throw new AppError(err.code as AppError["code"], err.message);
      }
      return parsed;
    }
    default:
      throw new AppError("internal_error", "Unknown function path in mock mode.");
  }
}

/**
 * Serve a streaming Edge Function call (SSE). Mirrors `edgeStreamRequest`.
 */
export async function mockEdgeStreamRequest(path: string, options: MockRequestOptions = {}): Promise<Response> {
  await Promise.resolve();
  const db = getMockDb();

  if (path === "chat") {
    return handleChat(db, options);
  }
  throw new AppError("internal_error", "Unknown stream path in mock mode.");
}