import { describe, expect, it, vi } from "vitest";
import { createSseParser, tryParseSseData, type SseParsedEvent } from "./sseParser";

function collect(): {
  events: SseParsedEvent[];
  push: (chunk: string) => void;
  flush: () => void;
} {
  const events: SseParsedEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  return {
    events,
    push: (chunk) => parser.push(chunk),
    flush: () => parser.flush(),
  };
}

describe("createSseParser", () => {
  it("parses a simple event", () => {
    const { events, push } = collect();
    push('event: delta\ndata: {"content":"hi"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("delta");
    expect(tryParseSseData(events[0])).toEqual({ content: "hi" });
  });

  it("buffers incomplete chunks across reads", () => {
    const { events, push } = collect();
    push("event: del");
    expect(events).toHaveLength(0);
    push("ta\ndata: {\"content\":");
    expect(events).toHaveLength(0);
    push('"abc"}\n');
    expect(events).toHaveLength(0); // waiting for blank line dispatch
    push("\n");
    expect(events).toHaveLength(1);
    expect(tryParseSseData(events[0])).toEqual({ content: "abc" });
  });

  it("handles CRLF line endings", () => {
    const { events, push } = collect();
    push('event: done\r\ndata: {"assistant_message_id":"x"}\r\n\r\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("done");
  });

  it("joins multi-line data payloads", () => {
    const { events, push } = collect();
    push("data: line1\ndata: line2\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("line1\nline2");
  });

  it("ignores comments and heartbeats", () => {
    const { events, push } = collect();
    push(": heartbeat\n\nevent: delta\ndata: {}\n\n");
    expect(events).toHaveLength(1);
  });

  it("defaults the event name to message and strips one leading space", () => {
    const { events, push } = collect();
    push("data:  two-spaces-out\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("message");
    expect(events[0].data).toBe(" two-spaces-out");
  });

  it("flushes a pending event at end of stream", () => {
    const { events, push, flush } = collect();
    push("event: usage\ndata: {\"input_tokens\":1}");
    expect(events).toHaveLength(0);
    flush();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("usage");
  });

  it("does not throw on malformed JSON data", () => {
    const { events, push } = collect();
    push("event: delta\ndata: not-json\n\n");
    expect(events).toHaveLength(1);
    expect(tryParseSseData(events[0])).toBeUndefined();
  });

  it("emits multiple events from one chunk", () => {
    const { events, push } = collect();
    push(
      'event: start\ndata: {"assistant_message_id":"a"}\n\n' +
        "event: delta\ndata: {\"content\":\"x\"}\n\n",
    );
    expect(events.map((e) => e.event)).toEqual(["start", "delta"]);
  });

  it("keeps consuming events after a faulty consumer throws", () => {
    const events: SseParsedEvent[] = [];
    const parser = createSseParser((event) => {
      events.push(event);
      if (events.length === 1) throw new Error("consumer exploded");
    });
    parser.push("data: one\n\ndata: two\n\n");
    expect(events).toHaveLength(2);
  });

  it("handles field without a value", () => {
    const onEvent = vi.fn();
    const p = createSseParser(onEvent);
    p.push("event:\ndata: x\n\n");
    // empty event name falls back to "message"
    const last = onEvent.mock.calls[0]?.[0] as SseParsedEvent;
    expect(last.event).toBe("message");
    expect(last.data).toBe("x");
  });
});
