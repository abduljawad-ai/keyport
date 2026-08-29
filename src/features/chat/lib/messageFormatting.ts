// Message formatting helpers (pure functions, easily testable).

import type { ActiveStreamState } from "@/features/chat/model/chatStreamStore";
import type { MessageDbRow } from "@/shared/supabase/types";

/** Truncate the first user message into a conversation title. */
export function deriveConversationTitle(content: string, maxLength = 48): string {
  const clean = content.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLength) return clean || "New conversation";
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Short preview for lists. */
export function messagePreview(content: string, maxLength = 96): string {
  const clean = content.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Convert the active stream state into a renderable message row. */
export function streamToMessageRow(
  stream: ActiveStreamState,
): Pick<
  MessageDbRow,
  | "id"
  | "seq"
  | "conversation_id"
  | "role"
  | "content"
  | "status"
  | "error"
  | "created_at"
  | "metadata"
> {
  const status =
    stream.status === "error"
      ? "error"
      : stream.status === "complete" || stream.status === "stopped"
        ? "complete"
        : "streaming";
  return {
    id: stream.serverMessageId ?? stream.tempId,
    seq: Number.MAX_SAFE_INTEGER,
    conversation_id: stream.conversationId,
    role: "assistant",
    content: stream.content,
    status,
    error: stream.error,
    created_at: new Date(stream.startedAt).toISOString(),
    metadata: stream.interrupted ? { interrupted: true } : {},
  };
}

/** Group messages into day buckets for date separators. */
export function groupMessagesByDay(messages: MessageDbRow[]): Array<{ day: string; messages: MessageDbRow[] }> {
  const groups: Array<{ day: string; messages: MessageDbRow[] }> = [];
  for (const message of messages) {
    const day = message.created_at.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.messages.push(message);
    } else {
      groups.push({ day, messages: [message] });
    }
  }
  return groups;
}
