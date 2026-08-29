// Chat stream store state transitions (spec: SSE events → UI state).

import { beforeEach, describe, expect, it } from "vitest";
import { useChatStreamStore } from "./chatStreamStore";

const CONVO = "conv-1";
const TEMP = "tmp-1";

function stream() {
  return useChatStreamStore.getState().streams[CONVO];
}

describe("chatStreamStore", () => {
  beforeEach(() => {
    useChatStreamStore.setState({ streams: {} });
  });

  it("starts in `starting` with empty content", () => {
    useChatStreamStore.getState().startStream(CONVO, TEMP);
    expect(stream()).toMatchObject({
      tempId: TEMP,
      serverMessageId: null,
      content: "",
      status: "starting",
      error: null,
    });
  });

  it("moves to streaming when the server id attaches, keeping it attached", () => {
    const store = useChatStreamStore.getState();
    store.startStream(CONVO, TEMP);
    store.attachServerMessageId(CONVO, "server-1");
    expect(stream().status).toBe("streaming");
    expect(stream().serverMessageId).toBe("server-1");
  });

  it("appends deltas in order", () => {
    const store = useChatStreamStore.getState();
    store.startStream(CONVO, TEMP);
    store.appendDelta(CONVO, "Hello");
    store.appendDelta(CONVO, " world");
    store.appendDelta(CONVO, "!");
    expect(stream().content).toBe("Hello world!");
    expect(stream().status).toBe("streaming");
  });

  it("completes and clears", () => {
    const store = useChatStreamStore.getState();
    store.startStream(CONVO, TEMP);
    store.appendDelta(CONVO, "hi");
    store.completeStream(CONVO);
    expect(stream().status).toBe("complete");
    store.clearStream(CONVO);
    expect(stream()).toBeUndefined();
  });

  it("records usage merge semantics", () => {
    const store = useChatStreamStore.getState();
    store.startStream(CONVO, TEMP);
    store.setUsage(CONVO, { input_tokens: 10, output_tokens: null });
    store.setUsage(CONVO, { input_tokens: null, output_tokens: 5 });
    expect(stream().usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it("fails with a message and keeps partial content", () => {
    const store = useChatStreamStore.getState();
    store.startStream(CONVO, TEMP);
    store.appendDelta(CONVO, "partial");
    store.failStream(CONVO, "Provider exploded");
    expect(stream().status).toBe("error");
    expect(stream().error).toBe("Provider exploded");
    expect(stream().content).toBe("partial");
  });

  it("stops with interrupted flag when content exists", () => {
    const store = useChatStreamStore.getState();
    store.startStream(CONVO, TEMP);
    store.appendDelta(CONVO, "some text");
    store.stopStream(CONVO);
    expect(stream().status).toBe("stopped");
    expect(stream().interrupted).toBe(true);
    expect(stream().content).toBe("some text");
  });

  it("keeps unknown-conversation operations as no-ops", () => {
    const store = useChatStreamStore.getState();
    store.appendDelta("ghost", "x");
    store.completeStream("ghost");
    store.stopStream("ghost");
    store.clearStream("ghost");
    expect(useChatStreamStore.getState().streams.ghost).toBeUndefined();
  });

  it("isolates streams per conversation", () => {
    const store = useChatStreamStore.getState();
    store.startStream(CONVO, TEMP);
    store.startStream("conv-2", "tmp-2");
    store.appendDelta(CONVO, "a");
    store.appendDelta("conv-2", "b");
    expect(stream().content).toBe("a");
    expect(useChatStreamStore.getState().streams["conv-2"].content).toBe("b");
  });
});
