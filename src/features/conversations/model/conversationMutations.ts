// Conversation mutations.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  createConversation,
  deleteConversation,
  updateConversation,
  type CreateConversationInput,
  type UpdateConversationPatch,
} from "@/shared/supabase/queries/conversations";

export const CONVERSATIONS_QUERY_KEY = ["conversations"] as const;

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) => createConversation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateConversationPatch }) =>
      updateConversation(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: (_data, deletedId) => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      queryClient.removeQueries({ queryKey: ["messages", deletedId] });
      // If the deleted conversation was open, return to the chat home.
      if (window.location.pathname === `/chat/${deletedId}`) {
        navigate("/chat", { replace: true });
      }
    },
  });
}
