# OpenCode Catalog Sync + Searchable Model Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user's full opencode model catalog (540 chat-capable models across 7 providers, incl. new NVIDIA + OVH providers) into Keyport, replace the model `<select>`s with a searchable picker, and keep every test green.

**Architecture:** A node codegen script (`scripts/sync-opencode-catalog.mjs`) derives a committed data file (`src/shared/data/opencodeCatalog.generated.ts`) from a committed snapshot of `opencode models` output. `getModelsForProvider` resolves catalog → curated → preset. New zero-dep `ModelPicker` combobox replaces the family-optgroup selects in Composer and AddProviderDialog. `nvidia` + `ovh` become named providers in the backend registry + frontend presets (locked URLs, no SSRF surface).

**Tech Stack:** TypeScript, React 18, Vitest 2 (jsdom, globals), Vite 5, Node ≥ 20, Supabase Edge Functions (Deno). Zero new npm dependencies.

## Global Constraints

- No git repository in this project: instead of `git commit` steps, tick checklist boxes in this file to record task completion. Every task ends with `npm run typecheck` + targeted tests passing.
- Commands: `npm test` (vitest run), `npm run typecheck` (tsc --noEmit -p tsconfig.json), `npm run build`.
- Path alias `@` → `/src` (set in `vite.config.ts`, used by vitest + tsc).
- Vitest includes `src/**/*.test.{ts,tsx}` and `supabase/functions/**/*.test.ts`; environment jsdom.
- Named provider ids must match EXACTLY between the backend registry (`supabase/functions/_shared/providers/registry.ts`) and the frontend (`NAMED_PRESET_IDS` + `PROVIDER_PRESETS` in `src/shared/types/providerPresets.ts`) — enforced by `supabase/functions/__tests__/registry.test.ts`.
- Locked base URLs (never user-supplied for named providers):
  - nvidia: `https://integrate.api.nvidia.com/v1`
  - ovh: `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`
- The 7 synced providers (catalog is authoritative, preset `models` arrays stay empty `[]`): `openrouter`, `nvidia`, `alibaba`, `google`, `mistral-official`, `groq`, `ovh`.
- Model id rule: everything after the FIRST `/` of an opencode `provider/model` line is the API id (slashes are preserved: `nvidia/deepseek-ai/deepseek-v4-flash` → `deepseek-ai/deepseek-v4-flash`).
- The generated catalog header must be deterministic (no dates/timestamps) — the determinism test compares bytes.
- Expected counts from the committed snapshot (`scripts/fixtures/opencode-models.snapshot.txt`, 685 lines): openrouter 343, nvidia 91, alibaba 46, google 19, mistral-official 27, groq 7, ovh 7 — total **540**.

---

### Task 1: Codegen script + snapshot + generated catalog + tests

**Files:**
- Create: `scripts/sync-opencode-catalog.mjs`
- Create: `scripts/fixtures/opencode-models.snapshot.txt` (copied from `/tmp/opencode-models.txt`, must be 685 lines)
- Create: `src/shared/data/opencodeCatalog.generated.ts` (script output; NOT hand-written)
- Test: `src/shared/data/opencodeCatalog.test.ts`
- Test: `src/shared/data/codegen.test.ts`

**Interfaces:**
- Produces: `OPENCODE_CATALOG: Readonly<Record<string, readonly string[]>>` (keys: exactly `alibaba, google, groq, mistral-official, nvidia, openrouter, ovh`, sorted; values sorted, unique, non-empty chat-capable ids — consumed by Task 3 and Task 4).

- [x] **Step 1: Commit the hermetic snapshot fixture**

```bash
mkdir -p scripts/fixtures
cp /tmp/opencode-models.txt scripts/fixtures/opencode-models.snapshot.txt
wc -l scripts/fixtures/opencode-models.snapshot.txt   # must print 685
```

- [x] **Step 2: Write the codegen script**

Create `scripts/sync-opencode-catalog.mjs`:

