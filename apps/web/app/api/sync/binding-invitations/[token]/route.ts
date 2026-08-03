import type {
  SyncBindingInvitationAccepted,
  SyncBindingInvitationPreview,
} from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import {
  bindingInvitationTokenPattern,
  hashBindingInvitationToken,
} from "@/features/sync/binding-invitations";
import {
  readLimitedJson,
  syncError,
  syncPrivateHeaders,
} from "@/features/sync/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedClient() {
  const supabase = await createServerSupabaseClient();
  const { data: auth, error } = await supabase.auth.getUser();
  return { supabase, authenticated: error === null && auth.user !== null };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!bindingInvitationTokenPattern.test(token)) {
      return NextResponse.json(
        { error_code: "BINDING_INVITATION_INVALID" },
        { status: 404, headers: syncPrivateHeaders },
      );
    }
    const { supabase, authenticated } = await authenticatedClient();
    if (!authenticated) {
      return NextResponse.json(
        { error_code: "AUTH_REQUIRED" },
        { status: 401, headers: syncPrivateHeaders },
      );
    }
    const { data, error } = await supabase.rpc(
      "get_player_binding_invitation",
      { p_token_hash: hashBindingInvitationToken(token) },
    );
    if (error) throw error;
    return NextResponse.json(data as unknown as SyncBindingInvitationPreview, {
      headers: syncPrivateHeaders,
    });
  } catch (error) {
    return syncError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!bindingInvitationTokenPattern.test(token)) {
      return NextResponse.json(
        { error_code: "BINDING_INVITATION_INVALID" },
        { status: 404, headers: syncPrivateHeaders },
      );
    }
    const body = (await readLimitedJson(request, 4096)) as {
      player_id?: unknown;
    };
    if (
      typeof body.player_id !== "string" ||
      !uuidPattern.test(body.player_id)
    ) {
      return NextResponse.json(
        { error_code: "SYNC_REQUEST_INVALID" },
        { status: 400, headers: syncPrivateHeaders },
      );
    }
    const { supabase, authenticated } = await authenticatedClient();
    if (!authenticated) {
      return NextResponse.json(
        { error_code: "AUTH_REQUIRED" },
        { status: 401, headers: syncPrivateHeaders },
      );
    }
    const { data, error } = await supabase.rpc(
      "accept_player_binding_invitation",
      {
        p_token_hash: hashBindingInvitationToken(token),
        p_player_id: body.player_id,
      },
    );
    if (error) throw error;
    const result: SyncBindingInvitationAccepted = { player_id: data };
    return NextResponse.json(result, { headers: syncPrivateHeaders });
  } catch (error) {
    return syncError(error);
  }
}
