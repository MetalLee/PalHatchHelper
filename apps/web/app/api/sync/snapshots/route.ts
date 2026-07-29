import {
  type Json,
  parseInventoryPublishPayload,
  PublicSyncContractError,
} from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import {
  configuredMaximumPayloadBytes,
  readLimitedJson,
  SyncHttpError,
  syncError,
  syncPrivateHeaders,
} from "@/features/sync/http";
import { assertPublicSyncPayload } from "@/features/sync/payload";
import { hashSyncSecret, readBearerToken } from "@/features/sync/security";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const token = readBearerToken(request.headers.get("authorization"));
    if (token === null)
      throw new SyncHttpError("SYNC_DEVICE_UNAUTHORIZED", 401);
    let payload;
    try {
      payload = parseInventoryPublishPayload(
        await readLimitedJson(request, configuredMaximumPayloadBytes()),
      );
    } catch (error) {
      if (error instanceof PublicSyncContractError) {
        throw new SyncHttpError("SYNC_PAYLOAD_INVALID", 400);
      }
      throw error;
    }
    try {
      assertPublicSyncPayload(payload);
    } catch (error) {
      throw new SyncHttpError(
        error instanceof Error ? error.message : "SYNC_PAYLOAD_INVALID",
        400,
      );
    }
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("publish_sync_device_snapshot", {
      p_token_hash: hashSyncSecret(token),
      p_snapshot: payload as unknown as Json,
    });
    if (error) throw error;
    return NextResponse.json(
      { ok: true, ...(data as { world_id: string; snapshot_id: string }) },
      { status: 201, headers: syncPrivateHeaders },
    );
  } catch (error) {
    return syncError(error);
  }
}
