import type {
  GuildItemInventoryResponse,
  ItemInventoryTrendResponse,
} from "@palhatch/contracts";
import {
  parseGuildItemInventoryResponse,
  parseItemInventoryTrendResponse,
} from "@palhatch/contracts";
import { unstable_noStore as noStore } from "next/cache";

import { databaseFailureCode, Phase5DataError } from "@/features/phase5-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface DynamicRpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface DynamicRpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): Promise<DynamicRpcResult>;
}

async function client(): Promise<DynamicRpcClient> {
  return (await createServerSupabaseClient()) as unknown as DynamicRpcClient;
}

export async function getGuildItemInventory(
  locale: "zh-CN" | "en-US",
): Promise<GuildItemInventoryResponse> {
  noStore();
  const { data, error } = await (
    await client()
  ).rpc("get_guild_item_inventory", { p_locale: locale });
  if (error !== null) throw new Phase5DataError(databaseFailureCode(error));
  try {
    return parseGuildItemInventoryResponse(data);
  } catch {
    throw new Phase5DataError("DATA_UNAVAILABLE");
  }
}

export async function getGuildItemInventoryTrend(input: {
  itemId: string;
  baseId: string | null;
  bucket: "hour" | "day";
  from: Date;
  to: Date;
}): Promise<ItemInventoryTrendResponse> {
  noStore();
  const { data, error } = await (
    await client()
  ).rpc("get_guild_item_inventory_trend", {
    p_item_id: input.itemId,
    p_base_id: input.baseId,
    p_bucket: input.bucket,
    p_from: input.from.toISOString(),
    p_to: input.to.toISOString(),
  });
  if (error !== null) throw new Phase5DataError(databaseFailureCode(error));
  try {
    return parseItemInventoryTrendResponse(data);
  } catch {
    throw new Phase5DataError("DATA_UNAVAILABLE");
  }
}
