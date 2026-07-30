const EXPECTED_PARSER_VERSION = "1.4.0";
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
    typeof report !== "object" ||
    report === null ||
    Array.isArray(report) ||
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
