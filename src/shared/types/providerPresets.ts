/**
 * Provider Presets Registry
 *
 * 50+ AI providers with correct API base URLs and model lists.
 * Used by AddProviderDialog to auto-fill base URL when selecting
 * an OpenAI-compatible provider.
 */

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  authHeader?: string; // default: "Authorization: Bearer <key>"
  models: string[];
  category: 'frontier' | 'inference' | 'cloud' | 'china' | 'self-hosted' | 'specialized';
}

/**
 * All built-in provider types that have native API implementations.
 * These are NOT OpenAI-compatible presets — they use the app's native handler.
 */
export const BUILTIN_PROVIDER_TYPES = ['openai', 'anthropic', 'google'] as const;

/**
 * OpenAI-compatible provider presets promoted to first-class named providers.
 * Each entry here MUST have a matching backend registry entry in
 * supabase/functions/_shared/providers/registry.ts with a locked base URL
 * (enforced by registry.test.ts). Presets NOT in this list remain available
 * via the "Custom (OpenAI-compatible)" provider with a manual URL.
 *
 * Everything in this list is a public, Bearer-authed OpenAI-compatible CHAT
 * API reachable from the Edge Functions — i.e. it will actually work.
 */
export const NAMED_PRESET_IDS = [
  // ── Frontier / First-Party ─────────────────────────────────────────────
  'deepseek-official',
  'mistral-official',
  'xai',
  // ── Inference Platforms ────────────────────────────────────────────────
  'groq',
  'together',
  'fireworks',
  'cerebras',
  'sambanova',
  'deepinfra',
  'novita',
  'chutes',
  'baseten',
  'modal',
  'lepton',
  'nvidia',
  'ovh',
  // ── Gateways / Aggregators ─────────────────────────────────────────────
  'openrouter',
  'portkey',
  'braintrust',
  // ── China Providers ────────────────────────────────────────────────────
  'siliconflow',
  'zhipu',
  'moonshot',
  'alibaba',
  'minimax',
  'bytedance',
  'yi',
  'stepfun',
] as const;

export type NamedPresetId = (typeof NAMED_PRESET_IDS)[number];

export function isNamedPresetId(id: string | null | undefined): id is NamedPresetId {
  return typeof id === 'string' && (NAMED_PRESET_IDS as readonly string[]).includes(id);
}

/**
 * Locked base URL for a named OpenAI-compatible provider (display/request
 * mirror of the backend registry). null for unknown ids.
 */
export function getNamedPresetBaseUrl(id: string | null | undefined): string | null {
  if (!isNamedPresetId(id)) return null;
  return getPresetById(id)?.baseUrl ?? null;
}

