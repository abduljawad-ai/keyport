// ============================================================================
// _shared/supabaseAdmin.ts
// Service-role data access for Edge Functions.
//
// This module is the ONLY path through which secret tables (user_vaults,
// api_keys) are touched. It uses the Supabase REST API with the service
// role key. The service role key must never leave server code.
//
// The client is dependency-free (plain fetch) and accepts an injected
// fetch implementation so handlers can be unit-tested without network.
// ============================================================================

import { appError } from "./errors.ts";

export interface EdgeEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MASTER_ENCRYPTION_KEY: string;
  MASTER_ENCRYPTION_KEY_ID: string;
  FRONTEND_ORIGIN?: string;
  ALLOW_LOCAL_PROVIDER_URLS?: string;
}

export type FetchImpl = typeof fetch;

export interface AdminClient {
  env: EdgeEnv;
  fetchImpl: FetchImpl;
}

export function createAdminClient(env: EdgeEnv, fetchImpl: FetchImpl = fetch): AdminClient {
  return { env, fetchImpl };
}

/** Validate that critical server secrets are configured. Fail closed. */
export function assertServerConfigured(env: EdgeEnv): void {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw appError("internal_error", "Server is misconfigured.", {
      internalMessage: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }
}

export function assertCryptoConfigured(env: EdgeEnv): void {
  if (!env.MASTER_ENCRYPTION_KEY || !env.MASTER_ENCRYPTION_KEY_ID) {
    throw appError("internal_error", "Server is misconfigured.", {
      internalMessage: "Missing MASTER_ENCRYPTION_KEY or MASTER_ENCRYPTION_KEY_ID",
    });
  }
}

function adminHeaders(env: EdgeEnv): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

function restUrl(env: EdgeEnv, path: string): string {
  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/rest/v1/${path.replace(/^\/+/, "")}`;
}

export interface AdminRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  prefer?: string[];
  accept?: string;
}

/** Raw service-role REST call. Throws AppError on non-2xx. */
export async function adminFetch(
  admin: AdminClient,
  path: string,
  options: AdminRequestOptions = {},
): Promise<Response> {
  assertServerConfigured(admin.env);
  const url = new URL(restUrl(admin.env, path));
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = {
    ...adminHeaders(admin.env),
    ...(options.prefer?.length ? { Prefer: options.prefer.join(",") } : {}),
    ...(options.accept ? { Accept: options.accept } : {}),
  };

  let response: Response;
  try {
    response = await admin.fetchImpl(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (err) {
    throw appError("internal_error", "Database request failed.", {
      internalMessage: `admin fetch failed: ${String((err as Error)?.message ?? err)}`,
    });
  }
  return response;
}

const OBJECT_ACCEPT = "application/vnd.pgrst.object+json";

async function parseAdminResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  const text = await response.text().catch(() => "");
  let pgMessage = "";
  try {
    const parsed = JSON.parse(text) as { message?: string; hint?: string };
    pgMessage = parsed.message ?? "";
  } catch {
    /* not JSON */
  }
  if (response.status === 406) {
    // PostgREST "object not found" for single-object accept header.
    return null as T;
  }
  throw appError("internal_error", "Database request failed.", {
    status: response.status >= 500 ? 502 : 500,
    internalMessage: `PostgREST ${response.status}: ${pgMessage.slice(0, 200)}`,
  });
}

// ---------------------------------------------------------------------------
// Domain rows
// ---------------------------------------------------------------------------

export interface VaultRow {
  id: string;
  user_id: string;
  algorithm: string;
  key_wrapping_algorithm: string;
  wrapped_data_key: string;
  wrap_iv: string;
  master_key_id: string;
  vault_version: number;
}

export interface ProviderConnectionRow {
  id: string;
  user_id: string;
  provider_id: "openai" | "anthropic" | "google" | "openai-compatible";
  display_name: string | null;
  enabled: boolean;
  base_url: string | null;
  organization_id: string | null;
  project_id: string | null;
  default_model_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  provider_connection_id: string;
  encrypted_key: string;
  iv: string;
  algorithm: string;
  master_key_id: string;
  key_version: number;
  status: "active" | "disabled" | "invalid";
  last_verified_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  provider_id: string | null;
  model_id: string | null;
  system_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  seq: number;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  provider_id: string | null;
  model_id: string | null;
  status: "pending" | "streaming" | "complete" | "error";
  error: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// --- vaults ---------------------------------------------------------------

export async function getVaultByUserId(
  admin: AdminClient,
  userId: string,
): Promise<VaultRow | null> {
  const response = await adminFetch(admin, "user_vaults", {
    query: { user_id: `eq.${userId}`, select: "*" },
    accept: OBJECT_ACCEPT,
  });
  return parseAdminResponse<VaultRow | null>(response);
}

/**
 * Race-safe vault provisioning.
 * Attempts an insert with `resolution=ignore-duplicates`; when a concurrent
 * request already created the vault, the existing canonical row is read
 * back. Both concurrent callers therefore converge on the same data key.
 */
export async function ensureVaultForUser(
  admin: AdminClient,
  userId: string,
  wrapped: { wrappedDataKey: string; wrapIv: string; masterKeyId: string },
): Promise<VaultRow> {
  const insert = await adminFetch(admin, "user_vaults", {
    method: "POST",
    query: { select: "*" },
    body: {
      user_id: userId,
      algorithm: "A256GCM",
      key_wrapping_algorithm: "A256GCM",
      wrapped_data_key: wrapped.wrappedDataKey,
      wrap_iv: wrapped.wrapIv,
      master_key_id: wrapped.masterKeyId,
    },
    prefer: ["resolution=ignore-duplicates", "return=representation"],
  });
  const inserted = await parseAdminResponse<VaultRow[] | VaultRow | null>(insert);
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  if (row) return row;

  const existing = await getVaultByUserId(admin, userId);
  if (!existing) {
    throw appError("internal_error", "Could not provision secret storage.", {
      internalMessage: "vault upsert returned no row",
    });
  }
  return existing;
}

// --- provider connections ---------------------------------------------------

const CONNECTION_SELECT =
  "id,user_id,provider_id,display_name,enabled,base_url,organization_id,project_id,default_model_id,created_at,updated_at";

export async function listConnectionsForUser(
  admin: AdminClient,
  userId: string,
): Promise<ProviderConnectionRow[]> {
  const response = await adminFetch(admin, "provider_connections", {
    query: { user_id: `eq.${userId}`, select: CONNECTION_SELECT, order: "created_at.asc" },
  });
  return parseAdminResponse<ProviderConnectionRow[]>(response);
}

export async function getOwnedConnection(
  admin: AdminClient,
  userId: string,
  connectionId: string,
): Promise<ProviderConnectionRow | null> {
  const response = await adminFetch(admin, "provider_connections", {
    query: {
      id: `eq.${connectionId}`,
      user_id: `eq.${userId}`,
      select: CONNECTION_SELECT,
    },
    accept: OBJECT_ACCEPT,
  });
  return parseAdminResponse<ProviderConnectionRow | null>(response);
}

/** Idempotent upsert of a provider connection (one row per user+provider). */
export async function upsertConnection(
  admin: AdminClient,
  input: {
    userId: string;
    providerId: string;
    displayName: string | null;
    baseUrl: string | null;
    organizationId: string | null;
    projectId: string | null;
    defaultModelId: string | null;
  },
): Promise<ProviderConnectionRow> {
  const response = await adminFetch(admin, "provider_connections", {
    method: "POST",
    // Explicit conflict target: PostgREST infers the upsert conflict from the
    // table's first unique constraint (the `id` primary key), which is never
    // present in the payload — so a re-save over an existing connection fell
    // back to a plain INSERT and died with 23505. Pin the composite key.
    query: {
      select: CONNECTION_SELECT,
      on_conflict: "user_id,provider_id",
    },
    body: {
      user_id: input.userId,
      provider_id: input.providerId,
      display_name: input.displayName,
      base_url: input.baseUrl,
      organization_id: input.organizationId,
      project_id: input.projectId,
      default_model_id: input.defaultModelId,
      enabled: true,
    },
    prefer: ["resolution=merge-duplicates", "return=representation"],
  });
  const result = await parseAdminResponse<ProviderConnectionRow[] | null>(response);
  const row = result?.[0];
  if (!row) {
    throw appError("internal_error", "Could not save the provider connection.");
  }
  return row;
}

// --- api keys ----------------------------------------------------------------

const KEY_SELECT =
  "id,user_id,provider_connection_id,encrypted_key,iv,algorithm,master_key_id,key_version,status,last_verified_at,last_used_at,created_at,updated_at";

export async function getApiKeyByConnection(
  admin: AdminClient,
  providerConnectionId: string,
): Promise<ApiKeyRow | null> {
  const response = await adminFetch(admin, "api_keys", {
    query: {
      provider_connection_id: `eq.${providerConnectionId}`,
      select: KEY_SELECT,
    },
    accept: OBJECT_ACCEPT,
  });
  return parseAdminResponse<ApiKeyRow | null>(response);
}

export async function listApiKeysForUser(
  admin: AdminClient,
  userId: string,
): Promise<ApiKeyRow[]> {
  const response = await adminFetch(admin, "api_keys", {
    query: { user_id: `eq.${userId}`, select: KEY_SELECT },
  });
  return parseAdminResponse<ApiKeyRow[]>(response);
}

/** Insert-or-replace the encrypted key row for a provider connection. */
export async function upsertApiKey(
  admin: AdminClient,
  input: {
    userId: string;
    providerConnectionId: string;
    encryptedKey: string;
    iv: string;
    algorithm: string;
    masterKeyId: string;
  },
): Promise<ApiKeyRow> {
  const response = await adminFetch(admin, "api_keys", {
    method: "POST",
    // Same conflict-target pinning as upsertConnection: `api_keys`'s first
    // unique constraint is the `id` primary key, so a re-save of a key for an
    // existing connection needs the explicit `provider_connection_id` target
    // or the upsert degrades to a plain INSERT (23505).
    query: {
      select: KEY_SELECT,
      on_conflict: "provider_connection_id",
    },
    body: {
      user_id: input.userId,
      provider_connection_id: input.providerConnectionId,
      encrypted_key: input.encryptedKey,
      iv: input.iv,
      algorithm: input.algorithm,
      master_key_id: input.masterKeyId,
      status: "active",
      last_verified_at: new Date().toISOString(),
    },
    prefer: ["resolution=merge-duplicates", "return=representation"],
  });
  const result = await parseAdminResponse<ApiKeyRow[] | null>(response);
  const row = result?.[0];
  if (!row) {
    throw appError("internal_error", "Could not save the encrypted key.");
  }
  return row;
}

export async function updateApiKeyFields(
  admin: AdminClient,
  keyId: string,
  patch: Partial<{
    status: "active" | "disabled" | "invalid";
    last_verified_at: string;
    last_used_at: string;
  }>,
): Promise<void> {
  const response = await adminFetch(admin, "api_keys", {
    method: "PATCH",
    query: { id: `eq.${keyId}` },
    body: patch,
    prefer: ["return=minimal"],
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw appError("internal_error", "Could not update key metadata.");
  }
}

export async function deleteApiKeyByConnection(
  admin: AdminClient,
  providerConnectionId: string,
): Promise<void> {
  const response = await adminFetch(admin, "api_keys", {
    method: "DELETE",
    query: { provider_connection_id: `eq.${providerConnectionId}` },
    prefer: ["return=minimal"],
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw appError("internal_error", "Could not delete the key.");
  }
}

// --- conversations / messages -------------------------------------------------

export async function getOwnedConversation(
  admin: AdminClient,
  userId: string,
  conversationId: string,
): Promise<ConversationRow | null> {
  const response = await adminFetch(admin, "conversations", {
    query: {
      id: `eq.${conversationId}`,
      user_id: `eq.${userId}`,
      select: "id,user_id,title,provider_id,model_id,system_prompt,created_at,updated_at",
    },
    accept: OBJECT_ACCEPT,
  });
  return parseAdminResponse<ConversationRow | null>(response);
}

export async function getMessageById(
  admin: AdminClient,
  messageId: string,
): Promise<MessageRow | null> {
  const response = await adminFetch(admin, "messages", {
    query: { id: `eq.${messageId}`, select: "*" },
    accept: OBJECT_ACCEPT,
  });
  return parseAdminResponse<MessageRow | null>(response);
}

/**
 * Load conversation history ordered by seq. Fetches the newest `limit`
 * rows and returns them in ascending order.
 */
export async function listConversationMessages(
  admin: AdminClient,
  conversationId: string,
  limit: number,
): Promise<MessageRow[]> {
  const response = await adminFetch(admin, "messages", {
    query: {
      conversation_id: `eq.${conversationId}`,
      select: "*",
      order: "seq.desc",
      limit: String(limit),
    },
  });
  const rows = await parseAdminResponse<MessageRow[]>(response);
  return rows.reverse();
}

/**
 * Find the most recent assistant attempt for a conversation carrying the
 * given idempotency key in its metadata. Used to avoid duplicate attempts
 * when the same user message submission is retried.
 */
export async function findAssistantAttemptByIdempotencyKey(
  admin: AdminClient,
  conversationId: string,
  idempotencyKey: string,
): Promise<MessageRow | null> {
  const response = await adminFetch(admin, "messages", {
    query: {
      conversation_id: `eq.${conversationId}`,
      role: "eq.assistant",
      "metadata->>idempotency_key": `eq.${idempotencyKey}`,
      select: "*",
      order: "seq.desc",
      limit: "1",
    },
  });
  const rows = await parseAdminResponse<MessageRow[]>(response);
  return rows[0] ?? null;
}

export async function insertAssistantMessage(
  admin: AdminClient,
  input: {
    conversationId: string;
    userId: string;
    providerId: string;
    modelId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<MessageRow> {
  const response = await adminFetch(admin, "messages", {
    method: "POST",
    query: { select: "*" },
    body: {
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: "assistant",
      content: "",
      provider_id: input.providerId,
      model_id: input.modelId,
      status: "streaming",
      metadata: input.metadata ?? {},
    },
    prefer: ["return=representation"],
  });
  const rows = await parseAdminResponse<MessageRow[] | null>(response);
  const row = rows?.[0];
  if (!row) {
    throw appError("internal_error", "Could not create the assistant message.");
  }
  return row;
}

export async function updateMessage(
  admin: AdminClient,
  messageId: string,
  patch: Partial<{
    content: string;
    status: "pending" | "streaming" | "complete" | "error";
    error: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<void> {
  const response = await adminFetch(admin, "messages", {
    method: "PATCH",
    query: { id: `eq.${messageId}` },
    body: patch,
    prefer: ["return=minimal"],
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw appError("internal_error", "Could not finalize the assistant message.");
  }
}

export async function insertUsageEvent(
  admin: AdminClient,
  input: {
    userId: string;
    conversationId: string | null;
    messageId: string | null;
    providerId: string;
    modelId: string;
    inputTokens: number | null;
    outputTokens: number | null;
  },
): Promise<void> {
  const response = await adminFetch(admin, "usage_events", {
    method: "POST",
    body: {
      user_id: input.userId,
      conversation_id: input.conversationId,
      message_id: input.messageId,
      provider_id: input.providerId,
      model_id: input.modelId,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_estimate: null, // never invent pricing data
    },
    prefer: ["return=minimal"],
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    // Usage bookkeeping failures must not break the chat response, but we
    // surface them to logs via the caller.
    throw appError("internal_error", "Could not record usage.", {
      internalMessage: `usage_events insert failed: ${response.status}`,
    });
  }
}

export async function insertSecurityEvent(
  admin: AdminClient,
  input: { userId: string | null; eventType: string; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    await adminFetch(admin, "security_events", {
      method: "POST",
      body: {
        user_id: input.userId,
        event_type: input.eventType,
        metadata: input.metadata ?? {},
      },
      prefer: ["return=minimal"],
    });
  } catch {
    // Audit logging must never break the main flow.
  }
}

/** RPC call (used for the atomic rate limiter). */
export async function rpc<T>(
  admin: AdminClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await adminFetch(admin, `rpc/${fn}`, {
    method: "POST",
    body: args,
  });
  return parseAdminResponse<T>(response);
}
