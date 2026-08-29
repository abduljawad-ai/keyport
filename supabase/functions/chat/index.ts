// ============================================================================
// Edge Function: chat
// POST /functions/v1/chat
//
// The only path for AI provider calls. Sequence (spec Part 3 §13):
//   auth → rate limit → validate → verify conversation/message ownership
//   → resolve provider connection (owned, enabled, active key)
//   → unwrap per-user data key → decrypt API key in memory
//   → load history → insert assistant row (status=streaming)
//   → stream normalized SSE events (start/delta/usage/done/error)
//   → finalize assistant row + usage_events + api_keys.last_used_at
//
// Error phase rules:
//   * errors BEFORE the stream starts → standard JSON error response
//   * errors AFTER the start event   → SSE `error` event + safe close
//
// Abort handling: client disconnect aborts the upstream provider request;
// any content already received is persisted (status=complete with
// metadata.interrupted=true), otherwise the message becomes status=error.
// ============================================================================

import { authenticate } from "../_shared/auth.ts";
import { finalizeCors, handleCorsPreflight } from "../_shared/cors.ts";
import { decryptApiKey, loadDataKeyFromVault } from "../_shared/crypto.ts";
import { appError, errorResponse, type ErrorCode } from "../_shared/errors.ts";
import { createAdapterForEnv, resolveBaseUrl } from "../_shared/providers/index.ts";
import {
  isAbortError,
  toSafeProviderError,
  type ProviderAdapter,
  type ProviderChatMessage,
  type ProviderCredentials,
} from "../_shared/providers/types.ts";
import { RATE_LIMITS, enforceRateLimit } from "../_shared/rateLimit.ts";
import { getRequestRequestId } from "../_shared/requestId.ts";
import { safeLog, startServer } from "../_shared/serve.ts";
import { createSseResponse } from "../_shared/streaming.ts";
import {
  assertCryptoConfigured,
  createAdminClient,
  findAssistantAttemptByIdempotencyKey,
  getApiKeyByConnection,
  getOwnedConversation,
  getMessageById,
  getVaultByUserId,
  insertAssistantMessage,
  insertSecurityEvent,
  insertUsageEvent,
  listApiKeysForUser,
  listConnectionsForUser,
  listConversationMessages,
  updateApiKeyFields,
  updateMessage,
  type AdminClient,
  type ApiKeyRow,
  type ConversationRow,
  type EdgeEnv,
  type MessageRow,
  type ProviderConnectionRow,
} from "../_shared/supabaseAdmin.ts";
import { LIMITS, parseChatBody, readJsonBody, type ChatInput } from "../_shared/validation.ts";

interface UsageAccumulator {
  input_tokens?: number;
  output_tokens?: number;
}

interface ResolvedTarget {
  connection: ProviderConnectionRow;
  keyRow: ApiKeyRow;
  model: string;
}

function mergeUsage(current: UsageAccumulator | null, chunk: { input_tokens?: number; output_tokens?: number }): UsageAccumulator {
  return {
    input_tokens: chunk.input_tokens ?? current?.input_tokens,
    output_tokens: chunk.output_tokens ?? current?.output_tokens,
  };
}

/** Build provider context from history with the spec's filtering rules. */
export function buildProviderMessages(
  systemPrompt: string | null,
  history: MessageRow[],
): ProviderChatMessage[] {
  const messages: ProviderChatMessage[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const row of history) {
    // In-flight/stale rows are not part of context.
    if (row.status === "pending" || row.status === "streaming") continue;
    // Failed assistant rows with no content carry nothing useful.
    if (row.status === "error" && row.content.trim() === "") continue;
    messages.push({ role: row.role, content: row.content });
  }
  return messages;
}

/**
 * Resolve which provider connection + model to use (spec Part 3 §13):
 * explicit id → conversation default → the single active connection.
 */
