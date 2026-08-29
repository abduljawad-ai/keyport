// Provider metadata queries.
// SECURITY: all data comes from the list-provider-keys Edge Function.
// The browser never queries provider key material directly.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProviderKeys } from "@/shared/api/providerKeysClient";
import { isActiveProvider, type ProviderWithKey } from "@/shared/types/provider";

export const PROVIDERS_QUERY_KEY = ["providers"] as const;

export function useProviderKeys() {
  return useQuery({
    queryKey: PROVIDERS_QUERY_KEY,
    queryFn: listProviderKeys,
    staleTime: 30_000,
  });
}

export interface ActiveProvidersResult {
  providers: ProviderWithKey[];
  activeProviders: ProviderWithKey[];
  hasActiveProvider: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/** Provider list plus derived "usable for chat" subset. */
export function useActiveProviders(): ActiveProvidersResult {
  const query = useProviderKeys();
  const providers = query.data?.providers ?? [];

  const activeProviders = useMemo(
    () => providers.filter(isActiveProvider),
    [providers],
  );

  return {
    providers,
    activeProviders,
    hasActiveProvider: activeProviders.length > 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
