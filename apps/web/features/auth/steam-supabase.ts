import type { Database } from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  steamAccountStageError,
  SteamAccountStageError,
  type SteamAccountDependencies,
  type SteamAccountErrorCode,
  type SteamLoginStage,
} from "./steam-account";

function unavailable(
  error: unknown,
  stage: SteamLoginStage,
  code: SteamAccountErrorCode = "STEAM_ACCOUNT_UNAVAILABLE",
): SteamAccountStageError {
  return steamAccountStageError(error, stage, code);
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
      if (error) throw unavailable(error, "find_identity");
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
      if (error) throw unavailable(error, "create_auth_user");
      if (data.user.email === undefined) {
        throw new SteamAccountStageError(
          "STEAM_ACCOUNT_UNAVAILABLE",
          "create_auth_user",
        );
      }
      return { id: data.user.id, email: data.user.email };
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw unavailable(error, "cleanup_auth_user");
    },
    async getAuthUser(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw unavailable(error, "get_auth_user");
      if (data.user.email === undefined) {
        throw new SteamAccountStageError(
          "STEAM_ACCOUNT_UNAVAILABLE",
          "get_auth_user",
        );
      }
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
      if (error) throw unavailable(error, "ensure_profile");
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
        throw new SteamAccountStageError(
          "STEAM_IDENTITY_CONFLICT",
          "save_identity",
          { databaseCode: error.code },
          { cause: error },
        );
      }
      if (error) throw unavailable(error, "save_identity");
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
      if (error) throw unavailable(error, "update_identity");
    },
    async createMagicLinkToken(email) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error || !data.properties.hashed_token) {
        throw unavailable(
          error,
          "create_session_token",
          "STEAM_SESSION_UNAVAILABLE",
        );
      }
      return data.properties.hashed_token;
    },
    async verifyMagicLinkToken(tokenHash) {
      const { error } = await session.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      });
      if (error) {
        throw unavailable(error, "verify_session", "STEAM_SESSION_UNAVAILABLE");
      }
    },
  };
}
