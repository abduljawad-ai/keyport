// save-api-key handler security tests.
// Uses the REAL crypto module (envelope encryption must actually work) and
// mocks only the auth/admin/provider edges. No real API keys anywhere.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EdgeEnv } from "../_shared/supabaseAdmin.ts";
import type { ApiKeyRow, ProviderConnectionRow } from "../_shared/supabaseAdmin.ts";
import { handler } from "../save-api-key/index.ts";
import { base64Encode } from "../_shared/crypto.ts";

const calls = vi.hoisted(() => ({
  apiKeyInserts: [] as Array<Record<string, unknown>>,
  connectionUpserts: [] as Array<Record<string, unknown>>,
  vaultInserts: [] as Array<Record<string, unknown>>,
  securityEvents: [] as Array<Record<string, unknown>>,
  adapterTestBehavior: { ok: true, code: "invalid_api_key", message: "" },
  adapterTestCalls: [] as Array<Record<string, unknown>>,
}));

// --- module mocks (relative paths resolve to the same files the handler imports)

vi.mock("../_shared/supabaseAdmin.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_shared/supabaseAdmin.ts")>();
  const connection = (overrides: Partial<ProviderConnectionRow> = {}): ProviderConnectionRow => ({
    id: "conn-1",
    user_id: "user-1",
    provider_id: "openai",
    display_name: "Work key",
    enabled: true,
    base_url: null,
    organization_id: null,
    project_id: null,
    default_model_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
  return {
    ...actual,
    createAdminClient: (env: EdgeEnv) => ({ env, fetchImpl: vi.fn() }),
    // Rate limiter rpc: always within budget.
    rpc: vi.fn(async () => [
      { new_counter: 1, window_start: new Date().toISOString() },
    ]),
    getVaultByUserId: vi.fn(async () => null),
    ensureVaultForUser: vi.fn(async (_admin: unknown, userId: string, wrapped: Record<string, unknown>) => {
      calls.vaultInserts.push({ userId, ...wrapped });
      return {
        id: "vault-1",
        user_id: userId,
        algorithm: "A256GCM",
        key_wrapping_algorithm: "A256GCM",
        wrapped_data_key: wrapped.wrappedDataKey,
        wrap_iv: wrapped.wrapIv,
        master_key_id: wrapped.masterKeyId,
        vault_version: 1,
      };
    }),
    upsertConnection: vi.fn(async (_admin: unknown, input: Record<string, unknown>) => {
      calls.connectionUpserts.push(input);
      return connection({
        provider_id: (input.providerId as ProviderConnectionRow["provider_id"]) ?? "openai",
        display_name: (input.displayName as string | null) ?? null,
        base_url: (input.baseUrl as string | null) ?? null,
        default_model_id: (input.defaultModelId as string | null) ?? null,
      });
    }),
    upsertApiKey: vi.fn(async (_admin: unknown, input: Record<string, unknown>) => {
      calls.apiKeyInserts.push(input);
      return {
        id: "key-1",
        created_at: "2026-01-01T00:00:00.000Z",
        last_verified_at: "2026-01-01T00:00:00.000Z",
        last_used_at: null,
        status: "active",
      } as unknown as ApiKeyRow;
    }),
    insertSecurityEvent: vi.fn(async (_admin: unknown, input: Record<string, unknown>) => {
      calls.securityEvents.push(input);
    }),
  };
});

vi.mock("../_shared/providers/index.ts", () => ({
  createAdapterForEnv: () => ({
    providerId: "openai",
    async testConnection(credentials: Record<string, unknown>) {
      calls.adapterTestCalls.push(credentials);
      if (calls.adapterTestBehavior.ok) {
        return { ok: true, message: "API key is valid." };
      }
      return {
        ok: false,
        code: calls.adapterTestBehavior.code,
        message: calls.adapterTestBehavior.message,
      };
    },
    async *streamChat() {
      yield { type: "done" };
    },
  }),
  resolveBaseUrl: (providerId: string, storedBaseUrl: string | null) =>
    providerId === "openai-compatible"
      ? storedBaseUrl ?? null
      : providerId === "xai"
        ? "https://api.x.ai/v1"
        : null,
  isCustomProvider: (providerId: string) => providerId === "openai-compatible",
}));