async function resolveTarget(
  admin: AdminClient,
  userId: string,
  input: ChatInput,
  conversation: ConversationRow,
): Promise<ResolvedTarget> {
  const connections = await listConnectionsForUser(admin, userId);

  let connection: ProviderConnectionRow | null = null;
  if (input.providerConnectionId) {
    connection = connections.find((c) => c.id === input.providerConnectionId) ?? null;
    if (!connection) {
      throw appError("not_found", "Provider connection not found.");
    }
  } else if (conversation.provider_id) {
    connection =
      connections.find((c) => c.provider_id === conversation.provider_id && c.enabled) ?? null;
  }

  if (!connection) {
    const keys = await listApiKeysForUser(admin, userId);
    const activeConnections = connections.filter(
      (c) =>
        c.enabled &&
        keys.some((k) => k.provider_connection_id === c.id && k.status === "active"),
    );
    if (activeConnections.length === 1) {
      connection = activeConnections[0];
    } else {
      throw appError(
        "validation_error",
        activeConnections.length === 0
          ? "No provider with an active API key is connected."
          : "No provider was selected. Please choose a provider.",
      );
    }
  }

  if (!connection.enabled) {
    throw appError("validation_error", "This provider connection is disabled.");
  }

  const keyRow = await getApiKeyByConnection(admin, connection.id);
  if (!keyRow) {
    throw appError("missing_api_key", "No API key is available for this provider.");
  }
  if (keyRow.status !== "active") {
    throw appError(
      "missing_api_key",
      keyRow.status === "invalid"
        ? "The stored API key was marked invalid. Please replace it."
        : "No active API key is available for this provider.",
    );
  }

  const model = input.model ?? conversation.model_id ?? connection.default_model_id;
  if (!model) {
    throw appError("validation_error", "No model was selected.");
  }

  return { connection, keyRow, model };
}

interface FinalizationInput {
  assistantMessageId: string;
  content: string;
  usage: UsageAccumulator | null;
  providerFailure: { code: string; message: string } | null;
  aborted: boolean;
}

/**
 * Persist the final assistant message state and side effects.
 * Never throws: finalization problems are logged, not propagated.
 */
async function finalizeAssistantMessage(
  admin: AdminClient,
  ctx: {
    userId: string;
    conversationId: string;
    connection: ProviderConnectionRow;
    keyRow: ApiKeyRow;
    model: string;
    requestId: string;
  },
  input: FinalizationInput,
): Promise<"complete" | "error"> {
  const { providerFailure, aborted, content, usage } = input;

  let status: "complete" | "error";
  let errorMessage: string | null = null;
  const metadata: Record<string, unknown> = {};

  if (providerFailure) {
    if (content.length > 0) {
      // Partial content received before failure: keep it.
      status = "complete";
      metadata.interrupted = true;
      metadata.interrupted_reason = providerFailure.code;
    } else {
      status = "error";
      errorMessage = providerFailure.message;
    }
  } else if (aborted) {
    if (content.length > 0) {
      status = "complete";
      metadata.interrupted = true;
    } else {
      status = "error";
      errorMessage = "The response was stopped before any content arrived.";
    }
  } else {
    status = "complete";
  }

  try {
    await updateMessage(admin, input.assistantMessageId, {
      status,
      content,
      error: errorMessage,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      metadata,
    });
  } catch (err) {
    safeLog("chat_finalize_message_failed", {
      requestId: ctx.requestId,
      error: String((err as Error)?.message ?? err),
    });
  }

  if (usage && (usage.input_tokens || usage.output_tokens)) {
    try {
      await insertUsageEvent(admin, {
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        messageId: input.assistantMessageId,
        providerId: ctx.connection.provider_id,
        modelId: ctx.model,
        inputTokens: usage.input_tokens ?? null,
        outputTokens: usage.output_tokens ?? null,
      });
    } catch (err) {
      safeLog("chat_usage_write_failed", {
        requestId: ctx.requestId,
        error: String((err as Error)?.message ?? err),
      });
    }
  }

  try {
    await updateApiKeyFields(admin, ctx.keyRow.id, {
      last_used_at: new Date().toISOString(),
    });
  } catch {
    /* non-critical */
  }

  return status;
}

/** Mark a key invalid when the provider clearly rejects it. */
async function invalidateKeyOnAuthFailure(
  admin: AdminClient,
  ctx: { userId: string; connection: ProviderConnectionRow; keyRow: ApiKeyRow; requestId: string },
): Promise<void> {
  try {
    await updateApiKeyFields(admin, ctx.keyRow.id, { status: "invalid" });
    await insertSecurityEvent(admin, {
      userId: ctx.userId,
      eventType: "api_key_invalidated",
      metadata: { provider_id: ctx.connection.provider_id, source: "chat" },
    });
  } catch (err) {
    safeLog("chat_key_invalidation_failed", {
      requestId: ctx.requestId,
      error: String((err as Error)?.message ?? err),
    });
  }
}

