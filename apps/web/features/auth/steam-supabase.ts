import type { Database } from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SteamAccountError,
  type SteamAccountDependencies,
} from "./steam-account";

function unavailable(): SteamAccountError {
  return new SteamAccountError("STEAM_ACCOUNT_UNAVAILABLE");
}

export function createSteamAccountDependencies(
  admin: SupabaseClient<Database>,
  session: SupabaseClient<Database>,
): SteamAccountDependencies {
  return {
    async findIdentity(steamId) {
      const { data, error } = await admin
        .from("steam_identities")
        .select("user_id, steam_id")
        .eq("steam_id", steamId)
        .maybeSingle();
      if (error) throw unavailable();
      return data === null
        ? null
        : { userId: data.user_id, steamId: data.steam_id };
    },
    async createAuthUser(email, metadata) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error || data.user.email === undefined) throw unavailable();
      return { id: data.user.id, email: data.user.email };
    },
    async getAuthUser(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || data.user.email === undefined) throw unavailable();
      return { id: data.user.id, email: data.user.email };
    },
    async ensureProfile(userId, displayName) {
      const { error } = await admin.from("profiles").upsert(
        {
          id: userId,
          display_name: displayName.slice(0, 80),
          role: "player",
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw unavailable();
    },
    async saveIdentity(identity) {
      const { error } = await admin.from("steam_identities").insert({
        user_id: identity.userId,
        steam_id: identity.steamId,
        persona_name: identity.personaName,
        avatar_url: identity.avatarUrl,
        profile_url: identity.profileUrl,
      });
      if (error?.code === "23505") {
        throw new SteamAccountError("STEAM_IDENTITY_CONFLICT");
      }
      if (error) throw unavailable();
    },
    async updateIdentity(identity) {
      const { error } = await admin
        .from("steam_identities")
        .update({
          persona_name: identity.personaName,
          avatar_url: identity.avatarUrl,
          profile_url: identity.profileUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", identity.userId)
        .eq("steam_id", identity.steamId);
      if (error) throw unavailable();
    },
    async createMagicLinkToken(email) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error || !data.properties.hashed_token) {
        throw new SteamAccountError("STEAM_SESSION_UNAVAILABLE");
      }
      return data.properties.hashed_token;
    },
    async verifyMagicLinkToken(tokenHash) {
      const { error } = await session.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      });
      if (error) throw new SteamAccountError("STEAM_SESSION_UNAVAILABLE");
    },
  };
}