// --- helpers ------------------------------------------------------------------

function makeEnv(): EdgeEnv {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-value",
    MASTER_ENCRYPTION_KEY: base64Encode(bytes),
    MASTER_ENCRYPTION_KEY_ID: "v1",
    FRONTEND_ORIGIN: "http://localhost:5173",
  };
}

function mockSupabaseAuth(behavior: "ok" | "unauthorized" | "invalid-token" = "ok") {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    const authRequest = url.includes("/auth/v1/user");
    if (!authRequest) throw new Error(`Unexpected fetch in test: ${url}`);
    if (behavior === "ok") {
      return new Response(JSON.stringify({ id: "user-1", email: "u@example.test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (behavior === "invalid-token") {
      // token too short for extractBearerToken — no fetch should happen.
      return new Response("{}", { status: 500 });
    }
    return new Response("{}", { status: 401 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function saveRequest(body: Record<string, unknown>, token = "valid-token-aaaaaaaaaaaaaaaaaaaa"): Request {
  return new Request("http://localhost:54321/functions/v1/save-api-key", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const FAKE_KEY = "sk-fake-not-a-real-key-1234567890abcdef";

// --- tests ---------------------------------------------------------------------

beforeEach(() => {
  calls.apiKeyInserts.length = 0;
  calls.connectionUpserts.length = 0;
  calls.vaultInserts.length = 0;
  calls.securityEvents.length = 0;
  calls.adapterTestCalls.length = 0;
  calls.adapterTestBehavior = { ok: true, code: "invalid_api_key", message: "" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("save-api-key: authentication (real auth module, stubbed GoTrue)", () => {
  it("rejects requests without a token (401 unauthorized)", async () => {
    mockSupabaseAuth("ok");
    const req = new Request("http://localhost:54321/functions/v1/save-api-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_id: "openai", api_key: FAKE_KEY }),
    });
    const response = await handler(req, makeEnv());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("unauthorized");
    expect(calls.adapterTestCalls).toHaveLength(0); // no provider call before auth
  });

  it("rejects invalid provider tokens from GoTrue (401)", async () => {
    mockSupabaseAuth("unauthorized");
    const response = await handler(
      saveRequest({ provider_id: "openai", api_key: FAKE_KEY }),
      makeEnv(),
    );
    expect(response.status).toBe(401);
    expect(calls.adapterTestCalls).toHaveLength(0);
  });

  it("never trusts body user_id (ignored; session identity used)", async () => {
    mockSupabaseAuth("ok");
    const response = await handler(
      saveRequest({ provider_id: "openai", api_key: FAKE_KEY, user_id: "attacker-id" }),
      makeEnv(),
    );
    expect(response.status).toBe(200);
    expect(calls.connectionUpserts[0]?.userId).toBe("user-1");
    expect(JSON.stringify(calls.apiKeyInserts[0])).not.toContain("attacker-id");
  });
});

describe("save-api-key: storage security", () => {
  it("stores ONLY encrypted key material (real envelope crypto)", async () => {
    mockSupabaseAuth("ok");
    const response = await handler(
      saveRequest({ provider_id: "openai", api_key: FAKE_KEY, label: "Work key" }),
      makeEnv(),
    );
    expect(response.status).toBe(200);

    // A vault with a WRAPPED data key was created.
    expect(calls.vaultInserts).toHaveLength(1);
    const vault = calls.vaultInserts[0] as Record<string, string>;
    expect(vault.wrappedDataKey).toBeTruthy();
    expect(vault.wrapIv).toBeTruthy();
    expect(vault.masterKeyId).toBe("v1");

    // The api_keys insert contains ciphertext + IV only.
    expect(calls.apiKeyInserts).toHaveLength(1);
    const stored = calls.apiKeyInserts[0] as Record<string, string>;
    expect(stored.encryptedKey).toBeTruthy();
    expect(stored.iv).toBeTruthy();
    expect(stored.algorithm).toBe("A256GCM");

    // The plaintext key appears NOWHERE in persisted data or response.
    const serialized = JSON.stringify({
      apiKeyInserts: calls.apiKeyInserts,
      vaultInserts: calls.vaultInserts,
      connectionUpserts: calls.connectionUpserts,
    });
    expect(serialized).not.toContain(FAKE_KEY);
    const responseBody = await response.json();
    expect(JSON.stringify(responseBody)).not.toContain(FAKE_KEY);
  });

  it("response contains only non-secret metadata", async () => {
    mockSupabaseAuth("ok");
    const response = await handler(
      saveRequest({ provider_id: "openai", api_key: FAKE_KEY }),
      makeEnv(),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.provider_connection.id).toBe("conn-1");
    expect(body.api_key_metadata.status).toBe("active");

    // Forbidden per spec: no property named after secret material at ANY
    // nesting level. (api_key_metadata is the spec's own metadata field and
    // must not trip the check for the secret field `api_key` itself.)
    const FORBIDDEN_KEYS = [
      "api_key",
      "encrypted_key",
      "iv",
      "wrapped_data_key",
      "wrap_iv",
      "master_key",
      "data_key",
    ];
    const allKeys = new Set<string>();
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) collectKeys(item);
      } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          allKeys.add(k);
          collectKeys(v);
        }
      }
    };
    collectKeys(body);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(allKeys.has(forbidden), `response must not expose "${forbidden}"`).toBe(false);
    }
    // And no secret material in any value, either.
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it("does NOT store a key when the provider test fails", async () => {
    mockSupabaseAuth("ok");
    calls.adapterTestBehavior = {
      ok: false,
      code: "invalid_api_key",
      message: "The provider rejected the API key.",
    };
    const response = await handler(
      saveRequest({ provider_id: "openai", api_key: FAKE_KEY }),
      makeEnv(),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_api_key");
    expect(calls.apiKeyInserts).toHaveLength(0);
    expect(calls.connectionUpserts).toHaveLength(0);
  });

  it("rejects openai-compatible without base_url", async () => {
    mockSupabaseAuth("ok");
    const response = await handler(
      saveRequest({ provider_id: "openai-compatible", api_key: FAKE_KEY }),
      makeEnv(),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("validation_error");
  });

  it("rejects private base URLs before any provider call (SSRF guard)", async () => {
    mockSupabaseAuth("ok");
    const response = await handler(
      saveRequest({
        provider_id: "openai-compatible",
        api_key: FAKE_KEY,
        base_url: "https://169.254.169.254/latest/meta-data",
      }),
      makeEnv(),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("validation_error");
    expect(calls.adapterTestCalls).toHaveLength(0);
  });
});

describe("save-api-key: named OpenAI-compatible provider (locked registry URL)", () => {
  it("tests against the registry URL and stores base_url NULL (named rows never carry one)", async () => {
    mockSupabaseAuth("ok");
    const response = await handler(
      saveRequest({ provider_id: "xai", api_key: FAKE_KEY, label: "Grok" }),
      makeEnv(),
    );
    expect(response.status).toBe(200);
    // The provider was tested against the LOCKED registry URL — never null,
    // never a client-supplied value (the handler ignores input.base_url).
    expect(calls.adapterTestCalls).toHaveLength(1);
    expect(calls.adapterTestCalls[0]?.baseUrl).toBe("https://api.x.ai/v1");
    // base_url is only persisted for the custom provider; named rows keep
    // NULL because the registry URL is authoritative at request time.
    expect(calls.connectionUpserts[0]?.providerId).toBe("xai");
    expect(calls.connectionUpserts[0]?.baseUrl).toBeNull();
    expect(calls.apiKeyInserts).toHaveLength(1);
  });

  it("never runs the SSRF guard for a named provider (registry URL is trusted)", async () => {
    mockSupabaseAuth("ok");
    const response = await handler(
      saveRequest({ provider_id: "xai", api_key: FAKE_KEY }),
      makeEnv(),
    );
    // If assertSafePublicUrl ran it would fetch the provider URL, which the
    // auth-only fetch mock rejects loudly — a clean 200 means it was skipped.
    expect(response.status).toBe(200);
    expect(calls.adapterTestCalls).toHaveLength(1);
  });
});