async function consumeProviderStream(
  adapter: ProviderAdapter,
  request: { model: string; messages: ProviderChatMessage[]; params: ChatInput["params"]; signal: AbortSignal },
  credentials: ProviderCredentials,
  onDelta: (text: string) => void,
  onUsage: (usage: UsageAccumulator) => void,
): Promise<{ usage: UsageAccumulator | null; providerFailure: { code: string; message: string } | null }> {
  let usage: UsageAccumulator | null = null;
  let providerFailure: { code: string; message: string } | null = null;

  const chunks = adapter.streamChat(request, credentials);
  for await (const chunk of chunks) {
    if (request.signal.aborted) break;
    switch (chunk.type) {
      case "text_delta":
        if (chunk.text) onDelta(chunk.text);
        break;
      case "usage":
        usage = mergeUsage(usage, chunk);
        onUsage(usage);
        break;
      case "error":
        providerFailure = {
          code: chunk.code,
          message: chunk.message || "The provider request failed.",
        };
        break;
      case "done":
        break;
    }
    if (providerFailure) break;
  }
  return { usage, providerFailure };
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
    // ---- authentication & limits ----------------------------------------
    const user = await authenticate(req, env);
    await enforceRateLimit(admin, user.id, RATE_LIMITS.chat);

    // ---- validation -------------------------------------------------------
    const input = parseChatBody(await readJsonBody(req));

    const conversation = await getOwnedConversation(admin, user.id, input.conversationId);
    if (!conversation) {
      throw appError("not_found", "Conversation not found.");
    }

    const userMessage = await getMessageById(admin, input.userMessageId);
    if (
      !userMessage ||
      userMessage.conversation_id !== conversation.id ||
      userMessage.user_id !== user.id ||
      userMessage.role !== "user"
    ) {
      throw appError("not_found", "Message not found.");
    }

    // ---- provider + model resolution -------------------------------------
    assertCryptoConfigured(env);
    const { connection, keyRow, model } = await resolveTarget(
      admin,
      user.id,
      input,
      conversation,
    );

    // ---- decrypt the key in server memory only ---------------------------
    const vault = await getVaultByUserId(admin, user.id);
    if (!vault) {
      throw appError("decryption_failed", "The stored key could not be decrypted.");
    }
    const dataKey = await loadDataKeyFromVault(env, vault);
    const plaintextKey = await decryptApiKey(dataKey, keyRow.encrypted_key, keyRow.iv);
    const credentials: ProviderCredentials = {
      apiKey: plaintextKey,
      baseUrl: resolveBaseUrl(connection.provider_id, connection.base_url),
      organizationId: connection.organization_id,
      projectId: connection.project_id,
    };

    // ---- history -----------------------------------------------------------
    const history = await listConversationMessages(
      admin,
      conversation.id,
      LIMITS.maxContextMessages,
    );
    const providerMessages = buildProviderMessages(conversation.system_prompt, history);
    if (!providerMessages.some((m) => m.role === "user")) {
      throw appError("validation_error", "The conversation has no user message to answer.");
    }

    // ---- idempotency ---------------------------------------------------------
    if (input.idempotencyKey) {
      const existing = await findAssistantAttemptByIdempotencyKey(
        admin,
        conversation.id,
        input.idempotencyKey,
      );
      if (existing && existing.status === "streaming") {
        throw appError("validation_error", "A response for this message is already in progress.");
      }
      if (existing && existing.status === "complete") {
        // Replay the already-completed attempt instead of duplicating it.
        if (input.stream) {
          const replay = createSseResponse(req, async (sse) => {
            sse.write("start", { assistant_message_id: existing.id });
            if (existing.content) sse.write("delta", { content: existing.content });
            if (existing.input_tokens || existing.output_tokens) {
              sse.write("usage", {
                input_tokens: existing.input_tokens ?? null,
                output_tokens: existing.output_tokens ?? null,
              });
            }
            sse.write("done", { assistant_message_id: existing.id, status: "complete" });
          });
          return finalizeCors(replay, req, env);
        }
        return finalizeCors(
          new Response(
            JSON.stringify({
              success: true,
              assistant_message_id: existing.id,
              status: "complete",
              content: existing.content,
              usage: {
                input_tokens: existing.input_tokens ?? null,
                output_tokens: existing.output_tokens ?? null,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json; charset=utf-8", "x-request-id": requestId },
            },
          ),
          req,
          env,
        );
      }
      // status === "error" → a fresh attempt is allowed.
    }

    // ---- assistant message before the provider call -----------------------
    const assistant = await insertAssistantMessage(admin, {
      conversationId: conversation.id,
      userId: user.id,
      providerId: connection.provider_id,
      modelId: model,
      metadata: input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {},
    });

    const adapter = createAdapterForEnv(connection.provider_id, env);
    const sharedCtx = {
      userId: user.id,
      conversationId: conversation.id,
      connection,
      keyRow,
      model,
      requestId,
    };

    // ---- non-streaming mode -------------------------------------------------
    if (!input.stream) {
      const controller = new AbortController();
      if (req.signal) {
        if (req.signal.aborted) controller.abort();
        else req.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
      let content = "";
      try {
        const { usage, providerFailure } = await consumeProviderStream(
          adapter,
          { model, messages: providerMessages, params: input.params, signal: controller.signal },
          credentials,
          (text) => {
            content += text;
          },
          () => {
            /* usage surfaced only in final JSON */
          },
        );

        if (providerFailure?.code === "invalid_api_key") {
          await invalidateKeyOnAuthFailure(admin, sharedCtx);
        }

        const status = await finalizeAssistantMessage(
          admin,
          sharedCtx,
          {
            assistantMessageId: assistant.id,
            content,
            usage,
            providerFailure: providerFailure
              ? providerFailure
              : controller.signal.aborted
                ? { code: "provider_error", message: "The response was stopped." }
                : null,
            aborted: controller.signal.aborted && !providerFailure,
          },
        );

        if (providerFailure && content.length === 0) {
          const code: ErrorCode =
            providerFailure.code === "invalid_api_key" ||
            providerFailure.code === "model_not_supported"
              ? (providerFailure.code as ErrorCode)
              : "provider_error";
          throw appError(code, providerFailure.message);
        }

        safeLog("chat_complete", {
          requestId,
          userId: user.id,
          providerId: connection.provider_id,
          model,
          conversationId: conversation.id,
          stream: false,
          status,
          durationMs: Date.now() - startedAt,
        });

        return finalizeCors(
          new Response(
            JSON.stringify({
              success: true,
              assistant_message_id: assistant.id,
              status,
              content,
              usage: {
                input_tokens: usage?.input_tokens ?? null,
                output_tokens: usage?.output_tokens ?? null,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json; charset=utf-8", "x-request-id": requestId },
            },
          ),
          req,
          env,
        );
      } catch (err) {
        if (content.length === 0 && assistant) {
          // Ensure the row never lingers in `streaming` on hard failure.
          await updateMessage(admin, assistant.id, {
            status: "error",
            error: err instanceof Error && "code" in err ? String((err as { code?: string }).code) : "internal_error",
          }).catch(() => {});
        }
        throw err;
      }
    }

    // ---- streaming mode ------------------------------------------------------
    const sse = createSseResponse(req, async (sseCtx) => {
      let content = "";
      sseCtx.write("start", { assistant_message_id: assistant.id });

      let usage: UsageAccumulator | null = null;
      let providerFailure: { code: string; message: string } | null = null;
      try {
        const result = await consumeProviderStream(
          adapter,
          { model, messages: providerMessages, params: input.params, signal: sseCtx.signal },
          credentials,
          (text) => {
            content += text;
            sseCtx.write("delta", { content: text });
          },
          (accumulated) => {
            sseCtx.write("usage", {
              input_tokens: accumulated.input_tokens ?? null,
              output_tokens: accumulated.output_tokens ?? null,
            });
          },
        );
        usage = result.usage;
        providerFailure = result.providerFailure;
      } catch (err) {
        if (!isAbortError(err)) {
          providerFailure = toSafeProviderError(err);
        }
      }

      const aborted = sseCtx.signal.aborted;

      if (providerFailure?.code === "invalid_api_key") {
        await invalidateKeyOnAuthFailure(admin, sharedCtx);
        providerFailure = {
          code: "invalid_api_key",
          message: "The provider rejected the API key.",
        };
      }

      const status = await finalizeAssistantMessage(admin, sharedCtx, {
        assistantMessageId: assistant.id,
        content,
        usage,
        providerFailure,
        aborted,
      });

      if (providerFailure) {
        sseCtx.write("error", {
          code: providerFailure.code,
          message: providerFailure.message,
        });
      } else if (!aborted) {
        sseCtx.write("done", { assistant_message_id: assistant.id, status });
      }

      safeLog("chat_complete", {
        requestId,
        userId: user.id,
        providerId: connection.provider_id,
        model,
        conversationId: conversation.id,
        stream: true,
        status,
        interrupted: Boolean(aborted || providerFailure),
        durationMs: Date.now() - startedAt,
      });
    });

    return finalizeCors(sse, req, env);
  } catch (err) {
    safeLog("chat_error", {
      requestId,
      code: (err as { code?: string })?.code ?? "internal_error",
      durationMs: Date.now() - startedAt,
    });
    return finalizeCors(errorResponse(err, requestId), req, env);
  }
}

startServer(handler);
