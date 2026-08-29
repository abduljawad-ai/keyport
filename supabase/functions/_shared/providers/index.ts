// ============================================================================
// _shared/providers/index.ts
// Provider adapter registry. Single entry point for Edge Functions.
// ============================================================================

import { appError } from "../errors.ts";
import type { EdgeEnv } from "../supabaseAdmin.ts";
import type { ProviderId } from "../validation.ts";
import { getNamedProvider, isCustomProvider } from "./registry.ts";
import { createAnthropicAdapter } from "./anthropic.ts";
import { createGoogleAdapter } from "./google.ts";
import { createOpenAiAdapter } from "./openai.ts";
import { createOpenAiCompatibleAdapter } from "./openai-compatible.ts";
import type { ProviderAdapter, ProviderAdapterOptions } from "./types.ts";

export * from "./types.ts";
export { createOpenAiAdapter } from "./openai.ts";
export { createAnthropicAdapter } from "./anthropic.ts";
export { createGoogleAdapter } from "./google.ts";
export { createOpenAiCompatibleAdapter } from "./openai-compatible.ts";
export * from "./registry.ts";

export function createAdapter(
  providerId: string,
  options: ProviderAdapterOptions = {},
): ProviderAdapter {
  const def = getNamedProvider(providerId);
  if (def) {
    switch (def.apiStyle) {
      case "openai":
        return createOpenAiAdapter(options);
      case "anthropic":
        return createAnthropicAdapter(options);
      case "google":
        return createGoogleAdapter(options);
      case "openai-compatible":
        return createOpenAiCompatibleAdapter(options);
    }
  }
  if (isCustomProvider(providerId)) {
    return createOpenAiCompatibleAdapter(options);
  }
  throw appError("validation_error", "Unsupported provider.");
}

/** Build an adapter configured from the Edge Function environment. */
export function createAdapterForEnv(
  providerId: ProviderId,
  env: Pick<EdgeEnv, "ALLOW_LOCAL_PROVIDER_URLS">,
  fetchImpl?: typeof fetch,
): ProviderAdapter {
  return createAdapter(providerId, {
    fetchImpl,
    allowLocalUrls: env.ALLOW_LOCAL_PROVIDER_URLS === "true",
  });
}
