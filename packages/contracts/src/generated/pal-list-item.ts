/* Generated from pal-list-item.schema.json. Do not edit directly. */

export type PalGender = "male" | "female" | "genderless" | "unknown";
export type PalLocationType = "player_party" | "player_storage" | "base" | "viewing_cage" | "unknown";

/**
 * Safe inventory projection returned by list_available_pals; raw metadata is excluded.
 */
export interface PalListItem {
  snapshot_id: string;
  pal_instance_uid: string;
  pal_id: string;
  owner_player_id: string;
  owner_display_name: string;
  guild_id: string | null;
  gender: PalGender;
  level: number | null;
  /**
   * @maxItems 64
   */
  passive_skill_ids: string[];
  location_type: PalLocationType;
  location_name: string | null;
  share_enabled: boolean;
  is_owned_by_requester: boolean;
}
