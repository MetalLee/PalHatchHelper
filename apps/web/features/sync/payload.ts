const REDACTED_UID = /^pb1_[0-9a-f]{64}$/;

type SyncUidPayload = {
  server?: { world_uid?: unknown };
  guilds?: Array<{ guild_uid?: unknown }>;
  players?: Array<{ player_uid?: unknown; guild_uid?: unknown }>;
  pals?: Array<{
    instance_uid?: unknown;
    owner_player_uid?: unknown;
    guild_uid?: unknown;
    location_id?: unknown;
    metadata?: unknown;
  }>;
};

export function assertPublicSyncPayload(value: SyncUidPayload): void {
  requireUid(value.server?.world_uid);
  for (const guild of value.guilds ?? []) requireUid(guild.guild_uid);
  for (const player of value.players ?? []) {
    requireUid(player.player_uid);
    requireNullableUid(player.guild_uid);
  }
  for (const pal of value.pals ?? []) {
    requireUid(pal.instance_uid);
    requireNullableUid(pal.owner_player_uid);
    requireNullableUid(pal.guild_uid);
    requireNullableUid(pal.location_id);
    if (pal.metadata !== undefined && pal.metadata !== null) {
      throw new Error("SYNC_SOURCE_METADATA_FORBIDDEN");
    }
  }
}

function requireUid(value: unknown): void {
  if (typeof value !== "string" || !REDACTED_UID.test(value)) {
    throw new Error("SYNC_UID_NOT_REDACTED");
  }
}

function requireNullableUid(value: unknown): void {
  if (value !== undefined && value !== null) requireUid(value);
}
