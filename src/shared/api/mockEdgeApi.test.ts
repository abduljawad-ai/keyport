// mockEdgeApi list-models wiring (mirrors the deployed list-models function).

import { describe, expect, it } from "vitest";
import { mockEdgeFetch } from "./mockEdgeApi";

describe("mockEdgeApi list-models", () => {
  it("returns the mock model list for a known provider", async () => {
    const result = (await mockEdgeFetch("list-models", {
      method: "POST",
      body: { provider_id: "openai", api_key: "sk-test-key-12345" },
    })) as { models: string[] };
    expect(Array.isArray(result.models)).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models).toContain("gpt-4o");
  });

  it("returns an empty list for an unknown provider id", async () => {
    const result = (await mockEdgeFetch("list-models", {
      method: "POST",
      body: { provider_id: "unknown-provider", api_key: "sk-test-key-12345" },
    })) as { models: string[] };
    expect(result.models).toEqual([]);
  });

  it("rejects keys that are too short", async () => {
    await expect(
      mockEdgeFetch("list-models", {
        method: "POST",
        body: { provider_id: "openai", api_key: "short" },
      }),
    ).rejects.toMatchObject({ code: "invalid_api_key" });
  });

  it("falls back to the opencode catalog for synced named providers", async () => {
    const result = (await mockEdgeFetch("list-models", {
      method: "POST",
      body: { provider_id: "groq", api_key: "sk-test-key-12345" },
    })) as { models: string[] };
    expect(result.models).toContain("llama-3.3-70b-versatile");
    expect(result.models).toEqual([...result.models].sort((a, b) => a.localeCompare(b)));
  });

  it("throws internal_error for unknown paths", async () => {
    await expect(mockEdgeFetch("nope", {})).rejects.toMatchObject({
      code: "internal_error",
    });
  });
});