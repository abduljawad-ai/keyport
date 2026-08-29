// Shared provider/key metadata types.
// SECURITY: these types intentionally contain no field for plaintext keys,
// ciphertext, or IVs — the backend never returns those to the browser.

import {
  BUILTIN_PROVIDER_TYPES,
  NAMED_PRESET_IDS,
  getNamedPresetBaseUrl,
  getPresetById,
  isNamedPresetId,
} from "@/shared/types/providerPresets";
import { CATALOG_PROVIDER_IDS } from "@/shared/types/providerModels";

/** The "Custom (OpenAI-compatible)" provider id (free-form base URL). */
export const CUSTOM_PROVIDER_ID = "openai-compatible" as const;

export const PROVIDER_IDS = [
  ...BUILTIN_PROVIDER_TYPES,
  ...NAMED_PRESET_IDS,
  CUSTOM_PROVIDER_ID,
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isCustomProviderId(id: string | null | undefined): id is typeof CUSTOM_PROVIDER_ID {
  return id === CUSTOM_PROVIDER_ID;
}

/**
 * Locked base URL used for a provider id (mirror of the backend registry).
 * Named OpenAI-compatible providers have a built-in URL; native providers and
 * the custom provider have none (native adapters hold their defaults, the
 * custom provider needs a user-supplied URL).
 */
export function getProviderBaseUrl(providerId: string | null | undefined): string | null {
  if (isCustomProviderId(providerId) || BUILTIN_PROVIDER_TYPES.includes(providerId as never)) return null;
  return getNamedPresetBaseUrl(providerId);
}

export type ApiKeyStatus = "active" | "disabled" | "invalid";

export interface ProviderConnectionMetadata {
  id: string;
  provider_id: ProviderId;
  display_name: string | null;
  enabled: boolean;
  base_url: string | null;
  organization_id: string | null;
  project_id: string | null;
  default_model_id: string | null;
}

export interface ApiKeyMetadata {
  exists: boolean;
  status: ApiKeyStatus | null;
  created_at: string | null;
  last_verified_at: string | null;
  last_used_at: string | null;
}

export interface ProviderWithKey {
  provider_connection: ProviderConnectionMetadata;
  api_key_metadata: ApiKeyMetadata;
}

export interface ListProviderKeysResponse {
  providers: ProviderWithKey[];
}

export interface SaveApiKeyRequest {
  provider_id: ProviderId;
  /** Plaintext key: only ever held in transient form state, sent once. */
  api_key: string;
  label?: string | null;
  base_url?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  default_model_id?: string | null;
}

export interface SaveApiKeyResponse {
  success: boolean;
  provider_connection: ProviderConnectionMetadata;
  api_key_metadata: Omit<ApiKeyMetadata, "exists">;
}

export type TestApiKeyRequest =
  | {
      provider_id: ProviderId;
      api_key: string;
      base_url?: string | null;
      organization_id?: string | null;
      project_id?: string | null;
    }
  | { provider_connection_id: string };

export interface TestApiKeyResponse {
  success: boolean;
  ok: boolean;
  code?: string;
  message?: string;
}

export interface ListModelsRequest {
  provider_id: ProviderId;
  api_key: string;
  base_url?: string | null;
}

export interface ListModelsResponse {
  /** Model ids available to the submitted key, sorted, capped server-side. */
  models: string[];
}

export interface DeleteApiKeyRequest {
  provider_connection_id: string;
}

export interface DeleteApiKeyResponse {
  success: boolean;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "openai-compatible": "Custom (OpenAI-compatible)",
  ...Object.fromEntries(
    NAMED_PRESET_IDS.map((id) => [id, getPresetById(id)?.name ?? id]),
  ),
} as Record<ProviderId, string>;

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

/** True for named OpenAI-compatible providers (built-in, locked URL). */
export function hasBuiltinUrl(providerId: ProviderId): boolean {
  return isNamedPresetId(providerId);
}

/** A provider is usable for chat when it is enabled and has an active key. */
export function isActiveProvider(provider: ProviderWithKey): boolean {
  return (
    provider.provider_connection.enabled &&
    provider.api_key_metadata.exists === true &&
    provider.api_key_metadata.status === "active"
  );
}
