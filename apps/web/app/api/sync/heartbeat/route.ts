import {
  parseSyncHeartbeatRequest,
  PublicSyncContractError,
} from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import {
  readLimitedJson,
  SyncHttpError,
  syncError,
  syncPrivateHeaders,
} from "@/features/sync/http";
import { hashSyncSecret, readBearerToken } from "@/features/sync/security";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const token = readBearerToken(request.headers.get("authorization"));
    if (token === null)
      throw new SyncHttpError("SYNC_DEVICE_UNAUTHORIZED", 401);
    let body;
    try {
      body = parseSyncHeartbeatRequest(await readLimitedJson(request, 4096));
    } catch (error) {
      if (error instanceof PublicSyncContractError) {
        throw new SyncHttpError("SYNC_REQUEST_INVALID", 400);
      }
      throw error;
    }
    const admin = createAdminSupabaseClient();
    const { data: deviceId, error } = await admin.rpc("heartbeat_sync_device", {
      p_token_hash: hashSyncSecret(token),
      p_app_version: (body.app_version ?? null) as string,
      p_status: body.status ?? "ok",
    });
    if (error) throw error;
    const { error: cleanupError } = await admin.rpc(
      "cleanup_expired_inventory_snapshot_payloads",
      { p_batch_size: 25 },
    );
    if (cleanupError) {
      console.warn("inventory_retention_cleanup_failed", {
        code: cleanupError.code,
      });
    }
    return NextResponse.json(
      { ok: true, device_id: deviceId },
      { headers: syncPrivateHeaders },
    );
  } catch (error) {
    return syncError(error);
  }
}
