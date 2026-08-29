// Database row typings for tables the browser may access.
// Deliberately excludes user_vaults/api_keys: the browser must never query
// secret tables.

import type { ChatRole, MessageStatus } from "@/shared/types/chat";
import type { ProviderId } from "@/shared/types/provider";

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderConnectionRow {
  id: string;
  user_id: string;
  provider_id: ProviderId;
  display_name: string | null;
  enabled: boolean;
  base_url: string | null;
  organization_id: string | null;
  project_id: string | null;
  default_model_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationDbRow {
  id: string;
  user_id: string;
  title: string;
  provider_id: string | null;
  model_id: string | null;
  system_prompt: string | null;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageDbRow {
  id: string;
  seq: number;
  conversation_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  provider_id: string | null;
  model_id: string | null;
  status: MessageStatus;
  error: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UsageEventRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  provider_id: string | null;
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_estimate: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UserSettingsRow {
  user_id: string;
  theme: string;
  locale: string;
  send_behavior: string;
  preferences: Record<string, unknown>;
  updated_at: string;
}
