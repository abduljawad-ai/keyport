import { describe, expect, it } from "vitest";
import { toChatStreamEvent } from "./sseClient";
import { createSseParser } from "@/features/chat/lib/sseParser";

describe("toChatStreamEvent", () => {
  it("maps the start event", () => {
    expect(toChatStreamEvent("start", { assistant_message_id: "a1" })).toEqual({
      type: "start",
      assistant_message_id: "a1",
    });
  });

  it("maps the delta event", () => {
    expect(toChatStreamEvent("delta", { content: "hello" })).toEqual({
      type: "delta",
      content: "hello",
    });
  });

  it("maps usage with null tolerance", () => {
    expect(toChatStreamEvent("usage", { input_tokens: 12, output_tokens: null })).toEqual({
      type: "usage",
      input_tokens: 12,
      output_tokens: null,
    });
  });

  it("maps the done event", () => {
    expect(toChatStreamEvent("done", { assistant_message_id: "a1", status: "complete" })).toEqual({
      type: "done",
      assistant_message_id: "a1",
      status: "complete",
    });
  });

  it("maps error events with safe fallback message", () => {
    expect(toChatStreamEvent("error", { code: "provider_error", message: "" })).toEqual({
      type: "error",
      code: "provider_error",
      message: "The provider request failed.",
    });
  });

  it("returns null for unknown events and malformed payloads", () => {
    expect(toChatStreamEvent("mystery", {})).toBeNull();
    expect(toChatStreamEvent("start", { no_id: true })).toBeNull();
    expect(toChatStreamEvent("delta", "not-an-object")).toBeNull();
  });
});

describe("SSE stream integration (parser + mapping)", () => {
  it("replays a realistic chat sequence event-by-event", () => {
    const wire = [
      'event: start\ndata: {"assistant_message_id":"srv-1"}\n\n',
      'event: delta\ndata: {"content":"Hel"}\n\n',
      "event: heartbeat\n\n",
      ': keep-alive comment\n\n',
      'event: delta\ndata: {"content":"lo"}\n\n',
      'event: usage\ndata: {"input_tokens":5,"output_tokens":2}\n\n',
      'event: done\ndata: {"assistant_message_id":"srv-1","status":"complete"}\n\n',
    ].join("");

    const events: unknown[] = [];
    const parser = createSseParser((raw) => {
      try {
        const mapped = toChatStreamEvent(
          raw.event,
          raw.data ? JSON.parse(raw.data) : {},
        );
        if (mapped) events.push(mapped);
      } catch {
        /* malformed */
      }
    });
    parser.push(wire);
    parser.flush();

    expect(events.map((e) => (e as { type: string }).type)).toEqual([
      "start",
      "delta",
      "delta",
      "usage",
      "done",
    ]);
  });
});
