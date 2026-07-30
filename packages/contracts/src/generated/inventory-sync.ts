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
  bases?: CanonicalBase[];
  item_stacks?: CanonicalItemStack[];
  item_inventory_status?: "available" | "partial" | "unavailable";
  item_recipe_capacities?: PublishedItemRecipeCapacity[];
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
  ownership_scope: "player" | "guild" | "unresolved";
  metadata?: CanonicalPalSourceMetadata | null;
  owner_resolved: boolean;
  guild_resolved: boolean;
  shared_eligible: boolean;
  warning_codes: string[];
}
export interface CanonicalPalSourceMetadata {
  source_internal_name: string;
  /**
   * @maxItems 64
   */
  source_passive_skill_internal_names: string[];
}
export interface CanonicalBase {
  base_id: string;
  guild_uid: string | null;
  name: string | null;
}
export interface CanonicalItemStack {
  container_id: string;
  item_id: string;
  quantity: number;
  container_type: "storage_box" | "refrigerator" | "feed_box" | "production_output" | "unknown";
  base_id: string | null;
  guild_uid: string | null;
  slot_index: number;
  resolution_status: "resolved" | "unresolved" | "unsupported";
}
export interface PublishedItemRecipeCapacity {
  guild_uid: string;
  item_id: string;
  on_hand: number;
  craftable_additional: number;
  obtainable_total: number;
  selected_recipe_id: string | null;
  status: "ready" | "no_supported_recipe" | "recipe_cycle" | "complexity_limit";
  recipe_plan: ItemRecipePlanStep[];
  limiting_materials: ItemRecipeLimitingMaterial[];
}
export interface ItemRecipePlanStep {
  recipe_id: string;
  product_item_id: string;
  batches: number;
  produced: number;
}
export interface ItemRecipeLimitingMaterial {
  item_id: string;
  missing: number;
}
export interface InventoryValidationWarning {
  code: string;
  path: string;
  value: string;
}
