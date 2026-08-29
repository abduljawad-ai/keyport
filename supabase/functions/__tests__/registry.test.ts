// Provider registry consistency: the frontend's named provider set (derived
// from providerPresets.ts) must exactly match the backend's authoritative
// registry, and every backend OpenAI-compatible entry must carry a locked
// https base URL matching the frontend preset. Drift here would mean a
// provider selectable in the UI that the Edge Functions reject (or worse, a
// URL the server does not enforce).

import { describe, expect, it } from "vitest";
import { NAMED_PROVIDERS } from "../_shared/providers/registry.ts";
import { BUILTIN_PROVIDER_TYPES, NAMED_PRESET_IDS, getPresetById } from "@/shared/types/providerPresets";

describe("provider registry consistency", () => {
  it("frontend named provider ids exactly match the backend registry", () => {
    const backendIds = NAMED_PROVIDERS.map((p) => p.id).sort();
    const frontendIds = [...BUILTIN_PROVIDER_TYPES, ...NAMED_PRESET_IDS].sort();
    expect(frontendIds).toEqual(backendIds);
  });

  it("every backend openai-compatible provider has a locked https base URL", () => {
    const compat = NAMED_PROVIDERS.filter((p) => p.apiStyle === "openai-compatible");
    expect(compat.length).toBeGreaterThan(0);
    for (const def of compat) {
      expect(def.baseUrl, def.id).toBeTruthy();
      expect(def.baseUrl, def.id).toMatch(/^https:\/\//);
    }
  });

  it("frontend preset base URLs match the backend locks exactly", () => {
    const backend = new Map(NAMED_PROVIDERS.map((p) => [p.id, p.baseUrl]));
    for (const id of NAMED_PRESET_IDS) {
      const preset = getPresetById(id);
      expect(preset, `preset ${id} must exist in PROVIDER_PRESETS`).toBeDefined();
      expect(preset?.baseUrl, id).toBe(backend.get(id) ?? null);
    }
  });

  it("native providers carry no base URL (adapters hold their defaults)", () => {
    for (const def of NAMED_PROVIDERS.filter((p) => p.apiStyle !== "openai-compatible")) {
      expect(def.baseUrl, def.id).toBeUndefined();
    }
  });

  it("nvidia and ovh are registered named providers with locked OpenAI-compatible base URLs", () => {
    const expected: Record<string, string> = {
      nvidia: "https://integrate.api.nvidia.com/v1",
      ovh: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    };
    for (const [id, baseUrl] of Object.entries(expected)) {
      const def = NAMED_PROVIDERS.find((p) => p.id === id);
      expect(def, `registry must contain ${id}`).toBeDefined();
      expect(def?.apiStyle).toBe("openai-compatible");
      expect(def?.baseUrl).toBe(baseUrl);
    }
  });
});