// ============================================================================
// Edge Function: delete-api-key
// POST /functions/v1/delete-api-key
//
// Deletes the encrypted key row for a provider connection owned by the
// authenticated user. The provider connection itself is retained (per
// spec Part 3 §12). No plaintext is ever recovered or exposed.
// ============================================================================

import { authenticate } from "../_shared/auth.ts";
import { finalizeCors, handleCorsPreflight } from "../_shared/cors.ts";
import { appError, errorResponse } from "../_shared/errors.ts";
import { RATE_LIMITS, enforceRateLimit } from "../_shared/rateLimit.ts";
import { getRequestRequestId } from "../_shared/requestId.ts";
import { safeLog, startServer } from "../_shared/serve.ts";
import {
  createAdminClient,
  deleteApiKeyByConnection,
  getOwnedConnection,
  insertSecurityEvent,
  type EdgeEnv,
} from "../_shared/supabaseAdmin.ts";
import { parseDeleteApiKeyBody, readJsonBody } from "../_shared/validation.ts";

export async function handler(req: Request, env: EdgeEnv): Promise<Response> {
  const requestId = getRequestRequestId(req);

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
    await enforceRateLimit(admin, user.id, RATE_LIMITS.deleteApiKey);
    const input = parseDeleteApiKeyBody(await readJsonBody(req));

    const connection = await getOwnedConnection(admin, user.id, input.providerConnectionId);
    if (!connection) {
      // Do not leak whether the row exists for another user.
      throw appError("not_found", "Provider connection not found.");
    }

    await deleteApiKeyByConnection(admin, connection.id);
    await insertSecurityEvent(admin, {
      userId: user.id,
      eventType: "api_key_deleted",
      metadata: { provider_id: connection.provider_id, connection_id: connection.id },
    });

    safeLog("delete_api_key_success", {
      requestId,
      userId: user.id,
      providerId: connection.provider_id,
      connectionId: connection.id,
    });

    return finalizeCors(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "x-request-id": requestId },
      }),
      req,
      env,
    );
  } catch (err) {
    safeLog("delete_api_key_error", {
      requestId,
      code: (err as { code?: string })?.code ?? "internal_error",
    });
    return finalizeCors(errorResponse(err, requestId), req, env);
  }
}

startServer(handler);
