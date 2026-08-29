// Message queries — direct Supabase access within RLS bounds.
//
// SECURITY: the browser may only INSERT messages with role='user' and
// status='complete' (enforced by RLS). Assistant/system/tool rows are
// written exclusively by the chat Edge Function with the service role.

import { supabase } from "@/shared/supabase/client";
import type { MessageDbRow } from "@/shared/supabase/types";
import { normalizeError } from "@/shared/lib/errors";

const MESSAGE_SELECT =
  "id,seq,conversation_id,user_id,role,content,provider_id,model_id,status,error,input_tokens,output_tokens,metadata,created_at,updated_at";

export async function fetchMessages(conversationId: string): Promise<MessageDbRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true })
    .limit(500);
  if (error) throw normalizeError(error);
  return data ?? [];
}

export interface InsertUserMessageInput {
  conversationId: string;
  content: string;
}

/** Insert a user message. RLS restricts this to role='user', complete. */
export async function insertUserMessage(
  input: InsertUserMessageInput,
): Promise<MessageDbRow> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      role: "user",
      status: "complete",
      content: input.content,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error) throw normalizeError(error);
  return data;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) throw normalizeError(error);
}
