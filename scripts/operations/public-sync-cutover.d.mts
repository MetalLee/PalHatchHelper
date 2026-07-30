export interface ExpectedCutover {
  worldId: string;
  deviceId: string;
  playerBindings: number;
  guildCount: number;
  playerCount: number;
  palCount: number;
}

export interface SafeCutoverSummary {
  ok: true;
  world_id: string;
  device_id: string;
  parser_version: "1.4.0";
  guild_count: number;
  player_count: number;
  pal_count: number;
  player_binding_count: number;
  unresolved_count: unknown;
  data_status: "normal";
}

export function assertCutoverReport(
  report: unknown,
  expected: ExpectedCutover,
): SafeCutoverSummary;
