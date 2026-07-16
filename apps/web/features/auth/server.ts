import type { Database, UserContext } from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  authUserErrorCode,
  databaseFailureCode,
  Phase5DataError,
} from "@/features/phase5-errors";

function assertQueryAvailable(error: { code?: string } | null): void {
  if (error !== null) throw new Phase5DataError(databaseFailureCode(error));
}

async function getUserWithTimeoutRetry(supabase: SupabaseClient<Database>) {
  let result = await supabase.auth.getUser();
  if (result.error?.code !== "request_timeout") return result;
  await new Promise((resolve) => setTimeout(resolve, 100));
  result = await supabase.auth.getUser();
  return result;
}

export async function loadUserContext(
  supabase: SupabaseClient<Database>,
): Promise<UserContext | null> {
  const {
    data: { user },
    error: authError,
  } = await getUserWithTimeoutRetry(supabase);
  const authCode = authUserErrorCode(user, authError);
  if (authCode === "AUTH_REQUIRED") return null;
  if (authCode !== null) throw new Phase5DataError(authCode);
  if (user === null) throw new Phase5DataError("AUTH_UNAVAILABLE");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .maybeSingle();
  assertQueryAvailable(profileError);
  const { data: binding, error: bindingError } = await supabase
    .from("player_bindings")
    .select("player_id")
    .eq("user_id", user.id)
    .maybeSingle();
  assertQueryAvailable(bindingError);

  let bindingSummary: UserContext["binding"] = null;
  if (binding !== null) {
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id, nickname, guild_id, world_id")
      .eq("id", binding.player_id)
      .maybeSingle();
    assertQueryAvailable(playerError);
    if (player === null) throw new Phase5DataError("DATA_UNAVAILABLE");

    let guild: { id: string; name: string } | null = null;
    if (player.guild_id !== null) {
      const { data, error } = await supabase
        .from("guilds")
        .select("id, name")
        .eq("id", player.guild_id)
        .maybeSingle();
      assertQueryAvailable(error);
      if (data === null) throw new Phase5DataError("DATA_UNAVAILABLE");
      guild = data;
    }
    const { data: world, error: worldError } = await supabase
      .from("worlds")
      .select("id, name")
      .eq("id", player.world_id)
      .maybeSingle();
    assertQueryAvailable(worldError);
    if (world === null) throw new Phase5DataError("DATA_UNAVAILABLE");
    bindingSummary = {
      player_id: player.id,
      player_nickname: player.nickname,
      guild_id: player.guild_id,
      guild_name: guild?.name ?? null,
      world_id: world.id,
      world_name: world.name,
    };
  }

  const email = user.email ?? "unknown@local.invalid";
  return {
    user_id: user.id,
    email,
    display_name: profile?.display_name ?? email.split("@")[0] ?? "Player",
    role: profile?.role ?? "player",
    binding: bindingSummary,
  };
}

export const getUserContext = cache(async (): Promise<UserContext | null> => {
  noStore();
  return loadUserContext(await createServerSupabaseClient());
});

export async function requireUserContext(): Promise<UserContext> {
  const context = await getUserContext();
  if (context === null) redirect("/login");
  return context;
}
