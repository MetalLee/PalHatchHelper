import { NextResponse } from "next/server";

import { syncError, syncPrivateHeaders } from "@/features/sync/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || auth.user === null) {
      return NextResponse.json(
        { error_code: "AUTH_REQUIRED" },
        { status: 401, headers: syncPrivateHeaders },
      );
    }
    const { data, error } = await supabase.rpc("list_claimable_synced_players");
    if (error) throw error;
    return NextResponse.json(
      { players: data },
      { headers: syncPrivateHeaders },
    );
  } catch (error) {
    return syncError(error);
  }
}