```js
#!/usr/bin/env node
// Regenerates src/shared/data/opencodeCatalog.generated.ts from `opencode models`
// output (provider/model lines). Chat-only filter. Deterministic (sorted, no
// dates in header). Flags: --source cli|stdin (default cli), --output <path>.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(ROOT, "src", "shared", "data", "opencodeCatalog.generated.ts");

function parseArgs(argv) {
  const args = { source: "cli", output: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--source") args.source = argv[++i];
    else if (argv[i] === "--output") args.output = argv[++i];
    else throw new Error(`Unknown arg: ${argv[i]}`);
  }
  if (args.source !== "cli" && args.source !== "stdin") throw new Error(`Bad --source: ${args.source}`);
  return args;
}

// opencode provider group -> Keyport provider id. Anything not mapped is an
// opencode-internal group (opencode, unorouter, tokenrouter, colab-josie) and
// is skipped.
const GROUP_MAP = {
  openrouter: "openrouter",
  "openrouter-free": "openrouter",
  nvidia: "nvidia",
  alibaba: "alibaba",
  google: "google",
  mistral: "mistral-official",
  "mistral-coder1": "mistral-official",
  "mistral-coder2": "mistral-official",
  "mistral-coder3": "mistral-official",
  "mistral-coder4": "mistral-official",
  "mistral-coder5": "mistral-official",
  "mistral-glm": "mistral-official",
  groq: "groq",
  ovh: "ovh",
};

// Non-chat models (embeddings, audio/tts, image/video/music gen, classifiers,
// realtime/multimodal, OCR, translation, robotics) can never run in a text chat.
const DROP =
  /(embedding|-embed|rerank|whisper|audio|transcribe|\btts|voxtral-tts|flux|veo|lyria|image|generate-preview|prompt-guard|safeguard|robotics|realtime|computer-use|ocr|allam|orpheus|omni|qwen-mt|-command-r)/i;

function readInput(source) {
  if (source === "stdin") return readFileSync(0, "utf8");
  return execFileSync("opencode", ["models"], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
}

function transform(input) {
  const byProvider = new Map();
  let excluded = 0;
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const slash = trimmed.indexOf("/");
    if (slash <= 0) continue;
    const group = trimmed.slice(0, slash);
    const apiId = trimmed.slice(slash + 1).trim();
    const provider = GROUP_MAP[group];
    if (!provider || !apiId) continue;
    if (DROP.test(apiId)) {
      excluded++;
      continue;
    }
    if (!byProvider.has(provider)) byProvider.set(provider, new Set());
    byProvider.get(provider).add(apiId);
  }
  const catalog = {};
  for (const [provider, ids] of byProvider) catalog[provider] = [...ids].sort((a, b) => a.localeCompare(b));
  return { catalog, excluded };
}

function render(catalog) {
  let out = "// GENERATED by scripts/sync-opencode-catalog.mjs — do not edit.\n";
  out += "// Source: `opencode models` (provider/model lines) with a chat-only filter.\n";
  out += "// Group map: openrouter+openrouter-free→openrouter; mistral|mistral-coder*|mistral-glm→mistral-official.\n";
  out += "export const OPENCODE_CATALOG: Readonly<Record<string, readonly string[]>> = {\n";
  for (const key of Object.keys(catalog).sort()) {
    out += `  ${JSON.stringify(key)}: [\n`;
    for (const id of catalog[key]) out += `    ${JSON.stringify(id)},\n`;
    out += "  ],\n";
  }
  out += "};\n";
  return out;
}

const args = parseArgs(process.argv.slice(2));
const { catalog, excluded } = transform(readInput(args.source));
const text = render(catalog);
mkdirSync(dirname(args.output), { recursive: true });
writeFileSync(args.output, text);
for (const key of Object.keys(catalog).sort()) {
  console.error(`${key}: ${catalog[key].length}`);
}
console.error(`total: ${Object.values(catalog).reduce((n, ids) => n + ids.length, 0)} (excluded ${excluded})`);
```

- [x] **Step 3: Generate the catalog from the fixture and verify counts**

```bash
node scripts/sync-opencode-catalog.mjs --source stdin < scripts/fixtures/opencode-models.snapshot.txt
```

Expected stderr summary:
```
alibaba: 46
google: 19
groq: 7
mistral-official: 27
nvidia: 91
openrouter: 343
ovh: 7
total: 540 (excluded …)
```

Verify `src/shared/data/opencodeCatalog.generated.ts` exists with 7 keys above.

- [x] **Step 4: Write the catalog shape test**

Create `src/shared/data/opencodeCatalog.test.ts`:

```ts
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
```

- [x] **Step 5: Run the shape test — expected PASS**

Run: `npm test -- src/shared/data/opencodeCatalog.test.ts`
Expected: 3 passing.

- [x] **Step 6: Write the determinism + staleness test**

Create `src/shared/data/codegen.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "sync-opencode-catalog.mjs");
const FIXTURE = join(ROOT, "scripts", "fixtures", "opencode-models.snapshot.txt");
const COMMITTED = join(ROOT, "src", "shared", "data", "opencodeCatalog.generated.ts");

function regenerate(outPath: string): string {
  execFileSync(process.execPath, [SCRIPT, "--source", "stdin", "--output", outPath], {
    input: readFileSync(FIXTURE, "utf8"),
    encoding: "utf8",
  });
  return readFileSync(outPath, "utf8");
}

describe("sync-opencode-catalog.mjs", () => {
  it("is deterministic: two runs on the same input produce identical bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "keyport-catalog-"));
    try {
      const a = regenerate(join(dir, "a.ts"));
      const b = regenerate(join(dir, "b.ts"));
      expect(a).toBe(b);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("regenerating from the committed snapshot reproduces the committed file", () => {
    const dir = mkdtempSync(join(tmpdir(), "keyport-catalog-"));
    try {
      const out = regenerate(join(dir, "out.ts"));
      expect(out).toBe(readFileSync(COMMITTED, "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("snapshot fixture exists for hermetic tests", () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });
});
```

- [x] **Step 7: Run all Task 1 tests — expected PASS**

Run: `npm test`
Expected: all existing tests + the 6 new ones pass (only the shape + codegen suites are new in this task).

- [x] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [x] **Step 9: Record completion**

Tick the checkboxes above in this file (`- [x]`) to mark Task 1 done.

---

### Task 2: Register nvidia + ovh as named providers (backend + frontend)

**Files:**
- Modify: `supabase/functions/_shared/providers/registry.ts` (Inference Platforms section, after the `lepton` entry)
- Modify: `src/shared/types/providerPresets.ts` (`NAMED_PRESET_IDS` + `PROVIDER_PRESETS`)
- Test: `supabase/functions/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: nothing (data only).
- Produces: `nvidia` and `ovh` appear in `NAMED_PROVIDERS` (backend) and `NAMED_PRESET_IDS` + `PROVIDER_PRESETS` (frontend), so `PROVIDER_IDS` in `provider.ts` automatically includes them. Their preset `models` arrays are `[]` (catalog fills them in Task 3).

- [x] **Step 1: Write the failing assertion first**

Append to `supabase/functions/__tests__/registry.test.ts`:

```ts
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
```

- [x] **Step 2: Run the registry test — expected FAIL**

Run: `npm test -- supabase/functions/__tests__/registry.test.ts`
Expected: the new test fails ("nvidia" undefined) AND, after the backend edit, the consistency test fails until the frontend catches up (that is the enforcement contract — see Step 4).

- [x] **Step 3: Add backend registry entries**

In `supabase/functions/_shared/providers/registry.ts`, inside the Inference Platforms section, after `{ id: "lepton", ... }` add:

```ts
  { id: "nvidia", name: "NVIDIA", apiStyle: "openai-compatible", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "ovh", name: "OVHcloud", apiStyle: "openai-compatible", baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1" },
```

- [x] **Step 4: Add frontend presets so consistency turns green**

In `src/shared/types/providerPresets.ts`:

1. In `NAMED_PRESET_IDS`, inside the `── Inference Platforms ──` group, after `'lepton'` add:
```ts
  'nvidia',
  'ovh',
```

2. In `PROVIDER_PRESETS`, in the Inference Platforms section, after the `lepton` preset object add:
```ts
  {
    id: 'nvidia',
    name: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [],
    category: 'inference',
  },
  {
    id: 'ovh',
    name: 'OVHcloud',
    baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    models: [],
    category: 'inference',
  },
```

- [x] **Step 5: Run the registry test — expected PASS (all 5)**

Run: `npm test -- supabase/functions/__tests__/registry.test.ts`
Expected: 5 passing (4 existing + the new one).

- [x] **Step 6: Full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, typecheck clean.

- [x] **Step 7: Record completion** (tick the boxes in this file).

---

### Task 3: Wire catalog into model resolution; strip synced preset lists; explicit defaults

**Files:**
- Modify: `src/shared/types/providerModels.ts`
- Modify: `src/shared/types/providerPresets.ts` (set `models: []` on the 4 synced presets that still have lists)
- Modify: `src/shared/types/provider.ts`
- Test: `src/shared/types/providerModels.test.ts`

**Interfaces:**
- Consumes: `OPENCODE_CATALOG` from `@/shared/data/opencodeCatalog.generated` (Task 1); `getPresetById` (existing).
- Produces:
  - `deriveModelFamily(id: string): string` — family helper later tasks rely on.
  - `getModelsForProvider(providerId): ModelOption[] | null` — resolution order catalog → curated (`PROVIDER_MODELS`, unchanged for openai/anthropic/google-fallback) → preset fallback → `null`.
  - `getModelOptions(providerId, currentModel): ModelOption[]` — unchanged semantics (pins unknown current as `(current)` row).
  - `PROVIDER_DEFAULT_MODELS` gains explicit flagship entries for the 7 synced providers.

- [x] **Step 1: Write the failing tests first**

Create `src/shared/types/providerModels.test.ts`:

```ts
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
```

- [x] **Step 2: Run the new tests — expected FAIL**

Run: `npm test -- src/shared/types/providerModels.test.ts`
Expected: FAIL on the first case (`groq` still resolves via preset, not catalog).

- [x] **Step 3: Update `providerModels.ts`**

Add the import and helper, and replace `getModelsForProvider`:

```ts
import { OPENCODE_CATALOG } from "@/shared/data/opencodeCatalog.generated";
```

```ts
/** Synced providers where the opencode catalog is authoritative. */
export const CATALOG_PROVIDER_IDS: readonly string[] = [
  "openrouter",
  "nvidia",
  "alibaba",
  "google",
  "mistral-official",
  "groq",
  "ovh",
];

/** Display family: vendor segment for slashed ids (leading ~ stripped), else "All". */
export function deriveModelFamily(id: string): string {
  const first = id.split("/")[0];
  if (first && first !== id) return first.replace(/^~+/, "");
  return "All";
}
```

```ts
export function getModelsForProvider(providerId: ProviderId | string | null | undefined): ModelOption[] | null {
  if (!providerId) return null;
  const catalog = OPENCODE_CATALOG[providerId];
  if (catalog && catalog.length > 0) {
    return catalog.map((id) => ({ id, label: id, family: deriveModelFamily(id) }));
  }
  const curated = PROVIDER_MODELS[providerId as ProviderId];
  if (curated) return curated;
  const preset = getPresetById(providerId);
  if (preset && preset.models.length > 0) {
    return preset.models.map((id) => ({ id, label: id, family: "Preset" }));
  }
  return null;
}
```

- [x] **Step 4: Strip the synced presets' model lists**

In `src/shared/types/providerPresets.ts`, for the `groq`, `openrouter`, `alibaba`, and `mistral-official` preset objects, replace each non-empty `models: [ ... ]` array with `models: [],`. (nvidia/ovh already have `models: []`; google has no preset.)

- [x] **Step 5: Add explicit defaults in `provider.ts`**

Replace the `PROVIDER_DEFAULT_MODELS` map in `src/shared/types/provider.ts` with:

```ts
/** Sensible defaults: explicit flagships for synced (catalog) providers, plus
 * the first preset model for the remaining named presets. */
export const PROVIDER_DEFAULT_MODELS: Record<ProviderId, string | null> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-1.5-flash",
  "openai-compatible": null,
  // Synced providers (catalog is authoritative; preset model lists are empty):
  openrouter: "~openai/gpt-latest",
  nvidia: "meta/llama-3.1-70b-instruct",
  alibaba: "qwen-max",
  groq: "llama-3.3-70b-versatile",
  ovh: "Meta-Llama-3_3-70B-Instruct",
  "mistral-official": "mistral-large-latest",
  ...Object.fromEntries(
    NAMED_PRESET_IDS.filter((id) => !CATALOG_PROVIDER_IDS.includes(id)).map((id) => {
      const models = getPresetById(id)?.models ?? [];
      return [id, models[0] ?? null] as const;
    }),
  ),
} as Record<ProviderId, string | null>;
```

Add: `import { CATALOG_PROVIDER_IDS } from "./providerModels";` to the imports of `provider.ts`.

- [x] **Step 6: Run the new tests — expected PASS**

Run: `npm test -- src/shared/types/providerModels.test.ts`
Expected: all 8 pass.

- [x] **Step 7: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all green. Confirm `src/shared/types/providerModels.test.ts` runs against the regenerated catalog (counts depend on Task 1's fixture).

- [x] **Step 8: Record completion.**

---

### Task 4: list-models mock falls back to the catalog

**Files:**
- Modify: `src/shared/api/mockEdgeApi.ts` (line ~199)
- Test: `src/shared/api/mockEdgeApi.test.ts`

**Interfaces:**
- Consumes: `OPENCODE_CATALOG` (Task 1).
- Produces: `list-models` mock returns, in order of precedence: `MOCK_PROVIDER_MODELS[id]` → `OPENCODE_CATALOG[id]` → preset `models` → `[]`.

- [x] **Step 1: Write the failing test**

Append to `src/shared/api/mockEdgeApi.test.ts`:

```ts
  it("falls back to the opencode catalog for synced named providers", async () => {
    const result = (await mockEdgeFetch("list-models", {
      method: "POST",
      body: { provider_id: "groq", api_key: "sk-test-key-12345" },
    })) as { models: string[] };
    expect(result.models).toContain("llama-3.3-70b-versatile");
    expect(result.models).toEqual([...result.models].sort((a, b) => a.localeCompare(b)));
  });
```

- [x] **Step 2: Run it — expected FAIL**

Run: `npm test -- src/shared/api/mockEdgeApi.test.ts`
Expected: new test FAILS (groq preset list is now `[]` after Task 3, so `models` is empty).

- [x] **Step 3: Update the mock**

In `src/shared/api/mockEdgeApi.ts`:

1. Add import: `import { OPENCODE_CATALOG } from "@/shared/data/opencodeCatalog.generated";`
2. Replace the `handleListModels` return line (currently `return { models: MOCK_PROVIDER_MODELS[providerId] ?? presetModels };`) with:

```ts
  return { models: MOCK_PROVIDER_MODELS[providerId] ?? OPENCODE_CATALOG[providerId] ?? presetModels };
```

Keep the `presetModels` const above it (still used as the fallback for non-synced named presets like portkey).

- [x] **Step 4: Run mock tests — expected PASS**

Run: `npm test -- src/shared/api/mockEdgeApi.test.ts`
Expected: 5 passing.

- [x] **Step 5: Full suite + typecheck, record completion.**

---

### Task 5: Searchable ModelPicker component

**Files:**
- Create: `src/shared/ui/ModelPicker/index.tsx`
- Create: `src/shared/ui/ModelPicker/ModelPicker.module.css`
- Modify: `src/shared/ui/index.ts`
- Test: `src/shared/ui/ModelPicker/ModelPicker.test.tsx`

**Interfaces:**
- Consumes: `ModelOption` type from `@/shared/types/providerModels`.
- Produces: `ModelPicker` component with props `{ id?: string; ariaLabel: string; options: ModelOption[]; value: string; onChange: (value: string) => void; placeholder?: string; disabled?: boolean }`. Behavior: trigger button shows `value` (or `placeholder` when empty); click opens a popover with a search input + family-grouped list; typing filters case-insensitively; ArrowUp/Down + Enter select; Esc or outside-click closes; a current value absent from `options` is pinned as a `(current)` row. Exported from the shared ui barrel.

- [x] **Step 1: Write the failing component tests**

Create `src/shared/ui/ModelPicker/ModelPicker.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ModelOption } from "@/shared/types/providerModels";
import { ModelPicker } from "./index";

