import type {
  SyncBindingInvitationAccepted,
  SyncBindingInvitationPreview,
} from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import {
  bindingInvitationTokenPattern,
  hashBindingInvitationToken,
} from "@/features/sync/binding-invitations";
import { syncError, syncPrivateHeaders } from "@/features/sync/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
      "accept_player_binding_invitation",
      { p_token_hash: hashBindingInvitationToken(token) },
    );
    if (error) throw error;
    const result: SyncBindingInvitationAccepted = { player_id: data };
    return NextResponse.json(result, { headers: syncPrivateHeaders });
  } catch (error) {
    return syncError(error);
  }
}
