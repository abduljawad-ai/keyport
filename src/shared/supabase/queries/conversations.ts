// Conversation queries — direct Supabase access (owner-scoped by RLS).

import { supabase } from "@/shared/supabase/client";
import type { ConversationDbRow } from "@/shared/supabase/types";
import { normalizeError } from "@/shared/lib/errors";

const CONVERSATION_SELECT =
  "id,user_id,title,provider_id,model_id,system_prompt,pinned,archived,created_at,updated_at";

export async function fetchConversations(): Promise<ConversationDbRow[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw normalizeError(error);
  return data ?? [];
}

export async function fetchConversation(id: string): Promise<ConversationDbRow | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw normalizeError(error);
  return data;
}

export interface CreateConversationInput {
  title?: string;
  provider_id?: string | null;
  model_id?: string | null;
  system_prompt?: string | null;
}

export async function createConversation(
  input: CreateConversationInput = {},
): Promise<ConversationDbRow> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      title: input.title?.trim() || "New conversation",
      provider_id: input.provider_id ?? null,
      model_id: input.model_id ?? null,
      system_prompt: input.system_prompt ?? null,
    })
    .select(CONVERSATION_SELECT)
    .single();
  if (error) throw normalizeError(error);
  return data;
}

export interface UpdateConversationPatch {
  title?: string;
  provider_id?: string | null;
  model_id?: string | null;
  system_prompt?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export async function updateConversation(
  id: string,
  patch: UpdateConversationPatch,
): Promise<ConversationDbRow> {
  const { data, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", id)
    .select(CONVERSATION_SELECT)
    .single();
  if (error) throw normalizeError(error);
  return data;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw normalizeError(error);
}
