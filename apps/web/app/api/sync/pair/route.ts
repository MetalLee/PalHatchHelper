import {
  parseSyncPairRequest,
  PublicSyncContractError,
} from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import {
  readLimitedJson,
  SyncHttpError,
  syncError,
  syncPrivateHeaders,
} from "@/features/sync/http";
import { createDeviceToken, hashSyncSecret } from "@/features/sync/security";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPublicAppUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = parseSyncPairRequest(await readLimitedJson(request, 16 * 1024));
    } catch (error) {
      if (error instanceof PublicSyncContractError) {
        throw new SyncHttpError("SYNC_REQUEST_INVALID", 400);
      }
      throw error;
    }
    const token = createDeviceToken();
    const admin = createAdminSupabaseClient();
    const { data: deviceId, error } = await admin.rpc(
      "consume_sync_pairing_code",
      {
        p_code_hash: hashSyncSecret(body.code),
        p_device_name: body.device_name,
        p_platform: body.platform,
        p_app_version: (body.app_version ?? null) as string,
        p_token_hash: token.hash,
        p_token_prefix: token.prefix,
      },
    );
    if (error) throw error;
    return NextResponse.json(
      {
        device_id: deviceId,
        device_token: token.value,
        api_base_url: getPublicAppUrl(),
      },
      { status: 201, headers: syncPrivateHeaders },
    );
  } catch (error) {
    return syncError(error);
  }
}
