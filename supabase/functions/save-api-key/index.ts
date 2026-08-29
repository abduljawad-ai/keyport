// ============================================================================
// Edge Function: save-api-key
// POST /functions/v1/save-api-key
//
// Flow (spec Part 3 §9):
//   1. authenticate (Bearer token only — body user IDs are never trusted)
//   2. rate limit
//   3. validate input (incl. SSRF guard for openai-compatible base URLs)
//   4. test the key with the provider — NEVER stored if the test fails
//   5. ensure the user vault exists (race-safe idempotent upsert)
//   6. encrypt the key with the per-user data key (AES-256-GCM)
//   7. upsert provider_connections + api_keys (idempotent, replace key)
//   8. respond with NON-SECRET metadata only
//
// The plaintext key exists only in local scope and is never returned,
// persisted in plaintext, or logged.
// ============================================================================

import { authenticate } from "../_shared/auth.ts";
import { finalizeCors, handleCorsPreflight } from "../_shared/cors.ts";
import {
  encryptApiKey,
  generateDataKeyBytes,
  getMasterKeyId,
  loadMasterKey,
  unwrapDataKey,
  wrapDataKey,
} from "../_shared/crypto.ts";
import { appError, errorResponse, type ErrorCode } from "../_shared/errors.ts";
import { createAdapterForEnv, isCustomProvider, resolveBaseUrl } from "../_shared/providers/index.ts";
import { RATE_LIMITS, enforceRateLimit } from "../_shared/rateLimit.ts";
import { keyFingerprint } from "../_shared/redact.ts";
import { getRequestRequestId } from "../_shared/requestId.ts";
import { safeLog, startServer } from "../_shared/serve.ts";
import {
  assertCryptoConfigured,
  createAdminClient,
  ensureVaultForUser,
  getVaultByUserId,
  insertSecurityEvent,
  upsertApiKey,
  upsertConnection,
  type EdgeEnv,
} from "../_shared/supabaseAdmin.ts";
import { assertSafePublicUrl } from "../_shared/urlSafety.ts";
import { parseSaveApiKeyBody, readJsonBody } from "../_shared/validation.ts";

const KNOWN_TEST_ERROR_CODES: ReadonlySet<string> = new Set([
  "invalid_api_key",
  "provider_error",
  "validation_error",
  "model_not_supported",
]);

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
    await enforceRateLimit(admin, user.id, RATE_LIMITS.saveApiKey);
    assertCryptoConfigured(env);

    const input = parseSaveApiKeyBody(await readJsonBody(req));

    // Named providers use the locked registry URL (any client-supplied value
    // is ignored); only the custom provider's URL is stored, and it must pass
    // the SSRF guard BEFORE any outbound request.
    const baseUrl = resolveBaseUrl(input.providerId, input.baseUrl);
    if (baseUrl && isCustomProvider(input.providerId)) {
      await assertSafePublicUrl(baseUrl, {
        allowLocal: env.ALLOW_LOCAL_PROVIDER_URLS === "true",
      });
    }

    // Test first: a key that fails verification is never stored.
    const adapter = createAdapterForEnv(input.providerId, env);
    const test = await adapter.testConnection({
      apiKey: input.apiKey,
      baseUrl,
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    if (!test.ok) {
      const code = KNOWN_TEST_ERROR_CODES.has(test.code) ? test.code : "provider_error";
      safeLog("save_api_key_test_failed", {
        requestId,
        userId: user.id,
        providerId: input.providerId,
        code,
      });
      return finalizeCors(
        errorResponse(
          appError(code as ErrorCode, test.message, {
            status: code === "provider_error" ? 502 : 400,
          }),
          requestId,
        ),
        req,
        env,
      );
    }

    // Ensure vault (race-safe): concurrent first-saves converge on the
    // same canonical wrapped data key via ignore-duplicates upsert.
    const masterKey = await loadMasterKey(env);
    let dataKey: CryptoKey;
    const existingVault = await getVaultByUserId(admin, user.id);
    if (existingVault) {
      dataKey = await unwrapDataKey(masterKey, existingVault.wrapped_data_key, existingVault.wrap_iv);
    } else {
      const dataKeyBytes = generateDataKeyBytes();
      const wrapped = await wrapDataKey(masterKey, dataKeyBytes);
      const vault = await ensureVaultForUser(admin, user.id, {
        wrappedDataKey: wrapped.wrappedDataKey,
        wrapIv: wrapped.wrapIv,
        masterKeyId: getMasterKeyId(env),
      });
      // Re-unwrap the canonical vault row so a concurrent creator's data
      // key is used — never a divergent local copy.
      dataKey = await unwrapDataKey(masterKey, vault.wrapped_data_key, vault.wrap_iv);
    }

    const encrypted = await encryptApiKey(dataKey, input.apiKey);

    // The connection stores the custom endpoint (user-owned), while named
    // providers keep base_url NULL — their locked registry URL is owned by
    // the server catalog and always wins at request time.
    const storedBaseUrl = isCustomProvider(input.providerId) ? baseUrl : null;

    const connection = await upsertConnection(admin, {
      userId: user.id,
      providerId: input.providerId,
      displayName: input.label,
      baseUrl: storedBaseUrl,
      organizationId: input.organizationId,
      projectId: input.projectId,
      defaultModelId: input.defaultModelId,
    });

    const keyRow = await upsertApiKey(admin, {
      userId: user.id,
      providerConnectionId: connection.id,
      encryptedKey: encrypted.encryptedKey,
      iv: encrypted.iv,
      algorithm: encrypted.algorithm,
      masterKeyId: getMasterKeyId(env),
    });

    await insertSecurityEvent(admin, {
      userId: user.id,
      eventType: "api_key_saved",
      metadata: {
        provider_id: input.providerId,
        key_fingerprint: keyFingerprint(input.apiKey),
      },
    });

    safeLog("save_api_key_success", {
      requestId,
      userId: user.id,
      providerId: input.providerId,
      connectionId: connection.id,
      durationMs: Date.now() - startedAt,
    });

    // Non-secret metadata only. Never ciphertext, IVs, or keys.
    const body = {
      success: true,
      provider_connection: {
        id: connection.id,
        provider_id: connection.provider_id,
        display_name: connection.display_name,
        enabled: connection.enabled,
        base_url: connection.base_url,
        organization_id: connection.organization_id,
        project_id: connection.project_id,
        default_model_id: connection.default_model_id,
      },
      api_key_metadata: {
        status: keyRow.status,
        created_at: keyRow.created_at,
        last_verified_at: keyRow.last_verified_at,
        last_used_at: keyRow.last_used_at,
      },
    };

    return finalizeCors(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "x-request-id": requestId },
      }),
      req,
      env,
    );
  } catch (err) {
    safeLog("save_api_key_error", {
      requestId,
      code: (err as { code?: string })?.code ?? "internal_error",
      durationMs: Date.now() - startedAt,
    });
    return finalizeCors(errorResponse(err, requestId), req, env);
  }
}

startServer(handler);