const OPTIONS: ModelOption[] = [
  { id: "openai/gpt-oss-120b", label: "openai/gpt-oss-120b", family: "openai" },
  { id: "meta-llama/llama-3.1-8b-instant", label: "meta-llama/llama-3.1-8b-instant", family: "meta-llama" },
  { id: "qwen/qwen3.6-27b", label: "qwen/qwen3.6-27b", family: "qwen" },
];

function renderPicker(value = "openai/gpt-oss-120b", onChange = () => {}) {
  return render(
    <ModelPicker ariaLabel="Model" options={OPTIONS} value={value} onChange={onChange} />,
  );
}

describe("ModelPicker", () => {
  it("shows the current value on the trigger", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("openai/gpt-oss-120b");
  });

  it("shows the placeholder when value is empty", () => {
    render(<ModelPicker ariaLabel="Model" options={OPTIONS} value="" onChange={() => {}} placeholder="Select a model…" />);
    expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Select a model…");
  });

  it("opens on click and filters the list as you type", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Model" }));
    const search = screen.getByRole("textbox");
    expect(search).toHaveFocus();
    await user.type(search, "qwen");
    expect(screen.getByRole("option", { name: "qwen/qwen3.6-27b" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "openai/gpt-oss-120b" })).not.toBeInTheDocument();
  });

  it("selects with ArrowDown + Enter and calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker("", onChange);
    await user.click(screen.getByRole("button", { name: "Model" }));
    // Click-open resets the highlight to the first option; one ArrowDown moves
    // the highlight to the second option, which Enter then commits.
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("meta-llama/llama-3.1-8b-instant");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("closes on Escape without changing the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker("openai/gpt-oss-120b", onChange);
    await user.click(screen.getByRole("button", { name: "Model" }));
    const search = screen.getByRole("textbox");
    await user.type(search, "qwen");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on outside click", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Model" }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("pins a current value that is not in the options as a selectable (current) row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelPicker ariaLabel="Model" options={OPTIONS} value="weird-id" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Model" }));
    expect(screen.getByRole("option", { name: "weird-id (current)" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "weird-id (current)" }));
    expect(onChange).toHaveBeenCalledWith("weird-id");
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    render(<ModelPicker ariaLabel="Model" options={OPTIONS} value="" onChange={() => {}} disabled />);
    await user.click(screen.getByRole("button", { name: "Model" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run — expected FAIL** (`ModelPicker` not defined + `vi` global available via vitest `globals: true`).

Run: `npm test -- src/shared/ui/ModelPicker/ModelPicker.test.tsx`
Expected: errors — component missing.

- [x] **Step 3: Implement the component**

Create `src/shared/ui/ModelPicker/index.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelOption } from "@/shared/types/providerModels";
import styles from "./ModelPicker.module.css";

export interface ModelPickerProps {
  id?: string;
  ariaLabel: string;
  /** Allowed models — pass the output of getModelOptions(...). */
  options: ModelOption[];
  /** Currently selected model id (may be empty, or absent from options). */
  value: string;
  onChange: (value: string) => void;
  /** Shown on the trigger when value is empty. */
  placeholder?: string;
  disabled?: boolean;
}

/** Pin a current value that the options list doesn't know, so selection is never lost. */
function pinnedCurrent(options: ModelOption[], value: string): ModelOption[] {
  const trimmed = value.trim();
  if (!trimmed || options.some((o) => o.id === trimmed)) return options;
  return [{ id: trimmed, label: `${trimmed} (current)`, family: "Current" }, ...options];
}

export function ModelPicker({
  id,
  ariaLabel,
  options,
  value,
  onChange,
  placeholder = "Select a model…",
  disabled = false,
}: ModelPickerProps) {
  const allOptions = useMemo(() => pinnedCurrent(options, value), [options, value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const flat = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allOptions.filter((o) => o.id.toLowerCase().includes(q)) : allOptions;
  }, [allOptions, query]);

  const groups = useMemo(() => {
    const out: { family: string; items: ModelOption[] }[] = [];
    for (const opt of flat) {
      const family = opt.family ?? "Other";
      const last = out[out.length - 1];
      if (last && last.family === family) last.items.push(opt);
      else out.push({ family, items: [opt] });
    }
    return out;
  }, [flat]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex];
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveIndex(0);
      setQuery("");
      setOpen(true);
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = flat[activeIndex];
      if (chosen) {
        onChange(chosen.id);
        setOpen(false);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const listboxId = `${id ?? "model-picker"}-listbox`;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={styles.trigger}
        onClick={() => {
          setActiveIndex(0);
          setOpen((o) => !o);
        }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
      >
        <span className={styles.triggerValue}>{value.trim() ? value : placeholder}</span>
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={styles.popover}>
          <input
            ref={inputRef}
            className={styles.search}
            type="text"
            aria-label={`Search ${ariaLabel}`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          {flat.length === 0 ? (
            <p className={styles.empty}>No models match “{query}”</p>
          ) : (
            <ul id={listboxId} role="listbox" className={styles.list} ref={listRef}>
              {groups.map((group) => (
                <li key={group.family} role="presentation" className={styles.group}>
                  <div className={styles.groupLabel}>{group.family}</div>
                  <ul role="presentation" className={styles.groupList}>
                    {group.items.map((m) => {
                      const idx = flat.indexOf(m);
                      return (
                        <li
                          key={m.id}
                          role="option"
                          aria-selected={m.id === value}
                          className={activeIndex === idx ? styles.optionActive : styles.option}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <button
                            type="button"
                            className={styles.optionButton}
                            onClick={() => {
                              onChange(m.id);
                              setOpen(false);
                            }}
                          >
                            {m.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

Create `src/shared/ui/ModelPicker/ModelPicker.module.css`:

```css
.root {
  position: relative;
  width: 100%;
}
.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font: inherit;
  color: var(--color-text, #1a1a1a);
  background: var(--color-bg-input, #fff);
  border: 1px solid var(--color-border, #ccc);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.triggerValue {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.caret {
  opacity: 0.6;
  flex: none;
}
.popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 320px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #ccc);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}
.search {
  flex: none;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--color-border, #eee);
  font: inherit;
  background: var(--color-bg-input, #fff);
  outline: none;
}
.list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
}
.group {
  margin: 0;
}
.groupList {
  margin: 0;
  padding: 0;
  list-style: none;
}
.groupLabel {
  padding: 6px 12px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.55;
}
.option {
  margin: 0;
}
.optionActive {
  margin: 0;
  background: var(--color-accent, rgba(0, 0, 0, 0.08));
}
.optionButton {
  display: block;
  width: 100%;
  padding: 6px 12px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}
.optionButton:hover {
  background: rgba(0, 0, 0, 0.05);
}
.empty {
  padding: 12px;
  opacity: 0.6;
}
```

- [x] **Step 4: Export from the ui barrel**

In `src/shared/ui/index.ts` add (matching the file's existing export style):

```ts
export { ModelPicker } from "./ModelPicker";
export type { ModelPickerProps } from "./ModelPicker";
```

- [x] **Step 5: Run the component tests — expected PASS**

Run: `npm test -- src/shared/ui/ModelPicker/ModelPicker.test.tsx`
Expected: all 8 pass. (If `vi`/matchers are not global in this file, add `import { vi } from "vitest";` at the top.)

- [x] **Step 6: Full suite + typecheck, record completion.**

---

### Task 6: Composer uses ModelPicker

**Files:**
- Modify: `src/features/chat/ui/Composer.tsx` (model selector branch, currently lines ~216-244)

**Interfaces:**
- Consumes: `ModelPicker` (Task 5), `getModelOptions`, `getModelsForProvider` (existing).
- Produces: Composer model field = `ModelPicker` for providers with a model list; free-text `Input` remains ONLY for `openai-compatible` (custom). No behavior change to the custom path or the provider selector.

- [x] **Step 1: Replace the model `<select>` with ModelPicker**

In `src/features/chat/ui/Composer.tsx`:
1. Add import: `import { ModelPicker } from "@/shared/ui";`
2. Replace the entire model-options branch (`const options = getModelOptions(providerId, model);` through the closing `</select>` inside the families map) with:

```tsx
            const options = getModelOptions(providerId, model);
            return (
              <ModelPicker
                id="composer-model"
                ariaLabel="Model"
                options={options}
                value={model}
                onChange={onModelChange}
                placeholder="Select a model…"
                disabled={isStreaming}
              />
            );
```

3. Remove the now-unused `families` computation and the `optgroup` loop.

- [x] **Step 2: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: clean + green (no existing Composer tests).

- [x] **Step 3: Record completion.**

---

### Task 7: AddProviderDialog uses ModelPicker

**Files:**
- Modify: `src/features/providers/ui/AddProviderDialog.tsx` (default-model select branch, currently ~lines 434-455)

**Interfaces:**
- Consumes: `ModelPicker`, the dialog's existing `allOptions` (already includes the `${trimmed} (custom)` pinning), `defaultModel`/`setDefaultModel`, `defaultModelPlaceholder`.
- Produces: dialog default-model field = `ModelPicker` with the same live-loaded models behavior (loading `<select>` and free-text `Input` branches untouched).

- [x] **Step 1: Replace the default-model `<select>` with ModelPicker**

In `src/features/providers/ui/AddProviderDialog.tsx`:
1. Add `ModelPicker` to the existing `@/shared/ui` import.
2. In the final branch, replace the `<select id="provider-model" ...>...</select>` element (the family-optgroup block, plus the now-unused `families` const) with:

```tsx
              <ModelPicker
                id="provider-model"
                ariaLabel="Default model"
                options={allOptions}
                value={defaultModel}
                onChange={setDefaultModel}
                placeholder={defaultModelPlaceholder}
              />
```

Keep the `modelsError` / `loadedModels` help/error paragraphs exactly as they are.

- [x] **Step 2: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: clean + green.

- [x] **Step 3: Record completion.**

---

### Task 8: Verification, live regeneration, deployment, browser QA

**Files:**
- None (verification only), except the generated catalog if the live `opencode models` output differs from the snapshot.

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [x] **Step 1: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass (original 113 + all new), typecheck clean, production build succeeds.

- [x] **Step 2: Regenerate from the live opencode CLI and reconcile**

```bash
opencode models | node scripts/sync-opencode-catalog.mjs --source stdin
git diff --stat 2>/dev/null; diff <(node -e "console.log('see determinism test')") /dev/null || true
npm test -- src/shared/data
```

- If live output is identical to the snapshot, nothing changes.
- If the live list changed (opencode updated), the regenerated file differs:
  1. Update `scripts/fixtures/opencode-models.snapshot.txt` from the new live output (`opencode models > scripts/fixtures/opencode-models.snapshot.txt`).
  2. Update the expected counts in `src/shared/data/opencodeCatalog.test.ts` (`EXPECTED_COUNTS` + total) and the header/spec numbers if they moved.
  3. Re-run `npm test` — the determinism + staleness tests guard this.
- Report to the user whether the live list matched the snapshot.

- [x] **Step 3: Deploy the Edge Functions that bundle the registry**

With the project's `supabase` CLI config and `SUPABASE_ACCESS_TOKEN` set (used earlier this session):

```bash
supabase functions deploy chat test-api-key save-api-key list-models register-key delete-key --project-ref wfznwnvytywspchhskdr
```

Verify each function deploys successfully (the CLI prints per-function results). The registry change (`nvidia`, `ovh`) affects: `chat`, `test-api-key`, `save-api-key`, `list-models`, `delete-key`, `register-key`.

- [x] **Step 4: Browser verification (dev server on :5173, real Supabase)**

Verify via the browser automation tooling:
1. Start `npm run dev`; open `http://localhost:5173/`.
2. Settings → Providers → Add provider: the provider list now includes **NVIDIA** and **OVHcloud** as first-class entries, grouped under Inference Platforms; selecting NVIDIA shows the locked URL `https://integrate.api.nvidia.com/v1`.
3. Add dialog — default model field is a searchable picker: open OpenRouter, type `claude` → filtered options appear; select one; picker shows it.
4. Composer — for a connected provider the model field is the picker; typing filters; the current model survives.
5. Custom ("OpenAI-compatible") provider still shows a free-text model input (picker NOT rendered).
6. With a real Groq (or other named) key connected, the live `list-models` result still replaces the catalog on load; the picker shows the loaded list.
7. Send a chat message with a synced-provider model → streams a reply (uses the deployed `chat` function).

- [x] **Step 5: Remind the user to retry saving a real named-provider key**

The DB CHECK-constraint fix (migration `0003`, already applied) unblocked named-provider saves — confirm end-to-end by saving an xAI/Groq/other named key in the UI and seeing success (no check violation).

- [x] **Step 6: Final report**

Summarize for the user: final per-provider model counts, the two new providers, the picker UX, deployment status, and any snapshot-vs-live differences.

---

## Self-Review Notes (filled during plan writing)

- Spec coverage: codegen (§1) → Task 1; providers nvidia/ovh + defaults + preset stripping (§2) → Tasks 2-3; picker (§3) → Task 5; wiring incl. mock (§4) → Tasks 3, 4, 6, 7; tests (§5) → in each task; verification/deploy (§6) → Task 8.
- No placeholders: every code step includes its full content; the only generated artifact (the 540-id catalog) is produced by the script from the committed snapshot, and its expected counts are stated exactly.
- Type/name consistency: `OPENCODE_CATALOG`, `getModelsForProvider`, `getModelOptions`, `deriveModelFamily`, `CATALOG_PROVIDER_IDS`, `ModelPicker` props — defined once (Task 1/3/5) and reused verbatim in later tasks.
- Pitfall documented: `vi`/globals/matchers come from vitest `globals: true` (jsdom env) — no per-file setup needed.