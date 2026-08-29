// Conversation queries for chat UI.

import { useQuery } from "@tanstack/react-query";
import { CONVERSATIONS_QUERY_KEY } from "@/features/conversations/model/conversationMutations";
import {
  fetchConversation,
  fetchConversations,
} from "@/shared/supabase/queries/conversations";

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: fetchConversations,
    staleTime: 30_000,
  });
}

export function useConversation(conversationId: string | undefined | null) {
  return useQuery({
    queryKey: ["conversations", "detail", conversationId],
    queryFn: () => fetchConversation(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 30_000,
  });
}
