/* Generated from canonical-snapshot.schema.json. Do not edit directly. */

/**
 * Language-neutral, normalized inventory emitted by a ParserAdapter.
 */
export interface CanonicalSnapshot {
  server: CanonicalServer;
  guilds: CanonicalGuild[];
  players: CanonicalPlayer[];
  pals: CanonicalPal[];
}
export interface CanonicalServer {
  world_uid: string;
  save_version: string | null;
  captured_at: string;
}
export interface CanonicalGuild {
  guild_uid: string;
  name: string;
}
export interface CanonicalPlayer {
  player_uid: string;
  nickname: string;
  level: number | null;
  guild_uid: string | null;
}
export interface CanonicalPal {
  instance_uid: string;
  owner_player_uid: string | null;
  guild_uid: string | null;
  pal_id: string;
  is_boss: boolean;
  gender: "male" | "female" | "genderless" | "unknown";
  level: number | null;
  /**
   * @maxItems 64
   */
  passive_skill_ids: string[];
  location_type: "player_party" | "player_storage" | "base" | "dimensional_storage" | "viewing_cage" | "unknown";
  location_name: string | null;
  location_id: string | null;
  location_slot_index: number | null;
  location_access_scope: "player" | "guild" | "unresolved";
  metadata?: CanonicalPalSourceMetadata | null;
}
export interface CanonicalPalSourceMetadata {
  source_internal_name: string;
  /**
   * @maxItems 64
   */
  source_passive_skill_internal_names: string[];
}
