#!/usr/bin/env node
import process from "node:process";

import { createInventoryPublishPayload } from "../../apps/sync/src/redaction-core.mjs";
import {
  deepEqual,
  differencePaths,
  isRecord,
  parseExactOptions,
  readJson,
  writeNewJson,
} from "./json-tools.mjs";

try {
  const options = parseExactOptions(process.argv.slice(2), [
    "canonical",
    "actual",
    "report",
  ]);
  const canonical = assertCanonical(await readJson(options.canonical));
  const actual = assertPayload(await readJson(options.actual));
  const expected = createInventoryPublishPayload(canonical, {
    sourceHash: actual.source_save_hash,
    sourceModifiedAt: actual.source_modified_at,
    parserVersion: actual.parser_version,
  });
  const equal = deepEqual(expected, actual);
  await writeNewJson(options.report, {
    schema_version: 1,
    equal,
    comparison_semantics: {
      current_redaction_module: "apps/sync/src/redaction-core.mjs",
      array_order_preserved: true,
      normalized_array_paths: [],
    },
    expected: summary(expected),
    actual: summary(actual),
    difference_paths: differencePaths(expected, actual),
  });
  process.exitCode = equal ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "COMPARE_FAILED");
  process.exitCode = 2;
}

function summary(payload) {
  return {
    world_matches_redacted_format:
      typeof payload.server.world_uid === "string" &&
      /^pb1_[0-9a-f]{64}$/.test(payload.server.world_uid),
    guild_count: payload.guilds.length,
    player_count: payload.players.length,
    pal_count: payload.pals.length,
    warning_count: payload.warnings.length,
    parser_name: payload.parser_name,
    parser_version: payload.parser_version,
  };
}

function assertCanonical(value) {
  if (
    !isRecord(value) ||
    !isRecord(value.server) ||
    !Array.isArray(value.guilds) ||
    !Array.isArray(value.players) ||
    !Array.isArray(value.pals)
  ) {
    throw new Error("CANONICAL_SNAPSHOT_INVALID");
  }
  return value;
}

function assertPayload(value) {
  if (
    !isRecord(value) ||
    typeof value.source_save_hash !== "string" ||
    typeof value.source_modified_at !== "string" ||
    typeof value.parser_name !== "string" ||
    typeof value.parser_version !== "string" ||
    !isRecord(value.server) ||
    !Array.isArray(value.guilds) ||
    !Array.isArray(value.players) ||
    !Array.isArray(value.pals) ||
    !Array.isArray(value.warnings)
  ) {
    throw new Error("SYNC_PAYLOAD_INVALID");
  }
  return value;
}
