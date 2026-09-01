// ============================================================================
// Edge Function: list-provider-keys
// GET /functions/v1/list-provider-keys
//
// Returns NON-SECRET provider/key metadata only.
// Never returns: plaintext keys, ciphertext, IVs, wrapped data keys.
// ============================================================================

import { authenticate } from "../_shared/auth.ts";
import { finalizeCors, handleCorsPreflight } from "../_shared/cors.ts";
import { appError, errorResponse } from "../_shared/errors.ts";
import { RATE_LIMITS, enforceRateLimit } from "../_shared/rateLimit.ts";
import { getRequestRequestId } from "../_shared/requestId.ts";
import { safeLog, startServer } from "../_shared/serve.ts";
import {
  createAdminClient,
  listApiKeysForUser,
  listConnectionsForUser,
  type EdgeEnv,
} from "../_shared/supabaseAdmin.ts";

export async function handler(req: Request, env: EdgeEnv): Promise<Response> {
  const requestId = getRequestRequestId(req);

  const preflight = handleCorsPreflight(req, env, ["GET"]);
  if (preflight) return preflight;
  if (req.method !== "GET") {
    return finalizeCors(
      errorResponse(appError("validation_error", "Method not allowed.", { status: 405 }), requestId),
      req,
      env,
    );
  }

  const admin = createAdminClient(env);
  try {
    const user = await authenticate(req, env);
    await enforceRateLimit(admin, user.id, RATE_LIMITS.listProviderKeys);

    const [connections, keys] = await Promise.all([
      listConnectionsForUser(admin, user.id),
      listApiKeysForUser(admin, user.id),
    ]);
    const keysByConnection = new Map(keys.map((key) => [key.provider_connection_id, key]));

    const providers = connections.map((connection) => {
      const key = keysByConnection.get(connection.id);
      return {
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
        api_key_metadata: key
          ? {
              exists: true,
              status: key.status,
              created_at: key.created_at,
              last_verified_at: key.last_verified_at,
              last_used_at: key.last_used_at,
            }
          : {
              exists: false,
              status: null,
              created_at: null,
              last_verified_at: null,
              last_used_at: null,
            },
      };
    });

    safeLog("list_provider_keys", {
      requestId,
      userId: user.id,
      count: providers.length,
    });

    return finalizeCors(
      new Response(JSON.stringify({ providers }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "x-request-id": requestId },
      }),
      req,
      env,
    );
  } catch (err) {
    safeLog("list_provider_keys_error", {
      requestId,
      code: (err as { code?: string })?.code ?? "internal_error",
    });
    return finalizeCors(errorResponse(err, requestId), req, env);
  }
}

startServer(handler);
