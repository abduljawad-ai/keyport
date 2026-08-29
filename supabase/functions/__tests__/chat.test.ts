// chat handler tests: auth, missing-key failure, SSE streaming behavior,
// provider-auth invalidation. Real crypto; mocked admin + adapter.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiKeyRow,
  ConversationRow,
  EdgeEnv,
  MessageRow,
  ProviderConnectionRow,
  VaultRow,
} from "../_shared/supabaseAdmin.ts";
import {
  base64Encode,
  encryptApiKey,
  generateDataKeyBytes,
  loadMasterKey,
  unwrapDataKey,
  wrapDataKey,
} from "../_shared/crypto.ts";
import { handler } from "../chat/index.ts";

const REAL_PLAINTEXT_KEY = "sk-fake-chat-provider-key-abcdefghij";

const behavior = vi.hoisted(() => ({
  streamChunks: [] as Array<Record<string, unknown>>,
  updateMessages: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  usageEvents: [] as Array<Record<string, unknown>>,
  keyFieldUpdates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  securityEvents: [] as Array<Record<string, unknown>>,
  seenCredentials: undefined as Record<string, unknown> | undefined,
}));

vi.mock("../_shared/supabaseAdmin.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_shared/supabaseAdmin.ts")>();
  return {
    ...actual,
    createAdminClient: (env: EdgeEnv) => ({ env, fetchImpl: vi.fn() }),
    rpc: vi.fn(async () => [{ new_counter: 1, window_start: new Date().toISOString() }]),
    getOwnedConversation: vi.fn(async () => CONVERSATION),
    getMessageById: vi.fn(async () => USER_MESSAGE),
    listConnectionsForUser: vi.fn(async () => [CONNECTION]),
    listApiKeysForUser: vi.fn(async () => [API_KEY_ROW]),
    getApiKeyByConnection: vi.fn(async () => API_KEY_ROW),
    getVaultByUserId: vi.fn(async () => VAULT_ROW),
    listConversationMessages: vi.fn(async () => [USER_MESSAGE]),
    findAssistantAttemptByIdempotencyKey: vi.fn(async () => null),
    insertAssistantMessage: vi.fn(async () => ({
      ...ASSISTANT_STREAMING,
    })),
    updateMessage: vi.fn(async (_admin: unknown, id: string, patch: Record<string, unknown>) => {
      behavior.updateMessages.push({ id, patch });
    }),
    insertUsageEvent: vi.fn(async (_admin: unknown, input: Record<string, unknown>) => {
      behavior.usageEvents.push(input);
    }),
    updateApiKeyFields: vi.fn(async (_admin: unknown, id: string, patch: Record<string, unknown>) => {
      behavior.keyFieldUpdates.push({ id, patch });
    }),
    insertSecurityEvent: vi.fn(async (_admin: unknown, input: Record<string, unknown>) => {
      behavior.securityEvents.push(input);
    }),
  };
});

vi.mock("../_shared/providers/index.ts", () => ({
  createAdapterForEnv: () => ({
    providerId: "openai",
    async testConnection() {
      return { ok: true };
    },
    async *streamChat(request: { signal: AbortSignal }, credentials: Record<string, unknown>) {
      behavior.seenCredentials = credentials;
      for (const chunk of behavior.streamChunks) {
        if (request.signal.aborted) return;
        yield chunk;
      }
    },
  }),
  resolveBaseUrl: (providerId: string, storedBaseUrl: string | null) =>
    providerId === "openai-compatible" ? storedBaseUrl ?? null : null,
  isCustomProvider: (providerId: string) => providerId === "openai-compatible",
}));

// --- fixtures ------------------------------------------------------------------

// The chat API validates conversation_id / user_message_id /
// provider_connection_id as UUIDs (spec Part 2 §15, Part 3 §19), so fixture
// ids must be syntactically valid UUIDs.
const CONV_ID = "11111111-1111-4111-8111-111111111111";
const USER_MSG_ID = "22222222-2222-4222-8222-222222222222";
const CONN_ID = "33333333-3333-4333-8333-333333333333";

// One master key for the whole module: the vault fixture is built with it in
// beforeEach, so every handler invocation must see the same key material.
const TEST_MASTER_KEY = (() => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Encode(bytes);
})();

function makeEnv(): EdgeEnv {
  return {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-value",
    MASTER_ENCRYPTION_KEY: TEST_MASTER_KEY,
    MASTER_ENCRYPTION_KEY_ID: "v1",
    FRONTEND_ORIGIN: "http://localhost:5173",
  };
}

