// Robust incremental Server-Sent Events parser for chat streaming.
//
// Handles:
//   * `event:` / `data:` fields, multi-line data (joined with \n)
//   * comments (`:` prefix) and unknown fields (ignored)
//   * CRLF / LF / CR line endings
//   * incomplete chunks across network reads (buffered until newline)
//   * malformed payloads: consumers use tryParseSseData() and skip safely
//
// The parser never throws on malformed input — it fails gracefully.

export interface SseParsedEvent {
  /** Event name; defaults to "message" per the SSE spec. */
  event: string;
  /** Raw data payload (joined multi-line). Not yet JSON-parsed. */
  data: string;
}

export type SseEventCallback = (event: SseParsedEvent) => void;

export interface SseParser {
  /** Feed a raw text chunk; dispatches any events completed in it. */
  push(chunk: string): void;
  /** Dispatch a pending event at end-of-stream, if one exists. */
  flush(): void;
}

export function createSseParser(onEvent: SseEventCallback): SseParser {
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }
    const event: SseParsedEvent = { event: eventName, data: dataLines.join("\n") };
    dataLines = [];
    eventName = "message";
    try {
      onEvent(event);
    } catch {
      // A faulty consumer must never break the stream loop.
    }
  };

  const processLine = (line: string) => {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return; // comment / heartbeat
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") {
      eventName = value || "message";
    } else if (field === "data") {
      dataLines.push(value);
    }
    // `id:` and `retry:` are irrelevant for this client and ignored.
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      for (;;) {
        const match = buffer.match(/\r\n|\n|\r/);
        if (!match || match.index === undefined) break;
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        processLine(line);
      }
    },
    flush() {
      if (buffer.length > 0) {
        processLine(buffer);
        buffer = "";
      }
      dispatch();
    },
  };
}

/** Safely JSON-parse an SSE data payload; returns undefined when invalid. */
export function tryParseSseData(event: SseParsedEvent): unknown {
  try {
    return JSON.parse(event.data);
  } catch {
    return undefined;
  }
}
