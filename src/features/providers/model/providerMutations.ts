// Provider key mutations via Edge Functions.
// SECURITY: plaintext keys are sent only to save-api-key / test-api-key.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteApiKey,
  listModels,
  saveApiKey,
  testApiKey,
} from "@/shared/api/providerKeysClient";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { PROVIDERS_QUERY_KEY } from "@/features/providers/model/providerQueries";
import { useToast } from "@/shared/ui";
import type {
  ListModelsRequest,
  ListModelsResponse,
  SaveApiKeyRequest,
  TestApiKeyRequest,
  TestApiKeyResponse,
} from "@/shared/types/provider";

export function useSaveApiKeyMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: SaveApiKeyRequest) => saveApiKey(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
      toast.success("API key saved securely.");
    },
    onError: (err: unknown) => {
      const normalized = normalizeError(err);
      toast.error(normalized.message || getUserFriendlyMessage(normalized.code));
    },
  });
}

export function useTestApiKeyMutation() {
  return useMutation({
    mutationFn: (input: TestApiKeyRequest): Promise<TestApiKeyResponse> => testApiKey(input),
  });
}

/** Fetch the live model list for a submitted key (used by AddProviderDialog). */
export function useListModelsMutation() {
  return useMutation({
    mutationFn: (input: ListModelsRequest): Promise<ListModelsResponse> => listModels(input),
  });
}

export function useDeleteApiKeyMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (providerConnectionId: string) =>
      deleteApiKey({ provider_connection_id: providerConnectionId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
      toast.success("Provider key deleted.");
    },
    onError: (err: unknown) => {
      const normalized = normalizeError(err);
      toast.error(normalized.message || getUserFriendlyMessage(normalized.code));
    },
  });
}
