import { NextResponse, type NextRequest } from "next/server";

import {
  readLimitedJson,
  SyncHttpError,
  syncError,
  syncPrivateHeaders,
} from "@/features/sync/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await readLimitedJson(request, 4096)) as {
      player_id?: unknown;
    };
    if (
      typeof body.player_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.player_id,
      )
    ) {
      throw new SyncHttpError("SYNC_REQUEST_INVALID", 400);
    }
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || auth.user === null) {
      return NextResponse.json(
        { error_code: "AUTH_REQUIRED" },
        { status: 401, headers: syncPrivateHeaders },
      );
    }
    const { data, error } = await supabase.rpc("claim_synced_player", {
      p_player_id: body.player_id,
    });
    if (error) throw error;
    return NextResponse.json(
      { ok: true, player_id: data },
      { headers: syncPrivateHeaders },
    );
  } catch (error) {
    return syncError(error);
  }
}
