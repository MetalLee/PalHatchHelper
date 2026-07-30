#!/usr/bin/env node
import process from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { isRecord, parseExactOptions } from "./json-tools.mjs";

const EXPECTED_PARSER_VERSION = "1.3.0";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REPORT_KEYS = new Set([
  "world_id",
  "world_id_preserved",
  "single_world",
  "player_ids_preserved",
  "bindings_preserved",
  "binding_count",
  "guild_count",
  "player_count",
  "duplicate_guild_count",
  "duplicate_player_count",
  "latest_snapshot_id",
  "latest_parser_name",
  "latest_parser_version",
  "latest_pal_count",
  "latest_unresolved_count",
  "unresolved_count_increased",
  "latest_snapshot_source",
  "sync_device_id",
  "sync_device_world_id",
  "data_status",
  "migration_state",
]);

export function assertCutoverReport(report, expected) {
  if (
    !isRecord(report) ||
    Object.keys(report).some((key) => !REPORT_KEYS.has(key))
  )
    throw new Error("CUTOVER_REPORT_INVALID");
  const assertions = {
    world_id_unchanged:
      report.world_id === expected.worldId &&
      report.world_id_preserved === true,
    single_world: report.single_world === true,
    device_binding:
      report.sync_device_id === expected.deviceId &&
      report.sync_device_world_id === expected.worldId,
    parser_version: report.latest_parser_version === EXPECTED_PARSER_VERSION,
    snapshot_source: report.latest_snapshot_source === "public_sync",
    guild_count: report.guild_count === expected.guildCount,
    player_count: report.player_count === expected.playerCount,
    pal_count: report.latest_pal_count === expected.palCount,
    binding_count:
      report.binding_count === expected.playerBindings &&
      report.bindings_preserved === true,
    player_ids_preserved: report.player_ids_preserved === true,
    no_duplicate_guilds: report.duplicate_guild_count === 0,
    no_duplicate_players: report.duplicate_player_count === 0,
    unresolved_not_increased: report.unresolved_count_increased === false,
    data_status: report.data_status === "normal",
    migration_state: report.migration_state === "transitioned",
  };
  const failed = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0)
    throw new Error(`CUTOVER_VERIFY_FAILED:${failed.join(",")}`);
  return {
    ok: true,
    world_id: expected.worldId,
    device_id: expected.deviceId,
    parser_version: EXPECTED_PARSER_VERSION,
    guild_count: expected.guildCount,
    player_count: expected.playerCount,
    pal_count: expected.palCount,
    player_binding_count: expected.playerBindings,
    unresolved_count: report.latest_unresolved_count,
    data_status: "normal",
  };
}

async function main() {
  const options = parseExactOptions(process.argv.slice(2), [
    "world-id",
    "expected-device-id",
    "expected-player-bindings",
    "expected-guild-count",
    "expected-player-count",
    "expected-pal-count",
  ]);
  const expected = {
    worldId: uuid(options["world-id"]),
    deviceId: uuid(options["expected-device-id"]),
    playerBindings: count(options["expected-player-bindings"]),
    guildCount: count(options["expected-guild-count"]),
    playerCount: count(options["expected-player-count"]),
    palCount: count(options["expected-pal-count"]),
  };
  const baseUrl = apiBaseUrl(process.env.SUPABASE_URL);
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole === undefined || serviceRole.length < 20)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_REQUIRED");
  const response = await fetch(
    new URL("/rest/v1/rpc/verify_public_sync_world_transition", baseUrl),
    {
      method: "POST",
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_world_id: expected.worldId }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES)
    throw new Error("CUTOVER_REPORT_TOO_LARGE");
  if (!response.ok)
    throw new Error(`CUTOVER_VERIFY_RPC_FAILED:HTTP_${response.status}`);
  const summary = assertCutoverReport(JSON.parse(body), expected);
  console.log(JSON.stringify(summary));
}

function uuid(value) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("UUID_INVALID");
  return value.toLowerCase();
}

function count(value) {
  if (!/^\d+$/.test(value)) throw new Error("COUNT_INVALID");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("COUNT_INVALID");
  return parsed;
}

function apiBaseUrl(value) {
  if (value === undefined) throw new Error("SUPABASE_URL_REQUIRED");
  const url = new URL(value);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("SUPABASE_URL_INVALID");
  }
  return url;
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "CUTOVER_VERIFY_FAILED",
    );
    process.exitCode = 1;
  });
}
