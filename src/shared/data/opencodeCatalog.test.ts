import { describe, expect, it } from "vitest";
import { OPENCODE_CATALOG } from "./opencodeCatalog.generated";

const EXPECTED_KEYS = [
  "alibaba",
  "google",
  "groq",
  "mistral-official",
  "nvidia",
  "openrouter",
  "ovh",
] as const;

const EXPECTED_COUNTS: Record<string, number> = {
  alibaba: 46,
  google: 19,
  groq: 7,
  "mistral-official": 27,
  nvidia: 91,
  openrouter: 343,
  ovh: 7,
};

describe("OPENCODE_CATALOG", () => {
  it("exports exactly the synced providers", () => {
    expect(Object.keys(OPENCODE_CATALOG).sort()).toEqual([...EXPECTED_KEYS]);
  });

  it("contains the expected number of chat-capable models per provider", () => {
    for (const key of EXPECTED_KEYS) {
      expect(OPENCODE_CATALOG[key].length, key).toBe(EXPECTED_COUNTS[key]);
    }
    const total = Object.values(OPENCODE_CATALOG).reduce((n, ids) => n + ids.length, 0);
    expect(total).toBe(540);
  });

  it("ids are non-empty, unique and strictly sorted within each provider", () => {
    for (const [key, ids] of Object.entries(OPENCODE_CATALOG)) {
      for (const id of ids) {
        expect(id.trim().length, `${key}:${id}`).toBeGreaterThan(0);
      }
      expect(new Set(ids).size, key).toBe(ids.length);
      expect([...ids].sort((a, b) => a.localeCompare(b)), key).toEqual([...ids]);
    }
  });
});