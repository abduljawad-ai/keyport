// Chat stream orchestrator.
//
// Submission flow (spec Part 4 §16):
//   1. create the conversation on first message if needed
//   2. insert the user message (role=user only — RLS enforced)
//   3. render optimistically
//   4. create a temporary assistant message in UI state
//   5. call the `chat` Edge Function and consume SSE
//   6. map temp → server assistant id on `start`
//   7. finalize + reconcile by message id, then invalidate
//
// SECURITY: provider calls only ever happen through the Edge Function.

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { sendChatStream } from "@/shared/api/chatClient";
import { AppError, normalizeError } from "@/shared/lib/errors";
import { newIdempotencyKey, tempMessageId } from "@/shared/lib/id";
import {
  createConversation,
  updateConversation,
} from "@/shared/supabase/queries/conversations";
import { fetchMessages, insertUserMessage } from "@/shared/supabase/queries/messages";
import type { MessageDbRow } from "@/shared/supabase/types";
import type { ChatStreamEvent } from "@/shared/types/chat";
import {
  getStreamForConversation,
  useChatStreamStore,
} from "@/features/chat/model/chatStreamStore";
import { messagesQueryKey } from "@/features/chat/model/useMessages";
import { CONVERSATIONS_QUERY_KEY } from "@/features/conversations/model/conversationMutations";
import { deriveConversationTitle } from "@/features/chat/lib/messageFormatting";
import type { ProviderId } from "@/shared/types/provider";

/** Abort controllers live outside React state (not serializable). */
const abortControllers = new Map<string, AbortController>();

export interface SendMessageInput {
  content: string;
  /** null → create a new conversation with the first message. */
  conversationId: string | null;
  providerConnectionId: string;
  providerId: ProviderId;
  model: string;
}

export interface ChatStreamActions {
  send: (input: SendMessageInput) => Promise<void>;
  retry: (input: Omit<SendMessageInput, "content">) => Promise<void>;
  stop: (conversationId: string) => void;
  isSending: boolean;
}

