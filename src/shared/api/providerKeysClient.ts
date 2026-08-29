// Provider key operations via Edge Functions.
//
// SECURITY:
//   * the plaintext API key is sent ONLY to save-api-key / test-api-key
//   * list returns metadata only; the stored key is never fetched back
//   * callers must clear form state holding the key after success

import { edgeFetch } from "@/shared/api/edgeClient";
import type {
  DeleteApiKeyRequest,
  DeleteApiKeyResponse,
  ListModelsRequest,
  ListModelsResponse,
  ListProviderKeysResponse,
  SaveApiKeyRequest,
  SaveApiKeyResponse,
  TestApiKeyRequest,
  TestApiKeyResponse,
} from "@/shared/types/provider";

export function listProviderKeys(): Promise<ListProviderKeysResponse> {
  return edgeFetch<ListProviderKeysResponse>("list-provider-keys", { method: "GET" });
}

export function saveApiKey(input: SaveApiKeyRequest): Promise<SaveApiKeyResponse> {
  return edgeFetch<SaveApiKeyResponse>("save-api-key", { method: "POST", body: input });
}

export function testApiKey(input: TestApiKeyRequest): Promise<TestApiKeyResponse> {
  return edgeFetch<TestApiKeyResponse>("test-api-key", { method: "POST", body: input });
}

export function deleteApiKey(input: DeleteApiKeyRequest): Promise<DeleteApiKeyResponse> {
  return edgeFetch<DeleteApiKeyResponse>("delete-api-key", { method: "POST", body: input });
}

/** Fetch the model ids available to a submitted key (nothing is stored). */
export function listModels(input: ListModelsRequest): Promise<ListModelsResponse> {
  return edgeFetch<ListModelsResponse>("list-models", { method: "POST", body: input });
}
