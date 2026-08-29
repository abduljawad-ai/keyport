// ============================================================================
// _shared/streaming.ts
// SSE utilities for Edge Functions:
//   * encodeSseEvent / encodeSseComment — wire format helpers
//   * createSseResponse — builds a streaming Response with heartbeats,
//     client-disconnect abort propagation, and clean teardown
//   * iterateSseEvents — tolerant SSE *parser* used by provider adapters
//     to normalize upstream provider streams
// ============================================================================

import { redactSecretStrings } from "./redact.ts";

export function encodeSseEvent(event: string, data: unknown): string {
  const json = JSON.stringify(data);
  // SSE data fields must not contain raw newlines; JSON escaping covers it.
  return `event: ${event}\ndata: ${json}\n\n`;
}

export function encodeSseComment(text: string): string {
  return `: ${text.replace(/\n/g, " ")}\n\n`;
}

export interface SseRunContext {
  /** Emit a named SSE event with a JSON payload. */
  write(event: string, data: unknown): void;
  /** Emit an SSE comment (used for heartbeats). */
  comment(text: string): void;
  /** Aborts when the client disconnects or the stream is torn down. */
  signal: AbortSignal;
}

export interface SseResponseOptions {
  headers?: Record<string, string>;
  heartbeatMs?: number;
}

const DEFAULT_HEARTBEAT_MS = 15_000;
const HEARTBEAT_TICK_MS = 5_000;

/**
 * Build an SSE Response. The `run` callback performs the actual work and
 * is expected to emit its own `error` event for failures that happen
 * after streaming started (errors before streaming starts must be thrown
 * BEFORE calling this function so a JSON error response can be returned).
 */
export function createSseResponse(
  request: Request,
  run: (ctx: SseRunContext) => Promise<void>,
  options: SseResponseOptions = {},
): Response {
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const onClientAbort = () => abortController.abort();
  if (request.signal) {
    if (request.signal.aborted) abortController.abort();
    else request.signal.addEventListener("abort", onClientAbort);
  }

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  let lastSentAt = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = (text: string) => {
    if (closed || !controllerRef) return;
    lastSentAt = Date.now();
    try {
      controllerRef.enqueue(encoder.encode(text));
    } catch {
      closed = true;
    }
  };

  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      timer = setInterval(() => {
        if (!closed && Date.now() - lastSentAt >= heartbeatMs) {
          emit(encodeSseComment("heartbeat"));
        }
      }, HEARTBEAT_TICK_MS);

      run({
        write: (event, data) => emit(encodeSseEvent(event, data)),
        comment: (text) => emit(encodeSseComment(text)),
        signal: abortController.signal,
      })
        .catch((err: unknown) => {
          // run() is expected to handle its own SSE error events; anything
          // escaping here is logged redacted only. Never logged raw.
          const message = err instanceof Error ? err.message : String(err);
          console.error("sse stream failure:", redactSecretStrings(message));
        })
        .finally(() => {
          closed = true;
          if (timer) clearInterval(timer);
          if (request.signal) {
            request.signal.removeEventListener("abort", onClientAbort);
          }
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
    },
    cancel() {
      closed = true;
      abortController.abort();
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...(options.headers ?? {}),
    },
  });
}

export interface RawSseEvent {
  event: string;
  data: string;
}

/**
 * Tolerant incremental SSE parser for upstream provider streams.
 * Handles `event:` / `data:` lines, multi-line data, comments, CRLF,
 * and incomplete chunks. Malformed lines are skipped, never thrown on.
 */
export class SseLineParser {
  private buffer = "";
  private eventName = "message";
  private dataLines: string[] = [];

  /** Feed a raw chunk; returns any complete events. */
  push(chunk: string): RawSseEvent[] {
    this.buffer += chunk;
    const events: RawSseEvent[] = [];
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.search(/\r\n|\n|\r/)) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      const match = this.buffer.slice(newlineIndex).match(/^\r\n|\n|\r/);
      this.buffer = this.buffer.slice(newlineIndex + (match ? match[0].length : 1));
      const event = this.processLine(line);
      if (event) events.push(event);
    }
    return events;
  }

  /** Flush any pending event at end of stream. */
  flush(): RawSseEvent | null {
    if (this.dataLines.length > 0) {
      return this.takeEvent();
    }
    return null;
  }

  private processLine(line: string): RawSseEvent | null {
    if (line === "") {
      // Blank line = event dispatch.
      if (this.dataLines.length === 0) {
        this.eventName = "message";
        return null;
      }
      return this.takeEvent();
    }
    if (line.startsWith(":")) return null; // comment
    const colon = line.indexOf(":");
    let field: string;
    let value: string;
    if (colon === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
    }
    if (field === "event") {
      this.eventName = value || "message";
    } else if (field === "data") {
      this.dataLines.push(value);
    }
    // id:/retry: are irrelevant for provider streams and ignored.
    return null;
  }

  private takeEvent(): RawSseEvent {
    const event: RawSseEvent = {
      event: this.eventName,
      data: this.dataLines.join("\n"),
    };
    this.dataLines = [];
    this.eventName = "message";
    return event;
  }
}

/** Iterate over all SSE events in a response body stream. */
export async function* iterateSseEvents(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<RawSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseLineParser();
  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      const events = parser.push(decoder.decode(value, { stream: true }));
      for (const event of events) yield event;
    }
    const tail = parser.push(decoder.decode());
    for (const event of tail) yield event;
    const flushed = parser.flush();
    if (flushed) yield flushed;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
