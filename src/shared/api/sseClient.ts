// SSE streaming client built on fetch + ReadableStream.
//
// Browser EventSource cannot send Authorization headers, so chat streaming
// uses fetch with a readable body instead (spec Part 4 §17).
//
// Behavior:
//   * sends Authorization + Accept: text/event-stream
//   * incremental decoding with incomplete-chunk buffering
//   * typed event dispatch (start/delta/usage/done/error)
//   * AbortSignal support; clean handling of mid-stream failures

import { edgeStreamRequest } from "@/shared/api/edgeClient";
import { createSseParser, tryParseSseData } from "@/features/chat/lib/sseParser";
import { AppError } from "@/shared/lib/errors";
import type { ChatStreamEvent } from "@/shared/types/chat";

export interface SseStreamHandlers {
  onEvent: (event: ChatStreamEvent) => void;
  signal: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Map a raw parsed SSE payload onto the typed chat event union. */
export function toChatStreamEvent(eventName: string, data: unknown): ChatStreamEvent | null {
  if (!isRecord(data)) return null;
  switch (eventName) {
    case "start": {
      if (typeof data.assistant_message_id !== "string") return null;
      return { type: "start", assistant_message_id: data.assistant_message_id };
    }
    case "delta": {
      if (typeof data.content !== "string") return null;
      return { type: "delta", content: data.content };
    }
    case "usage": {
      const input = typeof data.input_tokens === "number" ? data.input_tokens : null;
      const output = typeof data.output_tokens === "number" ? data.output_tokens : null;
      return { type: "usage", input_tokens: input, output_tokens: output };
    }
    case "done": {
      if (typeof data.assistant_message_id !== "string") return null;
      const status = data.status === "complete" ? "complete" : "error";
      return { type: "done", assistant_message_id: data.assistant_message_id, status };
    }
    case "error": {
      const code = typeof data.code === "string" ? data.code : "provider_error";
      const message =
        typeof data.message === "string" && data.message
          ? data.message
          : "The provider request failed.";
      return { type: "error", code, message };
    }
    default:
      return null;
  }
}

export interface StreamChatOptions {
  body: Record<string, unknown>;
  onEvent: (event: ChatStreamEvent) => void;
  signal: AbortSignal;
}

/**
 * Stream chat completion events from the `chat` Edge Function.
 * Resolves when the stream ends cleanly (done/error received or server
 * closed). Throws AppError for network/protocol failures; aborts resolve
 * quietly when options.signal was triggered.
 */
export async function streamChatEvents(options: StreamChatOptions): Promise<void> {
  const response = await edgeStreamRequest("chat", {
    method: "POST",
    body: options.body,
    signal: options.signal,
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let terminated = false;

  const parser = createSseParser((raw) => {
    const data = tryParseSseData(raw);
    if (data === undefined) return; // malformed payload: skip safely
    const event = toChatStreamEvent(raw.event, data);
    if (!event) return;
    if (event.type === "done" || event.type === "error") terminated = true;
    options.onEvent(event);
  });

  try {
    for (;;) {
      if (options.signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();
  } catch (err) {
    if (options.signal.aborted) return; // user-initiated stop
    if (err instanceof DOMException && err.name === "AbortError") return;
    throw new AppError(
      "network_error",
      "The connection was interrupted. Your progress was saved where possible.",
    );
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }

  if (!terminated && !options.signal.aborted) {
    // The stream ended without done/error — treat as an interruption.
    throw new AppError(
      "network_error",
      "The response stream ended unexpectedly. Please try again.",
    );
  }
}
