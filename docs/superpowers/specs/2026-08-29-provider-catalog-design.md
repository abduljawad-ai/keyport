# Provider Catalog: First-Class Providers + Custom (2026-08-29)

## Problem
The provider dropdown has only 4 entries (OpenAI, Anthropic, Google, OpenAI-compatible).
All 45 presets are hidden inside "OpenAI-compatible", which users find confusing.
Named providers must be first-class dropdown entries and must actually work.

## Design

### 1. Named providers (locked, server-authoritative)
Server-side registry `supabase/functions/_shared/providers/registry.ts` defines every
named provider with `{ id, name, apiStyle, baseUrl? }`:

- `apiStyle` is one of `openai | anthropic | google | openai-compatible`.
- For `openai-compatible` named providers a **locked base URL** is stored in the
  registry. The server ignores any stored/user-supplied base URL for named providers
  (SSRF-safe by construction: no user input reaches outbound URLs).
- `openai`/`anthropic`/`google` use their existing native adapters, unchanged.

Named set (28): openai, anthropic, google + 25 OpenAI-compatible providers:
groq, together, fireworks, cerebras, sambanova, deepinfra, novita, chutes, baseten,
modal, openrouter, portkey, braintrust, lepton, deepseek-official, mistral-official,
xai, siliconflow, zhipu, moonshot, alibaba, minimax, bytedance, yi, stepfun.

Excluded from named (still reachable via Custom; not OpenAI-compatible chat APIs or
unreachable from the cloud function): aws-bedrock, azure-openai, google-vertex,
cohere, ai21, litellm, ollama, vllm, lmstudio, localai, text-generation-inference,
replicate, fal-ai, stability, jina, runpod, anyscale, baidu-ernie, tencent, sensenova.

### 2. Custom provider
`openai-compatible` remains the final dropdown entry, labeled
"Custom (OpenAI-compatible)". Free-text base URL, SSRF-guarded as today. This
replaces the separate preset dropdown inside the dialog (presets ARE the providers).

### 3. Data flow
- **Chat**: `resolveBaseUrl(providerId, storedUrl)` → for named compat providers the
  registry URL is used; for custom the stored URL; native providers pass null.
- **Test key**: same resolution; for named providers any client-supplied base_url is ignored.
- **List models**: named compat providers fetch from the registry URL; custom requires
  a validated base_url.
- **Frontend**: dropdown lists native group + preset categories + Custom. Base URL input
  only for Custom. Model auto-load (debounced, existing) uses the registry URL for named
  providers. Curated model lists: native catalog + preset model lists as fallback.

### 4. Compatibility
Existing connections are untouched. The user's Groq connection stored under
`openai-compatible` keeps working (Custom), per user decision.

### 5. Testing
- Frontend named set === backend registry keys (single consistency test).
- validators: base_url required only for Custom.
- Mock list-models returns preset models for named providers.
- Verify in browser: dropdown grouped, Groq selection, fake key → single request → error; real key chat.

## Non-goals
No UI for overriding named provider URLs. No migration of existing connections.