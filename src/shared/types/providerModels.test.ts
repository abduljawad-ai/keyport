import { describe, expect, it } from "vitest";
import { OPENCODE_CATALOG } from "@/shared/data/opencodeCatalog.generated";
import { getModelOptions, getModelsForProvider } from "./providerModels";

describe("getModelsForProvider with the opencode catalog", () => {
  it("prefers the catalog for synced providers", () => {
    const models = getModelsForProvider("groq");
    expect(models?.length).toBe(OPENCODE_CATALOG.groq.length);
    expect(models?.map((m) => m.id)).toEqual([...OPENCODE_CATALOG.groq]);
  });

  it("derives families from the id: vendor segment for slashed ids", () => {
    const models = getModelsForProvider("groq")!;
    const oss = models.find((m) => m.id === "openai/gpt-oss-120b");
    expect(oss?.family).toBe("openai");
  });

  it("strips the ~ prefix when deriving openrouter families", () => {
    const models = getModelsForProvider("openrouter")!;
    const alias = models.find((m) => m.id === "~anthropic/claude-sonnet-latest");
    expect(alias?.family).toBe("anthropic");
  });

  it("uses the All family for unslashed ids", () => {
    const models = getModelsForProvider("google")!;
    expect(models.length).toBe(OPENCODE_CATALOG.google.length);
    expect(models.every((m) => m.family === "All")).toBe(true);
  });

  it("keeps curated lists for openai/anthropic", () => {
    expect(getModelsForProvider("openai")?.some((m) => m.id === "gpt-4o")).toBe(true);
    expect(getModelsForProvider("anthropic")?.some((m) => m.id.includes("claude"))).toBe(true);
  });

  it("falls back to preset models for non-synced named providers", () => {
    const models = getModelsForProvider("xai");
    expect(models).not.toBeNull();
    expect(models?.some((m) => m.family === "Preset")).toBe(true);
  });

  it("returns null for the custom provider and unknown ids", () => {
    expect(getModelsForProvider("openai-compatible")).toBeNull();
    expect(getModelsForProvider("does-not-exist")).toBeNull();
  });
});

describe("getModelOptions", () => {
  it("keeps pinning a current value that is not in the list", () => {
    const options = getModelOptions("groq", "bogus-model");
    expect(options[0].id).toBe("bogus-model");
    expect(options[0].label).toBe("bogus-model (custom)");
    expect(options[0].family).toBe("Current");
  });
});