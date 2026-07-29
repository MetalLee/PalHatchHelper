import { NextResponse } from "next/server";

import { createPairingCode, hashSyncSecret } from "@/features/sync/security";
import { syncError, syncPrivateHeaders } from "@/features/sync/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || auth.user === null) {
      return NextResponse.json(
        { error_code: "AUTH_REQUIRED" },
        { status: 401, headers: syncPrivateHeaders },
      );
    }
    const code = createPairingCode();
    const ttl = pairingCodeTtl();
    const { data: expiresAt, error } = await supabase.rpc(
      "create_sync_pairing_code",
      {
        p_code_hash: hashSyncSecret(code),
        p_ttl_seconds: ttl,
      },
    );
    if (error) throw error;
    return NextResponse.json(
      { code, expires_at: expiresAt },
      { status: 201, headers: syncPrivateHeaders },
    );
  } catch (error) {
    return syncError(error);
  }
}

function pairingCodeTtl(): number {
  const parsed = Number(process.env.SYNC_PAIRING_CODE_TTL_SECONDS ?? "600");
  return Number.isSafeInteger(parsed) && parsed >= 60 && parsed <= 600
    ? parsed
    : 600;
}
