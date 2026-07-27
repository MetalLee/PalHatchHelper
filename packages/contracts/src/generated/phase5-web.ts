/* Generated from phase5-web.schema.json. Do not edit directly. */

export type InventoryScope = "all" | "mine" | "shared";
export type PalGender = "male" | "female" | "genderless" | "unknown";
export type PalLocationType =
  | "player_party"
  | "player_storage"
  | "base"
  | "dimensional_storage"
  | "viewing_cage"
  | "unknown";
export type Phase5ErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "AUTH_UNAVAILABLE"
  | "PLAYER_BINDING_REQUIRED"
  | "INVALID_PAL_SCOPE"
  | "INVALID_PAL_FILTER"
  | "INVALID_PAGINATION"
  | "INVENTORY_SNAPSHOT_CHANGED"
  | "GAME_DATA_VERSION_CHANGED"
  | "PAL_NOT_OWNED"
  | "FORBIDDEN"
  | "DATA_UNAVAILABLE";
export type PalInventoryRpcResult = PalInventoryRpcSuccess | Phase5RpcFailure;
export type InventoryDataStatusRpcResult = InventoryDataStatusRpcSuccess | Phase5RpcFailure;
export type ShareMutationRpcResult = ShareMutationRpcSuccess | Phase5RpcFailure;

export interface Phase5WebContractsContracts {
  InventoryScope: InventoryScope;
  PalGender: PalGender;
  PalLocationType: PalLocationType;
  PalInventoryItem: PalInventoryItem;
  PalInventoryPage: PalInventoryPage;
  PalInventoryRpcItem: PalInventoryRpcItem;
  PalInventoryRpcData: PalInventoryRpcData;
  PlayerBindingSummary: PlayerBindingSummary;
  UserContext: UserContext;
  InventoryDataStatus: InventoryDataStatus;
  OverviewSummary: OverviewSummary;
  Phase5ErrorCode: Phase5ErrorCode;
  Phase5Error: Phase5Error;
  Phase5RpcFailure: Phase5RpcFailure;
  PalInventoryRpcSuccess: PalInventoryRpcSuccess;
  PalInventoryRpcResult: PalInventoryRpcResult;
  InventoryDataStatusRpcSuccess: InventoryDataStatusRpcSuccess;
  InventoryDataStatusRpcResult: InventoryDataStatusRpcResult;
  ShareMutationData: ShareMutationData;
  ShareMutationRpcSuccess: ShareMutationRpcSuccess;
  ShareMutationRpcResult: ShareMutationRpcResult;
}
export interface PalInventoryItem {
  pal_instance_uid: string;
  pal_id: string;
  is_boss: boolean | null;
  encyclopedia_no: number | null;
  /**
   * @maxItems 4
   */
  element_types: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
  pal_display_name: string;
  catalog_entry_state: "resolved" | "unknown" | "not_configured";
  owner_filter_key: string;
  owner_display_name: string;
  gender: PalGender;
  level: number | null;
  /**
   * @maxItems 64
   */
  passive_skill_ids: string[];
  /**
   * @maxItems 64
   */
  passive_display_names: string[];
  /**
   * @maxItems 64
   */
  unknown_passive_skill_ids: string[];
  location_type: PalLocationType;
  location_name: string | null;
  location_id: string | null;
  location_slot_index: number | null;
  location_access_scope: "player" | "guild" | "unresolved";
  ownership_scope: "player" | "guild" | "unresolved";
  share_enabled: boolean;
  is_owned_by_requester: boolean;
}
export interface PalInventoryPage {
  snapshot_id: string | null;
  game_data_version_id: string | null;
  catalog_state: "published" | "not_configured";
  /**
   * @maxItems 50
   */
  items: PalInventoryItem[];
  total_count: number;
  page_number: number;
  total_pages: number;
  filter_options: PalInventoryFilterOptions;
}
export interface PalInventoryFilterOptions {
  /**
   * @maxItems 1000
   */
  owners: PalFilterOption[];
  genders: PalGender[];
  /**
   * @maxItems 1000
   */
  passives: PalPassiveFilterOption[];
  locations: PalLocationType[];
}
export interface PalFilterOption {
  value: string;
  label: string;
}
export interface PalPassiveFilterOption {
  value: string;
  label: string;
  rank: number;
  is_negative: boolean;
}
export interface PalInventoryRpcItem {
  pal_instance_uid: string;
  pal_id: string;
  is_boss: boolean | null;
  encyclopedia_no: number | null;
  /**
   * @maxItems 4
   */
  element_types: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
  pal_display_name: string;
  catalog_entry_state: "resolved" | "unknown" | "not_configured";
  owner_filter_key: string;
  owner_display_name: string;
  gender: PalGender;
  level: number | null;
  /**
   * @maxItems 64
   */
  passive_skill_ids: string[];
  /**
   * @maxItems 64
   */
  passive_display_names: string[];
  /**
   * @maxItems 64
   */
  unknown_passive_skill_ids: string[];
  location_type: PalLocationType;
  location_name: string | null;
  location_id: string | null;
  location_slot_index: number | null;
  location_access_scope: "player" | "guild" | "unresolved";
  ownership_scope: "player" | "guild" | "unresolved";
  share_enabled: boolean;
  is_owned_by_requester: boolean;
}
export interface PalInventoryRpcData {
  snapshot_id: string | null;
  game_data_version_id: string | null;
  catalog_state: "published" | "not_configured";
  /**
   * @maxItems 50
   */
  items: PalInventoryRpcItem[];
  total_count: number;
  page_number: number;
  total_pages: number;
  filter_options: PalInventoryFilterOptions;
}
export interface PlayerBindingSummary {
  player_id: string;
  player_nickname: string;
  guild_id: string | null;
  guild_name: string | null;
  world_id: string;
  world_name: string;
}
export interface UserContext {
  user_id: string;
  email: string;
  display_name: string;
  role: "admin" | "player";
  binding: PlayerBindingSummary | null;
}
export interface InventoryDataStatus {
  state: "healthy" | "stale" | "parse_error" | "empty";
  snapshot_id: string | null;
  captured_at: string | null;
  source_modified_at: string | null;
  parser_name: string | null;
  parser_version: string | null;
  last_attempt_at: string | null;
  error_code: string | null;
  using_previous_snapshot: boolean;
  game_data_state: "published" | "not_configured" | "review_pending" | "blocked";
  game_data_version_id: string | null;
  game_build_id: string | null;
  game_version: string | null;
  algorithm_version: string | null;
}
export interface OverviewSummary {
  all_count: number;
  owned_count: number;
  shared_count: number;
  data_status: InventoryDataStatus;
}
export interface Phase5Error {
  error_code: Phase5ErrorCode;
}
export interface Phase5RpcFailure {
  ok: false;
  error_code: Phase5ErrorCode;
}
export interface PalInventoryRpcSuccess {
  ok: true;
  data: PalInventoryRpcData;
}
export interface InventoryDataStatusRpcSuccess {
  ok: true;
  data: InventoryDataStatus;
}
export interface ShareMutationData {
  pal_instance_uid: string;
  share_enabled: boolean;
}
export interface ShareMutationRpcSuccess {
  ok: true;
  data: ShareMutationData;
}
