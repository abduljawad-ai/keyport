// edgeClient auth/error behavior (spec: Edge Function auth rejection).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { edgeFetch, getFunctionsBaseUrl } from "./edgeClient";
import { AppError } from "@/shared/lib/errors";

vi.mock("@/shared/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "test-access-token" } },
      })),
    },
  },
}));

describe("getFunctionsBaseUrl", () => {
  it("derives the functions URL from the Supabase URL by default", () => {
    expect(getFunctionsBaseUrl()).toBe(
      "https://unit.test.supabase.co/functions/v1",
    );
  });
});

describe("edgeFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the Authorization bearer header", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await edgeFetch("list-provider-keys", { method: "GET" });
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-access-token");
  });

  it("throws a normalized unauthorized AppError on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthorized", message: "Authentication is required." } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(edgeFetch("save-api-key", { body: {} })).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("throws rate_limited with retry metadata on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "rate_limited",
            message: "Too many requests. Please slow down.",
            details: { retry_after_seconds: 42 },
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );
    const error = (await edgeFetch("chat", { body: {} }).catch((e: unknown) => e)) as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("rate_limited");
    expect(error.details?.retry_after_seconds).toBe(42);
  });

  it("maps network failures to network_error", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    const error = (await edgeFetch("chat", { body: {} }).catch((e: unknown) => e)) as AppError;
    expect(error.code).toBe("network_error");
  });

  it("never includes API keys in URLs", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    await edgeFetch("save-api-key", { method: "POST", body: { api_key: "sk-super-secret-value" } });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).not.toContain("sk-super-secret-value");
    expect(String(init?.body ?? "")).toContain("sk-super-secret-value"); // body only, over HTTPS in prod
  });
});