/**
 * OpenAI-compatible provider presets.
 * When user selects one, the base URL is auto-filled.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  // ── Frontier / First-Party ────────────────────────────────────────────
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    // Models come from the opencode catalog (CATALOG_PROVIDER_IDS).
    models: [],
    category: 'inference',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
      'deepseek-ai/DeepSeek-V4',
      'Qwen/Qwen3-235B-A22B-Thinking',
      'google/Gemma-3-27B-IT',
      'mistralai/Mistral-Small-3.1-24B-Instruct-2503',
    ],
    category: 'inference',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    models: [
      'accounts/fireworks/models/llama4-maverick-instruct-basic',
      'accounts/fireworks/models/qwen3-235b',
      'accounts/fireworks/models/deepseek-v3-0324',
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
      'accounts/fireworks/models/mistral-small-31-24b-instruct',
    ],
    category: 'inference',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    models: [
      'llama-3.3-70b',
      'llama-3.1-8b',
      'qwen-2.5-32b',
      'deepseek-r1-70b',
    ],
    category: 'inference',
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    baseUrl: 'https://api.sambanova.ai/v1',
    models: [
      'Meta-Llama-3.3-70B-Instruct',
      'DeepSeek-V3-0324',
      'QwQ-32B',
    ],
    category: 'inference',
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct',
      'meta-llama/Meta-Llama-3.1-405B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'Qwen/Qwen2.5-72B-Instruct',
      'mistralai/Mistral-Small-24B-Instruct-2501',
      'google/gemma-2-27b-it',
    ],
    category: 'inference',
  },
  {
    id: 'novita',
    name: 'Novita AI',
    baseUrl: 'https://api.novita.ai/v3/openai',
    models: [
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-v3-0324',
      'qwen/qwen-2.5-72b-instruct',
    ],
    category: 'inference',
  },
  {
    id: 'chutes',
    name: 'Chutes AI',
    baseUrl: 'https://api.chutes.ai/v1',
    models: [
      'llama-3.3-70b',
      'deepseek-v3',
      'qwen-2.5-72b',
    ],
    category: 'inference',
  },
  {
    id: 'baseten',
    name: 'Baseten',
    baseUrl: 'https://api.baseten.co/v1',
    models: [
      'meta-llama-3-70b-instruct',
      'deepseek-v3-0324',
    ],
    category: 'inference',
  },
  {
    id: 'modal',
    name: 'Modal',
    baseUrl: 'https://api.modal.com/v1',
    models: [
      'llama-3.3-70b-instruct',
    ],
    category: 'inference',
  },

  // ── Gateways / Aggregators ────────────────────────────────────────────
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    // Models come from the opencode catalog (CATALOG_PROVIDER_IDS).
    models: [],
    category: 'inference',
  },
  {
    id: 'portkey',
    name: 'Portkey',
    baseUrl: 'https://api.portkey.ai/v1',
    models: [
      'gpt-4o',
      'claude-sonnet-4-20250514',
      'gemini-2.5-flash',
    ],
    category: 'inference',
  },
  {
    id: 'braintrust',
    name: 'Braintrust',
    baseUrl: 'https://api.braintrust.dev/v1',
    models: [
      'gpt-4o',
      'claude-sonnet-4-20250514',
    ],
    category: 'inference',
  },
  {
    id: 'litellm',
    name: 'LiteLLM (Proxy)',
    baseUrl: 'http://localhost:4000/v1',
    models: [
      'gpt-4o',
      'claude-sonnet-4-20250514',
      'gemini-2.5-flash',
    ],
    category: 'self-hosted',
  },

  // ── Cloud Resellers ───────────────────────────────────────────────────
  {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    models: [
      'anthropic.claude-opus-4-20250514-v1:0',
      'anthropic.claude-sonnet-4-20250514-v1:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0',
      'amazon.titan-text-premier-v1:0',
      'meta.llama3-3-70b-instruct-v1:0',
      'cohere.command-r-plus-v1:0',
      'mistral.mistral-large-2402-v1:0',
      'deepseek.r1-v1:0',
      'ai21.jamba-1-5-large-v1:0',
    ],
    category: 'cloud',
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    baseUrl: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'o3',
      'o4-mini',
    ],
    category: 'cloud',
  },
  {
    id: 'google-vertex',
    name: 'Google Vertex AI',
    baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemma-3-27b-it',
    ],
    category: 'cloud',
  },

  // ── China Providers ───────────────────────────────────────────────────
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      'Qwen/Qwen3-235B-A22B-Thinking',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Pro/deepseek-ai/DeepSeek-V3',
      'Pro/Qwen/Qwen2.5-72B-Instruct',
    ],
    category: 'china',
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      'glm-4-plus',
      'glm-4-flash',
      'glm-4-long',
      'glm-4-air',
      'glm-4v-plus',
      'glm-4v-flash',
    ],
    category: 'china',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      'moonshot-v1-auto',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
      'kimi-latest',
      'kimi-0100-preview',
    ],
    category: 'china',
  },
  {
    id: 'alibaba',
    name: 'Alibaba DashScope (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    // Models come from the opencode catalog (CATALOG_PROVIDER_IDS).
    models: [],
    category: 'china',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    models: [
      'MiniMax-Text-01',
      'abab6.5s-chat',
      'abab5.5-chat',
    ],
    category: 'china',
  },
  {
    id: 'bytedance',
    name: 'ByteDance (Doubao)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      'doubao-1.5-pro-256k',
      'doubao-1.5-lite-32k',
      'doubao-pro-256k',
      'doubao-lite-32k',
    ],
    category: 'china',
  },
  {
    id: 'yi',
    name: '01.AI (Yi)',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    models: [
      'yi-large',
      'yi-medium',
      'yi-spark',
      'yi-large-turbo',
    ],
    category: 'china',
  },
  {
    id: 'stepfun',
    name: 'StepFun',
    baseUrl: 'https://api.stepfun.com/v1',
    models: [
      'step-1v-8k',
      'step-2-16k',
      'step-2-32k',
    ],
    category: 'china',
  },
  {
    id: 'baidu-ernie',
    name: 'Baidu (ERNIE)',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    models: [
      'ernie-4.0-8k',
      'ernie-3.5-8k',
      'ernie-speed-128k',
      'ernie-lite-8k',
    ],
    category: 'china',
  },
  {
    id: 'tencent',
    name: 'Tencent Hunyuan',
    baseUrl: 'https://hunyuan.tencentcloudapi.com',
    models: [
      'hunyuan-turbos-latest',
      'hunyuan-turbos',
      'hunyuan-large',
    ],
    category: 'china',
  },
  {
    id: 'sensenova',
    name: 'SenseTime SenseNova',
    baseUrl: 'https://api.sensenova.cn/v1',
    models: [
      'nova-lgv3',
      'nova-mdv2',
      'nova-spark-128k',
    ],
    category: 'china',
  },

  // ── Self-Hosted ───────────────────────────────────────────────────────
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      'llama3.3',
      'llama3.2',
      'gemma2',
      'mistral',
      'qwen2.5',
      'deepseek-r1',
      'codellama',
      'phi3',
      'command-r',
    ],
    category: 'self-hosted',
  },
  {
    id: 'vllm',
    name: 'vLLM (Local)',
    baseUrl: 'http://localhost:8000/v1',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
    ],
    category: 'self-hosted',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1',
    models: [
      'llama-3.3-70b-instruct',
      'gemma-2-27b-it',
      'mistral-7b-instruct',
    ],
    category: 'self-hosted',
  },
  {
    id: 'localai',
    name: 'LocalAI (Local)',
    baseUrl: 'http://localhost:8080/v1',
    models: [
      'gpt-4o',
      'llama-3.3-70b',
    ],
    category: 'self-hosted',
  },
  {
    id: 'text-generation-inference',
    name: 'TGI (HuggingFace)',
    baseUrl: 'http://localhost:8080/v1',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
      'mistralai/Mistral-7B-Instruct-v0.3',
    ],
    category: 'self-hosted',
  },

  // ── Specialized (Image/Video/Audio) ───────────────────────────────────
  {
    id: 'replicate',
    name: 'Replicate',
    baseUrl: 'https://api.replicate.com/v1',
    models: [
      'meta/meta-llama-3.1-405b-instruct',
      'mistralai/mistral-7b-instruct-v0.3',
      'black-forest-labs/flux-1.1-pro',
    ],
    category: 'specialized',
  },
  {
    id: 'fal-ai',
    name: 'fal.ai',
    baseUrl: 'https://fal.run',
    models: [
      'fal-ai/flux-pro/v1.1',
      'fal-ai/flux/dev',
    ],
    category: 'specialized',
  },
  {
    id: 'stability',
    name: 'Stability AI',
    baseUrl: 'https://api.stability.ai/v2beta',
    models: [
      'stable-image-ultra',
      'sd3.5-large',
      'sd3.5-large-turbo',
    ],
    category: 'specialized',
  },
  {
    id: 'jina',
    name: 'Jina AI',
    baseUrl: 'https://api.jina.ai/v1',
    models: [
      'jina-embeddings-v3',
      'jina-reranker-v2',
      'deepsearch-v1',
    ],
    category: 'specialized',
  },

  // ── Additional Inference Providers ────────────────────────────────────
  {
    id: 'runpod',
    name: 'RunPod',
    baseUrl: 'https://api.runpod.ai/v2',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct',
      'deepseek-ai/DeepSeek-V3',
    ],
    category: 'inference',
  },
  {
    id: 'anyscale',
    name: 'Anyscale',
    baseUrl: 'https://api.endpoints.anyscale.com/v1',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
    ],
    category: 'inference',
  },
  {
    id: 'lepton',
    name: 'Lepton AI',
    baseUrl: 'https://api.lepton.ai/v1',
    models: [
      'llama-3.3-70b-instruct',
      'qwen-2.5-72b-instruct',
    ],
    category: 'inference',
  },
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
  {
    id: 'deepseek-official',
    name: 'DeepSeek (Official)',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    category: 'frontier',
  },
  {
    id: 'mistral-official',
    name: 'Mistral AI (Official)',
    baseUrl: 'https://api.mistral.ai/v1',
    // Models come from the opencode catalog (CATALOG_PROVIDER_IDS).
    models: [],
    category: 'frontier',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    models: [
      'grok-3',
      'grok-3-mini',
      'grok-2',
      'grok-2-mini',
    ],
    category: 'frontier',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    models: [
      'command-r-plus',
      'command-r',
      'command-a',
      'embed-english-v3.0',
    ],
    category: 'frontier',
  },
  {
    id: 'ai21',
    name: 'AI21 Labs',
    baseUrl: 'https://api.ai21.com/studio/v1',
    models: [
      'jamba-1.5-large',
      'jamba-1.5-mini',
      'jamba-1.5-mistral',
    ],
    category: 'frontier',
  },
];

/**
 * Get presets grouped by category for display.
 */
export function getPresetsByCategory(): Record<string, ProviderPreset[]> {
  const grouped: Record<string, ProviderPreset[]> = {};
  for (const preset of PROVIDER_PRESETS) {
    if (!grouped[preset.category]) grouped[preset.category] = [];
    grouped[preset.category].push(preset);
  }
  return grouped;
}

/**
 * Find a preset by ID.
 */
export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/**
 * Category display labels.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  frontier: 'Frontier / First-Party',
  inference: 'Inference Platforms',
  cloud: 'Cloud Resellers',
  china: 'China Providers',
  'self-hosted': 'Self-Hosted',
  specialized: 'Specialized',
};
