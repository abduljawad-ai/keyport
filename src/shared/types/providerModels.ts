// Curated model catalog per provider.
//
// The Edge Function adapters forward `model` straight to the provider API
// (they do not maintain an allowlist), so an unknown/deprecated id surfaces as
// `model_not_supported` from the provider. This catalog gives the Composer a
// known-good dropdown so users pick from real, current model ids instead of
// guessing — eliminating the "model not supported" failure mode for the
// built-in providers.
//
// `openai-compatible` is intentionally absent: its model set is defined by the
// custom endpoint, so the Composer renders a free-text input for that case.
//
// Keep ids verbatim — they are sent to the provider as-is.

import type { ProviderId } from "./provider";
import { OPENCODE_CATALOG } from "@/shared/data/opencodeCatalog.generated";
import { getPresetById } from "./providerPresets";

export interface ModelOption {
  /** The exact id sent to the provider API. */
  id: string;
  /** Human-friendly label shown in the dropdown. */
  label: string;
  /** Light grouping for readability inside the dropdown. */
  family?: string;
}

const OPENAI_MODELS: ModelOption[] = [
  // GPT-5 series
  { id: "gpt-5.5", label: "GPT-5.5", family: "GPT-5" },
  { id: "gpt-5.5-chat", label: "GPT-5.5 (Chat)", family: "GPT-5" },
  { id: "gpt-5", label: "GPT-5", family: "GPT-5" },
  // GPT-4.1 series
  { id: "gpt-4.1", label: "GPT-4.1", family: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", family: "GPT-4.1" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano", family: "GPT-4.1" },
  // GPT-4o series
  { id: "gpt-4o", label: "GPT-4o", family: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", family: "GPT-4o" },
  { id: "gpt-4o-audio-preview", label: "GPT-4o Audio", family: "GPT-4o" },
  { id: "gpt-4o-2024-08-06", label: "GPT-4o (2024-08-06)", family: "GPT-4o" },
  { id: "gpt-4o-2024-11-20", label: "GPT-4o (2024-11-20)", family: "GPT-4o" },
  // Reasoning (o-series)
  { id: "o3", label: "o3", family: "Reasoning" },
  { id: "o3-mini", label: "o3-mini", family: "Reasoning" },
  { id: "o4-mini", label: "o4-mini", family: "Reasoning" },
  { id: "o1", label: "o1", family: "Reasoning" },
  { id: "o1-mini", label: "o1-mini", family: "Reasoning" },
  { id: "o1-pro", label: "o1-pro", family: "Reasoning" },
  // Legacy
  { id: "gpt-4-turbo", label: "GPT-4 Turbo", family: "GPT-4" },
  { id: "gpt-4-turbo-2024-04-09", label: "GPT-4 Turbo (2024-04-09)", family: "GPT-4" },
  { id: "gpt-4", label: "GPT-4", family: "GPT-4" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", family: "Legacy" },
];

const ANTHROPIC_MODELS: ModelOption[] = [
  // Claude 4
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", family: "Claude 4" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", family: "Claude 4" },
  { id: "claude-haiku-4-20250414", label: "Claude Haiku 4", family: "Claude 4" },
  // Claude 3.7
  { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet (latest)", family: "Claude 3.7" },
  { id: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet (2025-02-19)", family: "Claude 3.7" },
  // Claude 3.5
  { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet (latest)", family: "Claude 3.5" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (2024-10-22)", family: "Claude 3.5" },
  { id: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet (2024-06-20)", family: "Claude 3.5" },
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (latest)", family: "Claude 3.5" },
  { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (2024-10-22)", family: "Claude 3.5" },
  // Claude 3
  { id: "claude-3-opus-latest", label: "Claude 3 Opus (latest)", family: "Claude 3" },
  { id: "claude-3-opus-20240229", label: "Claude 3 Opus (2024-02-29)", family: "Claude 3" },
  { id: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet (2024-02-29)", family: "Claude 3" },
  { id: "claude-3-haiku-20240307", label: "Claude 3 Haiku (2024-03-07)", family: "Claude 3" },
];

const GOOGLE_MODELS: ModelOption[] = [
  // Gemini 3.x
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", family: "Gemini 3.5" },
  { id: "gemini-3.5-pro", label: "Gemini 3.5 Pro", family: "Gemini 3.5" },
  { id: "gemini-3.1-flash", label: "Gemini 3.1 Flash", family: "Gemini 3.1" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", family: "Gemini 3.1" },
  // Gemini 2.x
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", family: "Gemini 2.5" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", family: "Gemini 2.5" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", family: "Gemini 2.0" },
  { id: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash (001)", family: "Gemini 2.0" },
  { id: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (experimental)", family: "Gemini 2.0" },
  { id: "gemini-2.0-pro-exp", label: "Gemini 2.0 Pro (experimental)", family: "Gemini 2.0" },
  // Gemini 1.x
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", family: "Gemini 1.5" },
  { id: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro (latest)", family: "Gemini 1.5" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", family: "Gemini 1.5" },
  { id: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash (latest)", family: "Gemini 1.5" },
  { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash (8B)", family: "Gemini 1.5" },
  // Gemini 1.0
  { id: "gemini-1.0-pro", label: "Gemini 1.0 Pro", family: "Gemini 1.0" },
];

/**
 * Known-good model catalog for the built-in providers.
 * `openai-compatible` is omitted on purpose (see file header).
 */
export const PROVIDER_MODELS: Partial<Record<ProviderId, ModelOption[]>> = {
  openai: OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  google: GOOGLE_MODELS,
};

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

/**
 * Returns the curated list for a provider, or null when the provider's model
 * set is unknown (the custom provider) and a free-text input should be used.
 * Resolution order: opencode catalog (synced providers) → curated native list
 * → preset model list (named providers while the dialog waits for / has failed
 * to load the live key-specific list).
 */
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

/**
 * Resolve the dropdown options for a provider, preserving a currently-selected
 * model that may not be in the curated catalog (e.g. a saved default_model_id
 * from an older list, or a custom id). Unknown current values are surfaced as
 * an extra labelled option so the select never silently loses its value.
 */
export function getModelOptions(
  providerId: ProviderId | string | null | undefined,
  currentModel: string,
): ModelOption[] {
  const curated = getModelsForProvider(providerId);
  if (!curated) return [];
  const trimmed = currentModel.trim();
  if (trimmed && !curated.some((m) => m.id === trimmed)) {
  return [{ id: trimmed, label: `${trimmed} (custom)`, family: "Current" }, ...curated];
  }
  return curated;
}
