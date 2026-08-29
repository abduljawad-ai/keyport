// ============================================================================
// _shared/providers/registry.ts
// Authoritative registry of named providers. Edge Functions dispatch through
// this table, and the frontend ships a mirror (providerPresets.ts) that must
// stay in sync — enforced by a vitest assertion (registry.test.ts).
//
// SECURITY: for `openai-compatible` named providers the base URL lives ONLY
// here. Any client-supplied base_url is ignored for named providers, so user
// input can never influence outbound request URLs (SSRF-safe by construction).
// Free-form user URLs are allowed exclusively via the "openai-compatible"
// (Custom) provider, which keeps its existing assertSafePublicUrl checks.
// ============================================================================

export type ApiStyle = "openai" | "anthropic" | "google" | "openai-compatible";

export interface NamedProviderDef {
  id: string;
  name: string;
  apiStyle: ApiStyle;
  /** Locked base URL. Only meaningful for `openai-compatible` style. */
  baseUrl?: string;
}

export const NAMED_PROVIDERS: NamedProviderDef[] = [
  // ── Native ──────────────────────────────────────────────────────────────
  { id: "openai", name: "OpenAI", apiStyle: "openai" },
  { id: "anthropic", name: "Anthropic", apiStyle: "anthropic" },
  { id: "google", name: "Google", apiStyle: "google" },

  // ── Frontier / First-Party (OpenAI-compatible APIs) ─────────────────────
  { id: "deepseek-official", name: "DeepSeek (Official)", apiStyle: "openai-compatible", baseUrl: "https://api.deepseek.com/v1" },
  { id: "mistral-official", name: "Mistral AI (Official)", apiStyle: "openai-compatible", baseUrl: "https://api.mistral.ai/v1" },
  { id: "xai", name: "xAI (Grok)", apiStyle: "openai-compatible", baseUrl: "https://api.x.ai/v1" },

  // ── Inference Platforms ─────────────────────────────────────────────────
  { id: "groq", name: "Groq", apiStyle: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "together", name: "Together AI", apiStyle: "openai-compatible", baseUrl: "https://api.together.xyz/v1" },
  { id: "fireworks", name: "Fireworks AI", apiStyle: "openai-compatible", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { id: "cerebras", name: "Cerebras", apiStyle: "openai-compatible", baseUrl: "https://api.cerebras.ai/v1" },
  { id: "sambanova", name: "SambaNova", apiStyle: "openai-compatible", baseUrl: "https://api.sambanova.ai/v1" },
  { id: "deepinfra", name: "DeepInfra", apiStyle: "openai-compatible", baseUrl: "https://api.deepinfra.com/v1/openai" },
  { id: "novita", name: "Novita AI", apiStyle: "openai-compatible", baseUrl: "https://api.novita.ai/v3/openai" },
  { id: "chutes", name: "Chutes", apiStyle: "openai-compatible", baseUrl: "https://api.chutes.ai/v1" },
  { id: "baseten", name: "Baseten", apiStyle: "openai-compatible", baseUrl: "https://api.baseten.co/v1" },
  { id: "modal", name: "Modal", apiStyle: "openai-compatible", baseUrl: "https://api.modal.com/v1" },
  { id: "lepton", name: "Lepton AI", apiStyle: "openai-compatible", baseUrl: "https://api.lepton.ai/v1" },
  { id: "nvidia", name: "NVIDIA", apiStyle: "openai-compatible", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "ovh", name: "OVHcloud", apiStyle: "openai-compatible", baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1" },

  // ── Gateways / Aggregators ──────────────────────────────────────────────
  { id: "openrouter", name: "OpenRouter", apiStyle: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "portkey", name: "Portkey", apiStyle: "openai-compatible", baseUrl: "https://api.portkey.ai/v1" },
  { id: "braintrust", name: "Braintrust", apiStyle: "openai-compatible", baseUrl: "https://api.braintrust.dev/v1" },

  // ── China Providers ─────────────────────────────────────────────────────
  { id: "siliconflow", name: "SiliconFlow", apiStyle: "openai-compatible", baseUrl: "https://api.siliconflow.cn/v1" },
  { id: "zhipu", name: "Zhipu AI (GLM)", apiStyle: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "moonshot", name: "Moonshot (Kimi)", apiStyle: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1" },
  { id: "alibaba", name: "Alibaba DashScope (Qwen)", apiStyle: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "minimax", name: "MiniMax", apiStyle: "openai-compatible", baseUrl: "https://api.minimax.chat/v1" },
  { id: "bytedance", name: "ByteDance (Doubao)", apiStyle: "openai-compatible", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  { id: "yi", name: "01.AI (Yi)", apiStyle: "openai-compatible", baseUrl: "https://api.lingyiwanwu.com/v1" },
  { id: "stepfun", name: "StepFun", apiStyle: "openai-compatible", baseUrl: "https://api.stepfun.com/v1" },
];

const REGISTRY = new Map<string, NamedProviderDef>(NAMED_PROVIDERS.map((p) => [p.id, p]));

/** The single "Custom" provider id (free-form OpenAI-compatible endpoint). */
export const CUSTOM_PROVIDER_ID = "openai-compatible" as const;

export function getNamedProvider(id: string): NamedProviderDef | undefined {
  return REGISTRY.get(id);
}

export function isCustomProvider(id: string): boolean {
  return id === CUSTOM_PROVIDER_ID;
}

/**
 * Resolve the base URL an adapter should use for a connection.
 * - native providers: null (adapters hold their own defaults)
 * - named openai-compatible providers: the LOCKED registry URL (stored URL is ignored)
 * - custom (openai-compatible): the stored URL (validated/required upstream)
 */
export function resolveBaseUrl(providerId: string, storedBaseUrl: string | null | undefined): string | null {
  const def = REGISTRY.get(providerId);
  if (def) {
    if (def.apiStyle === "openai-compatible") return def.baseUrl ?? null;
    return null;
  }
  if (isCustomProvider(providerId)) return storedBaseUrl?.trim() || null;
  return null;
}

/** Display name for any provider id the backend knows about. */
export function getProviderName(providerId: string): string {
  return REGISTRY.get(providerId)?.name ?? "Unknown provider";
}