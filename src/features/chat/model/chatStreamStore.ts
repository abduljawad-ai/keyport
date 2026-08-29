// Zustand store tracking active chat streams per conversation.
// Holds ONLY non-secret UI state: streamed text, status, ids.
// The temporary assistant message is reconciled with the server-assigned
// message id on the `start` SSE event.

import { create } from "zustand";
import type { ChatUsage } from "@/shared/types/chat";

export type StreamStatus = "starting" | "streaming" | "complete" | "error" | "stopped";

export interface ActiveStreamState {
  conversationId: string;
  /** Client-side temporary id until the server assigns one. */
  tempId: string;
  /** Server assistant message id (from the `start` event), once known. */
  serverMessageId: string | null;
  content: string;
  status: StreamStatus;
  error: string | null;
  usage: ChatUsage | null;
  interrupted: boolean;
  startedAt: number;
}

export interface ChatStreamStoreState {
  /** Keyed by conversation id — one active stream per conversation. */
  streams: Record<string, ActiveStreamState>;
  startStream: (conversationId: string, tempId: string) => void;
  attachServerMessageId: (conversationId: string, messageId: string) => void;
  appendDelta: (conversationId: string, text: string) => void;
  setUsage: (conversationId: string, usage: ChatUsage) => void;
  completeStream: (conversationId: string) => void;
  failStream: (conversationId: string, message: string) => void;
  stopStream: (conversationId: string) => void;
  clearStream: (conversationId: string) => void;
}

function patchStream(
  state: ChatStreamStoreState,
  conversationId: string,
  patch: Partial<ActiveStreamState>,
): Partial<ChatStreamStoreState> {
  const existing = state.streams[conversationId];
  if (!existing) return {};
  return {
    streams: {
      ...state.streams,
      [conversationId]: { ...existing, ...patch },
    },
  };
}

export const useChatStreamStore = create<ChatStreamStoreState>()((set) => ({
  streams: {},

  startStream: (conversationId, tempId) =>
    set((state) => ({
      streams: {
        ...state.streams,
        [conversationId]: {
          conversationId,
          tempId,
          serverMessageId: null,
          content: "",
          status: "starting",
          error: null,
          usage: null,
          interrupted: false,
          startedAt: Date.now(),
        },
      },
    })),

  attachServerMessageId: (conversationId, messageId) =>
    set((state) =>
      patchStream(state, conversationId, {
        serverMessageId: messageId,
        status: state.streams[conversationId]?.status === "starting"
          ? "streaming"
          : state.streams[conversationId]?.status,
      }),
    ),

  appendDelta: (conversationId, text) =>
    set((state) => {
      const existing = state.streams[conversationId];
      if (!existing) return {};
      const isActive = existing.status === "starting" || existing.status === "streaming";
      return patchStream(state, conversationId, {
        content: existing.content + text,
        status: isActive ? "streaming" : existing.status,
      });
    }),

  setUsage: (conversationId, usage) =>
    set((state) => {
      const existing = state.streams[conversationId];
      if (!existing) return {};
      const merged: ChatUsage = {
        input_tokens: usage.input_tokens ?? existing.usage?.input_tokens ?? null,
        output_tokens: usage.output_tokens ?? existing.usage?.output_tokens ?? null,
      };
      return patchStream(state, conversationId, { usage: merged });
    }),

  completeStream: (conversationId) =>
    set((state) => patchStream(state, conversationId, { status: "complete" })),

  failStream: (conversationId, message) =>
    set((state) =>
      patchStream(state, conversationId, { status: "error", error: message }),
    ),

  stopStream: (conversationId) =>
    set((state) => {
      const existing = state.streams[conversationId];
      if (!existing) return {};
      return patchStream(state, conversationId, {
        status: "stopped",
        interrupted: existing.content.length > 0,
      });
    }),

  clearStream: (conversationId) =>
    set((state) => {
      if (!state.streams[conversationId]) return {};
      const streams = { ...state.streams };
      delete streams[conversationId];
      return { streams };
    }),
}));

/** True while a request is actively starting/streaming (blocks refetch). */
export function isStreamActive(stream: ActiveStreamState | undefined): stream is ActiveStreamState {
  return Boolean(stream && (stream.status === "starting" || stream.status === "streaming"));
}

export function getStreamForConversation(
  streams: Record<string, ActiveStreamState>,
  conversationId: string | undefined | null,
): ActiveStreamState | undefined {
  if (!conversationId) return undefined;
  return streams[conversationId];
}