const CONVERSATION: ConversationRow = {
  id: CONV_ID,
  user_id: "user-1",
  title: "Test",
  provider_id: null,
  model_id: null,
  system_prompt: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const USER_MESSAGE: MessageRow = {
  id: USER_MSG_ID,
  seq: 1,
  conversation_id: CONV_ID,
  user_id: "user-1",
  role: "user",
  content: "hello there",
  provider_id: null,
  model_id: null,
  status: "complete",
  error: null,
  input_tokens: null,
  output_tokens: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

const CONNECTION: ProviderConnectionRow = {
  id: CONN_ID,
  user_id: "user-1",
  provider_id: "openai",
  display_name: null,
  enabled: true,
  base_url: null,
  organization_id: null,
  project_id: null,
  default_model_id: "gpt-4o-mini",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

let API_KEY_ROW: ApiKeyRow;
let VAULT_ROW: VaultRow;

interface VaultFixture {
  vault: VaultRow;
  keyRow: ApiKeyRow;
}

async function buildVault(env: EdgeEnv): Promise<VaultFixture> {
  const masterKey = await loadMasterKey(env);
  const dataKeyBytes = generateDataKeyBytes();
  const wrapped = await wrapDataKey(masterKey, dataKeyBytes);
  const dataKey = await unwrapDataKey(masterKey, wrapped.wrappedDataKey, wrapped.wrapIv);
  const encrypted = await encryptApiKey(dataKey, REAL_PLAINTEXT_KEY);
  return {
    vault: {
      id: "vault-1",
      user_id: "user-1",
      algorithm: "A256GCM",
      key_wrapping_algorithm: "A256GCM",
      wrapped_data_key: wrapped.wrappedDataKey,
      wrap_iv: wrapped.wrapIv,
      master_key_id: "v1",
      vault_version: 1,
    },
    keyRow: {
      id: "key-1",
      user_id: "user-1",
      provider_connection_id: CONN_ID,
      encrypted_key: encrypted.encryptedKey,
      iv: encrypted.iv,
      algorithm: "A256GCM",
      master_key_id: "v1",
      key_version: 1,
      status: "active",
      last_verified_at: null,
      last_used_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

const ASSISTANT_STREAMING: MessageRow = {
  id: "asst-1",
  seq: 2,
  conversation_id: CONV_ID,
  user_id: "user-1",
  role: "assistant",
  content: "",
  provider_id: "openai",
  model_id: "gpt-4o-mini",
  status: "streaming",
  error: null,
  input_tokens: null,
  output_tokens: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

function mockSupabaseAuth(ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (!url.includes("/auth/v1/user")) throw new Error(`Unexpected fetch: ${url}`);
      return ok
        ? new Response(JSON.stringify({ id: "user-1", email: "u@example.test" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response("{}", { status: 401 });
    }),
  );
}

function chatRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:54321/functions/v1/chat", {
    method: "POST",
    headers: {
      authorization: "Bearer valid-token-aaaaaaaaaaaaaaaaaaaa",
      "content-type": "application/json",
      origin: "http://localhost:5173",
    },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = {
  conversation_id: CONV_ID,
  user_message_id: USER_MSG_ID,
  provider_connection_id: CONN_ID,
  model: "gpt-4o-mini",
  stream: true,
};

// --- tests ----------------------------------------------------------------------

beforeEach(async () => {
  behavior.streamChunks = [];
  behavior.updateMessages = [];
  behavior.usageEvents = [];
  behavior.keyFieldUpdates = [];
  behavior.securityEvents = [];
  behavior.seenCredentials = undefined;
  const built = await buildVault(makeEnv());
  VAULT_ROW = built.vault;
  API_KEY_ROW = built.keyRow;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat: authentication & ownership", () => {
  it("rejects unauthenticated requests with 401", async () => {
    mockSupabaseAuth(true);
    const req = new Request("http://localhost:54321/functions/v1/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(BASE_BODY),
    });
    const response = await handler(req, makeEnv());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("unauthorized");
  });

  it("rejects another user's conversation with 404", async () => {
    mockSupabaseAuth(true);
    const supabaseAdmin = await import("../_shared/supabaseAdmin.ts");
    vi.mocked(supabaseAdmin.getOwnedConversation).mockResolvedValueOnce(null as never);
    const response = await handler(chatRequest(BASE_BODY), makeEnv());
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("rejects a user_message_id that isn't a user message", async () => {
    mockSupabaseAuth(true);
    const supabaseAdmin = await import("../_shared/supabaseAdmin.ts");
    vi.mocked(supabaseAdmin.getMessageById).mockResolvedValueOnce({
      ...USER_MESSAGE,
      role: "assistant",
    } as never);
    const response = await handler(chatRequest(BASE_BODY), makeEnv());
    expect(response.status).toBe(404);
  });
});

describe("chat: API key requirements", () => {
  it("fails cleanly with missing_api_key when no key exists", async () => {
    mockSupabaseAuth(true);
    const supabaseAdmin = await import("../_shared/supabaseAdmin.ts");
    vi.mocked(supabaseAdmin.getApiKeyByConnection).mockResolvedValueOnce(null as never);
    const response = await handler(chatRequest(BASE_BODY), makeEnv());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("missing_api_key");
    expect(JSON.stringify(body)).not.toContain(REAL_PLAINTEXT_KEY);
  });

  it("fails when key status is invalid", async () => {
    mockSupabaseAuth(true);
    const supabaseAdmin = await import("../_shared/supabaseAdmin.ts");
    vi.mocked(supabaseAdmin.getApiKeyByConnection).mockResolvedValueOnce({
      ...API_KEY_ROW,
      status: "invalid",
    } as never);
    const response = await handler(chatRequest(BASE_BODY), makeEnv());
    const body = await response.json();
    expect(body.error.code).toBe("missing_api_key");
  });

  it("rejects disabled connections", async () => {
    mockSupabaseAuth(true);
    const supabaseAdmin = await import("../_shared/supabaseAdmin.ts");
    vi.mocked(supabaseAdmin.listConnectionsForUser).mockResolvedValueOnce([
      { ...CONNECTION, enabled: false },
    ] as never);
    const response = await handler(chatRequest(BASE_BODY), makeEnv());
    const body = await response.json();
    expect(body.error.code).toBe("validation_error");
  });
});

describe("chat: streaming events", () => {
  it("emits start/delta/usage/done and finalizes the assistant message", async () => {
    mockSupabaseAuth(true);
    behavior.streamChunks = [
      { type: "text_delta", text: "Hel" },
      { type: "text_delta", text: "lo" },
      { type: "usage", input_tokens: 5, output_tokens: 2 },
      { type: "done" },
    ];

    const response = await handler(chatRequest(BASE_BODY), makeEnv());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    const text = await response.text();
    expect(text).toContain("event: start");
    expect(text).toContain('"assistant_message_id":"asst-1"');
    expect(text).toContain('event: delta\ndata: {"content":"Hel"}');
    expect(text).toContain('event: delta\ndata: {"content":"lo"}');
    expect(text).toContain("event: usage");
    expect(text).toContain('"input_tokens":5');
    expect(text).toContain("event: done");
    expect(text).not.toContain(REAL_PLAINTEXT_KEY);

    // Assistant row finalized with full content + usage columns.
    const finalize = behavior.updateMessages.find((u) => u.id === "asst-1");
    expect(finalize?.patch.status).toBe("complete");
    expect(finalize?.patch.content).toBe("Hello");
    expect(finalize?.patch.input_tokens).toBe(5);
    expect(finalize?.patch.output_tokens).toBe(2);

    // Usage recorded server-side only.
    expect(behavior.usageEvents).toHaveLength(1);
    expect(behavior.usageEvents[0]).toMatchObject({
      userId: "user-1",
      providerId: "openai",
      modelId: "gpt-4o-mini",
      inputTokens: 5,
      outputTokens: 2,
    });

    // last_used_at updated.
    expect(behavior.keyFieldUpdates.some((u) => u.id === "key-1" && "last_used_at" in u.patch)).toBe(
      true,
    );
  });

  it("decrypts the stored key and passes it to the adapter (server-side only)", async () => {
    mockSupabaseAuth(true);
    behavior.streamChunks = [
      { type: "text_delta", text: "ok" },
      { type: "done" },
    ];

    const response = await handler(chatRequest(BASE_BODY), makeEnv());
    const text = await response.text();
    expect(text).toContain("event: done");
    expect(behavior.seenCredentials?.apiKey).toBe(REAL_PLAINTEXT_KEY);
    expect(JSON.stringify(behavior.seenCredentials)).not.toContain(API_KEY_ROW.encrypted_key);
  });

  it("marks the key invalid and emits an SSE error event on provider auth failure", async () => {
    mockSupabaseAuth(true);
    behavior.streamChunks = [
      { type: "error", code: "invalid_api_key", message: "The provider rejected the API key." },
    ];

    const response = await handler(chatRequest(BASE_BODY), makeEnv());
    const text = await response.text();
    expect(text).toContain("event: start");
    expect(text).toContain("event: error");
    expect(text).toContain('"code":"invalid_api_key"');

    expect(
      behavior.keyFieldUpdates.some((u) => u.id === "key-1" && u.patch.status === "invalid"),
    ).toBe(true);
    expect(behavior.securityEvents.some((e) => e.eventType === "api_key_invalidated")).toBe(true);

    const finalize = behavior.updateMessages.find((u) => u.id === "asst-1");
    expect(finalize?.patch.status).toBe("error");
  });

  it("persists all received content when the provider completes after deltas", async () => {
    mockSupabaseAuth(true);
    behavior.streamChunks = [{ type: "text_delta", text: "partial" }];
    const req = chatRequest(BASE_BODY);
    const response = await handler(req, makeEnv());
    // No done marker → generator ends; stream closes cleanly (treated as
    // provider completion for the captured content).
    const text = await response.text();
    expect(text).toContain('"content":"partial"');
    const finalize = behavior.updateMessages.find((u) => u.id === "asst-1");
    expect(finalize?.patch.content).toBe("partial");
    expect(finalize?.patch.status).toBe("complete");
  });

  it("returns a JSON error (not SSE) when validation fails before streaming", async () => {
    mockSupabaseAuth(true);
    const response = await handler(
      chatRequest({ conversation_id: CONV_ID, user_message_id: "not-a-uuid" }),
      makeEnv(),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.error.code).toBe("validation_error");
  });
});
