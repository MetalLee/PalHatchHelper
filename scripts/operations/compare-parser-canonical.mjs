#!/usr/bin/env node
import process from "node:process";

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
    "old",
    "new",
    "report",
  ]);
  const oldSnapshot = assertCanonical(await readJson(options.old));
  const newSnapshot = assertCanonical(await readJson(options.new));
  const report = createReport(oldSnapshot, newSnapshot);
  await writeNewJson(options.report, report);
  process.exitCode = report.equal ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "COMPARE_FAILED");
  process.exitCode = 2;
}

function createReport(oldSnapshot, newSnapshot) {
  const oldPals = byUid(oldSnapshot.pals, "instance_uid");
  const newPals = byUid(newSnapshot.pals, "instance_uid");
  const oldUids = [...oldPals.keys()].sort();
  const newUids = [...newPals.keys()].sort();
  const sharedUids = oldUids.filter((uid) => newPals.has(uid));

  return {
    schema_version: 1,
    equal: deepEqual(oldSnapshot, newSnapshot),
    comparison_semantics: {
      deep_json_first: true,
      array_order_preserved: true,
      normalized_array_paths: [],
    },
    world: comparison(oldSnapshot.server, newSnapshot.server),
    guild_count: countComparison(
      oldSnapshot.guilds.length,
      newSnapshot.guilds.length,
    ),
    player_count: countComparison(
      oldSnapshot.players.length,
      newSnapshot.players.length,
    ),
    pal_count: countComparison(
      oldSnapshot.pals.length,
      newSnapshot.pals.length,
    ),
    instance_uids: {
      equal: deepEqual(oldUids, newUids),
      only_old: oldUids.filter((uid) => !newPals.has(uid)),
      only_new: newUids.filter((uid) => !oldPals.has(uid)),
    },
    owner_guild_association_differences: fieldDifferences(
      sharedUids,
      oldPals,
      newPals,
      (pal) => ({
        owner_player_uid: pal.owner_player_uid,
        guild_uid: pal.guild_uid,
      }),
    ),
    pal_id_differences: fieldDifferences(
      sharedUids,
      oldPals,
      newPals,
      (pal) => pal.pal_id,
    ),
    gender_differences: fieldDifferences(
      sharedUids,
      oldPals,
      newPals,
      (pal) => pal.gender,
    ),
    passive_differences: fieldDifferences(
      sharedUids,
      oldPals,
      newPals,
      (pal) => pal.passive_skill_ids,
    ),
    location_differences: fieldDifferences(
      sharedUids,
      oldPals,
      newPals,
      (pal) => ({
        location_type: pal.location_type,
        location_name: pal.location_name,
        location_id: pal.location_id,
        location_slot_index: pal.location_slot_index,
        location_access_scope: pal.location_access_scope,
      }),
    ),
    all_difference_paths: differencePaths(oldSnapshot, newSnapshot),
  };
}

function comparison(oldValue, newValue) {
  return { equal: deepEqual(oldValue, newValue), old: oldValue, new: newValue };
}

function countComparison(oldValue, newValue) {
  return { equal: oldValue === newValue, old: oldValue, new: newValue };
}

function fieldDifferences(uids, oldPals, newPals, project) {
  return uids.flatMap((instanceUid) => {
    const oldValue = project(oldPals.get(instanceUid));
    const newValue = project(newPals.get(instanceUid));
    return deepEqual(oldValue, newValue)
      ? []
      : [{ instance_uid: instanceUid, old: oldValue, new: newValue }];
  });
}

function byUid(records, field) {
  const result = new Map();
  for (const record of records) {
    const uid = record[field];
    if (typeof uid !== "string" || uid.length === 0 || result.has(uid))
      throw new Error("CANONICAL_UID_INVALID");
    result.set(uid, record);
  }
  return result;
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
