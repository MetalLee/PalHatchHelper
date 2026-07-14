/* Generated from inventory-sync.schema.json. Do not edit directly. */

/**
 * Complete service-role RPC request for publishing normalized inventory metadata.
 */
export interface InventoryPublishRpcRequest {
  world_id: string;
  snapshot: InventoryPublishPayload;
}
export interface InventoryPublishPayload {
  source_save_hash: string;
  source_modified_at: string;
  save_version: string | null;
  captured_at: string;
  parser_name: string;
  parser_version: string;
  server: CanonicalServer;
  guilds: CanonicalGuild[];
  players: CanonicalPlayer[];
  pals: InventoryPublishPal[];
  warnings: InventoryValidationWarning[];
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
export interface InventoryPublishPal {
  instance_uid: string;
  owner_player_uid: string | null;
  guild_uid: string | null;
  pal_id: string;
  gender: "male" | "female" | "genderless" | "unknown";
  level: number | null;
  /**
   * @maxItems 64
   */
  passive_skill_ids: string[];
  location_type: "player_party" | "player_storage" | "base" | "viewing_cage" | "unknown";
  location_name: string | null;
  owner_resolved: boolean;
  guild_resolved: boolean;
  shared_eligible: boolean;
  warning_codes: string[];
}
export interface InventoryValidationWarning {
  code: string;
  path: string;
  value: string;
}
