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
    const [{ data, error }, { data: members, error: membersError }] =
      await Promise.all([
        supabase.rpc("list_sync_devices"),
        supabase.rpc("list_sync_server_members"),
      ]);
    if (error) throw error;
    if (membersError) throw membersError;
    const membersByDevice = new Map<string, typeof members>();
    for (const member of members ?? []) {
      const current = membersByDevice.get(member.device_id) ?? [];
      current.push(member);
      membersByDevice.set(member.device_id, current);
    }
    const devices = (data ?? [])
      .filter((device) => device.revoked_at === null)
      .map((device) => ({
        ...device,
        members: (membersByDevice.get(device.id) ?? []).map((member) => ({
          player_id: member.player_id,
          nickname: member.nickname,
          level: member.level,
          guild_name: member.guild_name,
          world_name: member.world_name,
          discriminator: member.discriminator,
          is_bound: member.is_bound,
          is_current_user: member.is_current_user,
        })),
      }));
    return NextResponse.json({ devices }, { headers: syncPrivateHeaders });
  } catch (error) {
    return syncError(error);
  }
}
