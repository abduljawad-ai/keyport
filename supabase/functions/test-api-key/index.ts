// ============================================================================
// Edge Function: test-api-key
// POST /functions/v1/test-api-key
//
// Option A: test a newly submitted key (nothing is stored).
// Option B: test an already-stored key for an existing provider
//           connection. The key is decrypted ONLY inside this function,
//           used for the provider check, and never returned.
//
// Completed test results are returned with HTTP 200 using
// { success: true, ok: boolean, ... } — HTTP error statuses are reserved
// for authentication/validation/internal failures.
// ============================================================================

import { authenticate } from "../_shared/auth.ts";
import { finalizeCors, handleCorsPreflight } from "../_shared/cors.ts";
import { loadDataKeyFromVault, decryptApiKey } from "../_shared/crypto.ts";
import { appError, errorResponse } from "../_shared/errors.ts";
import { createAdapterForEnv, isCustomProvider, resolveBaseUrl } from "../_shared/providers/index.ts";
import type { TestResult } from "../_shared/providers/types.ts";
import { RATE_LIMITS, enforceRateLimit } from "../_shared/rateLimit.ts";
import { getRequestRequestId } from "../_shared/requestId.ts";
import { safeLog, startServer } from "../_shared/serve.ts";
import {
  assertCryptoConfigured,
  createAdminClient,
  getApiKeyByConnection,
  getOwnedConnection,
  getVaultByUserId,
  updateApiKeyFields,
  type EdgeEnv,
} from "../_shared/supabaseAdmin.ts";
import { assertSafePublicUrl } from "../_shared/urlSafety.ts";
import { parseTestApiKeyBody, readJsonBody } from "../_shared/validation.ts";

function testResponse(requestId: string, result: TestResult): Response {
  const body = result.ok
    ? { success: true, ok: true, message: result.message ?? "API key is valid." }
    : { success: true, ok: false, code: result.code, message: result.message };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "x-request-id": requestId },
  });
}

export async function handler(req: Request, env: EdgeEnv): Promise<Response> {
  const requestId = getRequestRequestId(req);
  const startedAt = Date.now();

  const preflight = handleCorsPreflight(req, env, ["POST"]);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return finalizeCors(
      errorResponse(appError("validation_error", "Method not allowed.", { status: 405 }), requestId),
      req,
      env,
    );
  }

  const admin = createAdminClient(env);
  try {
    const user = await authenticate(req, env);
    await enforceRateLimit(admin, user.id, RATE_LIMITS.testApiKey);

    const input = parseTestApiKeyBody(await readJsonBody(req));

    if (input.mode === "new") {
      // Option A — test a submitted key directly; store nothing.
      // Named providers use the locked registry URL; only the custom provider
      // accepts a client-supplied base URL, which must pass the SSRF guard.
      const baseUrl = resolveBaseUrl(input.providerId, input.baseUrl);
      if (baseUrl && isCustomProvider(input.providerId)) {
        await assertSafePublicUrl(baseUrl, {
          allowLocal: env.ALLOW_LOCAL_PROVIDER_URLS === "true",
        });
      }
      const adapter = createAdapterForEnv(input.providerId, env);
      const result = await adapter.testConnection({
        apiKey: input.apiKey,
        baseUrl,
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
      safeLog("test_api_key_new", {
        requestId,
        userId: user.id,
        providerId: input.providerId,
        ok: result.ok,
        durationMs: Date.now() - startedAt,
      });
      return finalizeCors(testResponse(requestId, result), req, env);
    }

    // Option B — test an existing stored key.
    assertCryptoConfigured(env);
    const connection = await getOwnedConnection(admin, user.id, input.providerConnectionId);
    if (!connection) {
      // 404 without leaking whether the row exists for another user.
      throw appError("not_found", "Provider connection not found.");
    }
    const keyRow = await getApiKeyByConnection(admin, connection.id);
    if (!keyRow) {
      throw appError("missing_api_key", "No API key is available for this provider.");
    }
    const vault = await getVaultByUserId(admin, user.id);
    if (!vault) {
      throw appError("decryption_failed", "The stored key could not be decrypted.");
    }

    const dataKey = await loadDataKeyFromVault(env, vault);
    const plaintext = await decryptApiKey(dataKey, keyRow.encrypted_key, keyRow.iv);

    const adapter = createAdapterForEnv(connection.provider_id, env);
    const baseUrl = resolveBaseUrl(connection.provider_id, connection.base_url);
    if (baseUrl && isCustomProvider(connection.provider_id)) {
      // Stored custom URLs were already SSRF-checked at save time; re-check as
      // defense in depth in case the stored value predates an old check.
      await assertSafePublicUrl(baseUrl, {
        allowLocal: env.ALLOW_LOCAL_PROVIDER_URLS === "true",
      });
    }
    const result = await adapter.testConnection({
      apiKey: plaintext,
      baseUrl,
      organizationId: connection.organization_id,
      projectId: connection.project_id,
    });

    // Reflect verification outcome on key metadata.
    if (result.ok) {
      await updateApiKeyFields(admin, keyRow.id, {
        status: "active",
        last_verified_at: new Date().toISOString(),
      });
    } else if (result.code === "invalid_api_key") {
      await updateApiKeyFields(admin, keyRow.id, {
        status: "invalid",
        last_verified_at: new Date().toISOString(),
      });
    }

    safeLog("test_api_key_stored", {
      requestId,
      userId: user.id,
      providerId: connection.provider_id,
      connectionId: connection.id,
      ok: result.ok,
      durationMs: Date.now() - startedAt,
    });
    return finalizeCors(testResponse(requestId, result), req, env);
  } catch (err) {
    safeLog("test_api_key_error", {
      requestId,
      code: (err as { code?: string })?.code ?? "internal_error",
      durationMs: Date.now() - startedAt,
    });
    return finalizeCors(errorResponse(err, requestId), req, env);
  }
}

startServer(handler);