export function useChatStream(): ChatStreamActions {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const store = useChatStreamStore;
  const sendingRef = useRef(false);

  const handleStreamEvent = useCallback(
    (conversationId: string, event: ChatStreamEvent) => {
      const state = store.getState();
      switch (event.type) {
        case "start":
          state.attachServerMessageId(conversationId, event.assistant_message_id);
          break;
        case "delta":
          state.appendDelta(conversationId, event.content);
          break;
        case "usage":
          state.setUsage(conversationId, {
            input_tokens: event.input_tokens,
            output_tokens: event.output_tokens,
          });
          break;
        case "done":
          state.completeStream(conversationId);
          break;
        case "error":
          state.failStream(conversationId, event.message);
          break;
      }
    },
    [store],
  );

  const finalizeStream = useCallback(
    async (conversationId: string) => {
      // Reconcile by message id BEFORE invalidating: the server-assigned id
      // is already attached, so the refetched rows merge without duplicates.
      // invalidateQueries() refetches active queries by default.
      await queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
      await queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      store.getState().clearStream(conversationId);
    },
    [queryClient, store],
  );

  const runStream = useCallback(
    async (
      conversationId: string,
      request: {
        userMessageId: string;
        providerConnectionId: string;
        model: string;
      },
    ): Promise<void> => {
      const controller = new AbortController();
      abortControllers.set(conversationId, controller);

      try {
        await sendChatStream(
          {
            conversationId,
            userMessageId: request.userMessageId,
            providerConnectionId: request.providerConnectionId,
            model: request.model,
            idempotencyKey: newIdempotencyKey(),
          },
          {
            signal: controller.signal,
            onEvent: (event) => handleStreamEvent(conversationId, event),
          },
        );
      } catch (err) {
        const normalized = normalizeError(err);
        if (normalized.code === "aborted") {
          // User-initiated stop: keep partial content in the store.
          store.getState().stopStream(conversationId);
          // The server persists partial content asynchronously; refresh.
          await queryClient
            .invalidateQueries({ queryKey: messagesQueryKey(conversationId) })
            .catch(() => {});
          return;
        }
        store.getState().failStream(conversationId, normalized.message);
      } finally {
        abortControllers.delete(conversationId);
      }

      const finalStatus = store.getState().streams[conversationId]?.status;
      if (finalStatus === "complete" || finalStatus === "error") {
        await finalizeStream(conversationId);
      } else if (!finalStatus) {
        // already cleared — nothing to do
      }
    },
    [finalizeStream, handleStreamEvent, queryClient, store],
  );

  const send = useCallback(
    async (input: SendMessageInput) => {
      const content = input.content.trim();
      if (!content || sendingRef.current) return;
      sendingRef.current = true;
      let conversationId: string | null = input.conversationId;

      try {
        // 1. Resolve/create the conversation.
        let isNewConversation = false;
        if (!conversationId) {
          const conversation = await createConversation({
            title: "New conversation",
            provider_id: input.providerId,
            model_id: input.model,
          });
          conversationId = conversation.id;
          isNewConversation = true;
          navigate(`/chat/${conversationId}`, { replace: true });
        }

        // 2. Insert the user message (role=user, status=complete — the only
        //    browser-writable shape per RLS).
        const userMessage = await insertUserMessage({ conversationId, content });

        // 3. Optimistic render.
        queryClient.setQueryData<MessageDbRow[]>(
          messagesQueryKey(conversationId),
          (current) => {
            const base = current ?? [];
            if (base.some((row) => row.id === userMessage.id)) return base;
            return [...base, userMessage];
          },
        );

        // 4. Title + provider/model bookkeeping.
        try {
          await updateConversation(conversationId, {
            provider_id: input.providerId,
            model_id: input.model,
            ...(isNewConversation
              ? { title: deriveConversationTitle(content) }
              : {}),
          });
          void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
        } catch {
          // Non-fatal: chat must still proceed.
        }

        // 5. Temporary assistant message + stream.
        store.getState().startStream(conversationId, tempMessageId());
        await runStream(conversationId, {
          userMessageId: userMessage.id,
          providerConnectionId: input.providerConnectionId,
          model: input.model,
        });
      } catch (err) {
        const normalized = normalizeError(err);
        if (conversationId) {
          store.getState().failStream(conversationId, normalized.message);
        }
        throw new AppError(normalized.code, normalized.message, { status: normalized.status });
      } finally {
        sendingRef.current = false;
      }
    },
    [navigate, queryClient, runStream, store],
  );

  const retry = useCallback(
    async (input: Omit<SendMessageInput, "content">) => {
      if (!input.conversationId || sendingRef.current) return;
      sendingRef.current = true;
      const conversationId = input.conversationId;
      try {
        // Retry = a NEW assistant attempt from the most recent user message.
        // The failed assistant row is left untouched.
        let messages = queryClient.getQueryData<MessageDbRow[]>(
          messagesQueryKey(conversationId),
        );
        if (!messages || messages.length === 0) {
          messages = await fetchMessages(conversationId);
        }
        const lastUserMessage = [...messages].reverse().find((row) => row.role === "user");
        if (!lastUserMessage) {
          throw new AppError("validation_error", "There is no user message to retry from.");
        }

        store.getState().startStream(conversationId, tempMessageId());
        await runStream(conversationId, {
          userMessageId: lastUserMessage.id,
          providerConnectionId: input.providerConnectionId,
          model: input.model,
        });
      } finally {
        sendingRef.current = false;
      }
    },
    [queryClient, runStream, store],
  );

  const stop = useCallback((conversationId: string) => {
    abortControllers.get(conversationId)?.abort();
  }, []);

  return { send, retry, stop, isSending: sendingRef.current };
}

/** Whether a stream is currently active for a conversation. */
export function useIsStreaming(conversationId: string | undefined | null): boolean {
  return useChatStreamStore((state) => {
    const stream = getStreamForConversation(state.streams, conversationId);
    return Boolean(stream && (stream.status === "starting" || stream.status === "streaming"));
  });
}
