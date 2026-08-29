import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "@/shared/types/provider";
import {
  forgotPasswordSchema,
  providerFormSchema,
  signInSchema,
  signUpSchema,
} from "./validators";

describe("provider form validation", () => {
  it("accepts a valid OpenAI key form", () => {
    const result = providerFormSchema.safeParse({
      provider_id: "openai",
      api_key: "sk-test-not-a-real-key",
      label: "Work",
    });
    expect(result.success).toBe(true);
  });

  it("requires an API key", () => {
    const result = providerFormSchema.safeParse({ provider_id: "openai", api_key: "  " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "api_key")).toBe(true);
    }
  });

  it("accepts a named OpenAI-compatible provider without a base_url (built-in URL)", () => {
    const result = providerFormSchema.safeParse({
      provider_id: "groq",
      api_key: "gsk-test-not-a-real-key",
    });
    expect(result.success).toBe(true);
  });

  it("requires base_url for openai-compatible providers", () => {
    const result = providerFormSchema.safeParse({
      provider_id: "openai-compatible",
      api_key: "sk-anything",
      base_url: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "base_url")).toBe(true);
    }
  });

  it("rejects non-https base_url", () => {
    const result = providerFormSchema.safeParse({
      provider_id: "openai-compatible",
      api_key: "sk-anything",
      base_url: "http://api.example.com/v1",
    });
    expect(result.success).toBe(false);
  });

  it("allows loopback http only (server-side SSRF guard still applies)", () => {
    const result = providerFormSchema.safeParse({
      provider_id: "openai-compatible",
      api_key: "sk-anything",
      base_url: "http://localhost:8080/v1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed URLs and credentials in URLs", () => {
    expect(
      providerFormSchema.safeParse({
        provider_id: "openai-compatible",
        api_key: "sk-anything",
        base_url: "not a url",
      }).success,
    ).toBe(false);
    expect(
      providerFormSchema.safeParse({
        provider_id: "openai-compatible",
        api_key: "sk-anything",
        base_url: "https://user:pass@evil.example.com/v1",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown provider ids", () => {
    const result = providerFormSchema.safeParse({
      provider_id: "totally-made-up-provider",
      api_key: "sk-anything",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every named provider id in the catalog", () => {
    // All 31 dropdown entries (3 native + 27 named presets + custom) must
    // pass the form schema without a base_url (only custom requires one).
    const ids = PROVIDER_IDS;
    expect(ids.length).toBe(31);
    for (const providerId of ids) {
      const result = providerFormSchema.safeParse({
        provider_id: providerId,
        api_key: "sk-anything",
        base_url: providerId === "openai-compatible" ? "https://example.com/v1" : undefined,
      });
      expect(result.success, providerId).toBe(true);
    }
  });
});

describe("auth form validation", () => {
  it("sign-in requires email and password", () => {
    expect(signInSchema.safeParse({ email: "nope", password: "" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "hunter2hunter2" }).success).toBe(true);
  });

  it("sign-up enforces password confirmation", () => {
    const result = signUpSchema.safeParse({
      email: "a@b.co",
      password: "goodpassword",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "confirmPassword")).toBe(true);
    }
  });

  it("forgot password requires a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});
