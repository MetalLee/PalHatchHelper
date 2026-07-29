import { NextResponse, type NextRequest } from "next/server";

import { syncError, syncPrivateHeaders } from "@/features/sync/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { deviceId } = await params;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        deviceId,
      )
    ) {
      return NextResponse.json(
        { error_code: "SYNC_DEVICE_NOT_FOUND" },
        { status: 404, headers: syncPrivateHeaders },
      );
    }
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || auth.user === null) {
      return NextResponse.json(
        { error_code: "AUTH_REQUIRED" },
        { status: 401, headers: syncPrivateHeaders },
      );
    }
    const { error } = await supabase.rpc("revoke_sync_device", {
      p_device_id: deviceId,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: syncPrivateHeaders });
  } catch (error) {
    return syncError(error);
  }
}
