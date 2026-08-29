// Message queries for chat UI.
//
// While a stream is active for this conversation the query is disabled:
// this suppresses background refetches that could render a duplicate of
// the temporary assistant message (spec Part 4 §16.11). After the stream
// finishes the query re-enables and reconciles by message id.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getStreamForConversation,
  isStreamActive,
  useChatStreamStore,
} from "@/features/chat/model/chatStreamStore";
import { fetchMessages } from "@/shared/supabase/queries/messages";
import type { MessageDbRow } from "@/shared/supabase/types";

export function messagesQueryKey(conversationId: string) {
  return ["messages", conversationId] as const;
}

export function useMessages(conversationId: string | undefined | null) {
  const streamActive = useChatStreamStore((state) =>
    isStreamActive(getStreamForConversation(state.streams, conversationId)),
  );

  return useQuery({
    queryKey: messagesQueryKey(conversationId ?? "none"),
    queryFn: () => fetchMessages(conversationId!),
    enabled: Boolean(conversationId) && !streamActive,
    staleTime: 30_000,
  });
}

/** Optimistically append a user message to the cache. */
export function useOptimisticMessageAppend() {
  const queryClient = useQueryClient();
  return (conversationId: string, message: MessageDbRow) => {
    queryClient.setQueryData<MessageDbRow[]>(
      messagesQueryKey(conversationId),
      (current) => {
        const base = current ?? [];
        if (base.some((row) => row.id === message.id)) return base;
        return [...base, message];
      },
    );
  };
}
