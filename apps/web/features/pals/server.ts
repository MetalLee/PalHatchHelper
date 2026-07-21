import type {
  Database,
  InventoryDataStatus,
  OverviewSummary,
  PalInventoryItem,
  PalInventoryPage,
  PalInventoryRpcItem,
} from "@palhatch/contracts";
import {
  parseInventoryDataStatusRpcResult,
  parsePalInventoryRpcResult,
} from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { databaseFailureCode, Phase5DataError } from "@/features/phase5-errors";

import type { PalListQuery } from "./query";
import { decodePageContext } from "./query";

export { Phase5DataError } from "@/features/phase5-errors";

export function toSafeInventoryItem(
  row: PalInventoryRpcItem,
): PalInventoryItem {
  return {
    pal_instance_uid: row.pal_instance_uid,
    pal_id: row.pal_id,
    encyclopedia_no: row.encyclopedia_no,
    pal_display_name: row.pal_display_name,
    catalog_entry_state: row.catalog_entry_state,
    owner_filter_key: row.owner_filter_key,
    owner_display_name: row.owner_display_name,
    gender: row.gender,
    level: row.level,
    passive_skill_ids: [...row.passive_skill_ids],
    passive_display_names: [...row.passive_display_names],
    unknown_passive_skill_ids: [...row.unknown_passive_skill_ids],
    location_type: row.location_type,
    location_name: row.location_name,
    share_enabled: row.share_enabled,
    is_owned_by_requester: row.is_owned_by_requester,
  };
}

export async function listPals(
  query: PalListQuery,
  client?: SupabaseClient<Database>,
): Promise<PalInventoryPage> {
  noStore();
  const supabase = client ?? (await createServerSupabaseClient());
  const context = decodePageContext(query.context);
  const { data, error } = await supabase.rpc("list_available_pals_page_v2", {
    p_scope: query.scope,
    p_query: query.query || null,
    p_owner_filter_key: query.owner || null,
    p_gender: query.gender || null,
    p_passive_skill_id: query.passive || null,
    p_location_type: query.location || null,
    p_share_enabled: query.shared,
    p_snapshot_id: context?.snapshot_id ?? null,
    p_game_data_version_id: context?.game_data_version_id ?? null,
    p_page_number: query.page,
    p_page_size: query.page_size,
  });
  if (error !== null) throw new Phase5DataError(databaseFailureCode(error));
  const result = parsePalInventoryRpcResult(data);
  if (!result.ok) throw new Phase5DataError(result.error_code);
  return {
    snapshot_id: result.data.snapshot_id,
    game_data_version_id: result.data.game_data_version_id,
    catalog_state: result.data.catalog_state,
    items: result.data.items.map(toSafeInventoryItem),
    total_count: result.data.total_count,
    page_number: result.data.page_number,
    total_pages: result.data.total_pages,
    filter_options: {
      owners: result.data.filter_options.owners.map((option) => ({
        ...option,
      })),
      genders: [...result.data.filter_options.genders],
      passives: result.data.filter_options.passives.map((option) => ({
        ...option,
      })),
      locations: [...result.data.filter_options.locations],
    },
  };
}

export async function getInventoryDataStatus(
  client?: SupabaseClient<Database>,
): Promise<InventoryDataStatus> {
  noStore();
  const supabase = client ?? (await createServerSupabaseClient());
  const { data, error } = await supabase.rpc("get_inventory_data_status");
  if (error !== null) throw new Phase5DataError(databaseFailureCode(error));
  const result = parseInventoryDataStatusRpcResult(data);
  if (!result.ok) throw new Phase5DataError(result.error_code);
  return result.data;
}

const emptyQuery: PalListQuery = {
  scope: "all",
  query: "",
  owner: "",
  gender: "",
  passive: "",
  location: "",
  shared: null,
  page_size: 1,
  page: 1,
  context: null,
};

export async function getOverviewSummary(): Promise<OverviewSummary> {
  noStore();
  const supabase = await createServerSupabaseClient();
  const [all, mine, shared, dataStatus] = await Promise.all([
    listPals(emptyQuery, supabase),
    listPals({ ...emptyQuery, scope: "mine" }, supabase),
    listPals({ ...emptyQuery, scope: "shared" }, supabase),
    getInventoryDataStatus(supabase),
  ]);
  return {
    all_count: all.total_count,
    owned_count: mine.total_count,
    shared_count: shared.total_count,
    data_status: dataStatus,
  };
}
