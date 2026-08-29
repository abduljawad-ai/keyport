// Shared chat/conversation types.

export type ChatRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "streaming" | "complete" | "error";

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  provider_id: string | null;
  model_id: string | null;
  system_prompt: string | null;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  seq: number;
  conversation_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  provider_id: string | null;
  model_id: string | null;
  status: MessageStatus;
  error: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
}

export interface ChatRequestPayload {
  conversation_id: string;
  user_message_id: string;
  provider_connection_id?: string;
  model?: string;
  params?: ChatParams;
  stream: boolean;
  idempotency_key?: string;
}

/** Typed SSE events emitted by the `chat` Edge Function. */
export type ChatStreamEvent =
  | { type: "start"; assistant_message_id: string }
  | { type: "delta"; content: string }
  | { type: "usage"; input_tokens: number | null; output_tokens: number | null }
  | { type: "done"; assistant_message_id: string; status: MessageStatus }
  | { type: "error"; code: string; message: string };

export interface ChatUsage {
  input_tokens: number | null;
  output_tokens: number | null;
}

/** Max characters for a single composed message (mirrors server limits). */
export const MAX_MESSAGE_CHARS = 32_000;
