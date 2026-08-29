// Chat Edge Function client.
//
// The browser never calls AI providers directly. Every completion request
// goes through the `chat` Edge Function, which decrypts the stored key
// server-side and streams a normalized response back.

import { streamChatEvents } from "@/shared/api/sseClient";
import { newIdempotencyKey } from "@/shared/lib/id";
import type { ChatParams, ChatStreamEvent } from "@/shared/types/chat";

export interface SendChatInput {
  conversationId: string;
  userMessageId: string;
  providerConnectionId?: string | null;
  model?: string | null;
  params?: ChatParams;
  idempotencyKey?: string;
}

export interface SendChatOptions {
  onEvent: (event: ChatStreamEvent) => void;
  signal: AbortSignal;
}

/**
 * Send a streaming chat request. Returns the idempotency key used so the
 * caller can correlate retries of the same submission.
 */
export async function sendChatStream(
  input: SendChatInput,
  options: SendChatOptions,
): Promise<{ idempotencyKey: string }> {
  const idempotencyKey = input.idempotencyKey ?? newIdempotencyKey();

  const body: Record<string, unknown> = {
    conversation_id: input.conversationId,
    user_message_id: input.userMessageId,
    stream: true,
    idempotency_key: idempotencyKey,
  };
  if (input.providerConnectionId) body.provider_connection_id = input.providerConnectionId;
  if (input.model) body.model = input.model;
  if (input.params) body.params = input.params;

  await streamChatEvents({ body, onEvent: options.onEvent, signal: options.signal });
  return { idempotencyKey };
}
