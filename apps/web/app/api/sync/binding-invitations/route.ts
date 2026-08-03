import type { SyncBindingInvitationCreated } from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import {
  createBindingInvitationToken,
  hashBindingInvitationToken,
} from "@/features/sync/binding-invitations";
import {
  readLimitedJson,
  SyncHttpError,
  syncError,
  syncPrivateHeaders,
} from "@/features/sync/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const body = (await readLimitedJson(request, 4096)) as {
      device_id?: unknown;
      locale?: unknown;
    };
    if (
      typeof body.device_id !== "string" ||
      !uuidPattern.test(body.device_id) ||
      (body.locale !== "zh" && body.locale !== "en")
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

    const token = createBindingInvitationToken();
    const { data, error } = await supabase.rpc(
      "create_player_binding_invitation",
      {
        p_device_id: body.device_id,
        p_token_hash: hashBindingInvitationToken(token),
        p_ttl_seconds: 86400,
      },
    );
    if (error) throw error;
    const expiresAt =
      typeof data === "object" &&
      data !== null &&
      "expires_at" in data &&
      typeof data.expires_at === "string"
        ? data.expires_at
        : null;
    if (expiresAt === null) throw new Error("BINDING_INVITATION_UNAVAILABLE");

    const result: SyncBindingInvitationCreated = {
      invitation_path: `/${body.locale}/account/binding-invitations/${token}`,
      expires_at: expiresAt,
    };
    return NextResponse.json(result, {
      status: 201,
      headers: syncPrivateHeaders,
    });
  } catch (error) {
    return syncError(error);
  }
}
