import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import type { CanonicalSnapshot } from "@palhatch/contracts";

import { toInventoryPublishPayload } from "../src/redaction.js";
import { assertCutoverReport } from "../../../scripts/operations/verify-public-sync-cutover.mjs";
import { removeTestDirectory } from "./support.js";

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

const canonical: CanonicalSnapshot = {
  server: {
    world_uid: "synthetic-world",
    save_version: "synthetic-v1",
    captured_at: "2026-07-29T00:00:00.000Z",
  },
  guilds: [{ guild_uid: "synthetic-guild", name: "Synthetic Guild" }],
  players: [
    {
      player_uid: "synthetic-player",
      nickname: "Synthetic Player",
      level: 50,
      guild_uid: "synthetic-guild",
    },
  ],
  pals: [
    {
      instance_uid: "synthetic-pal",
      owner_player_uid: "synthetic-player",
      guild_uid: "synthetic-guild",
      pal_id: "Lamball",
      is_boss: false,
      gender: "female",
      level: 20,
      passive_skill_ids: ["Artisan"],
      location_type: "player_storage",
      location_name: "Palbox",
      location_id: "synthetic-location",
      location_slot_index: 4,
      location_access_scope: "player",
      metadata: null,
    },
  ],
};

describe("cutover comparison tools", () => {
  it("reports exact canonical equality and field-level synthetic differences", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-parser-compare-"));
    roots.push(root);
    const oldPath = join(root, "old.json");
    const equalPath = join(root, "equal.json");
    const changedPath = join(root, "changed.json");
    const equalReport = join(root, "equal-report.json");
    const changedReport = join(root, "changed-report.json");
    await writeJson(oldPath, canonical);
    await writeJson(equalPath, canonical);
    await writeJson(changedPath, {
      ...canonical,
      pals: [
        {
          ...canonical.pals[0],
          gender: "male",
          passive_skill_ids: ["Legend"],
          location_slot_index: 5,
        },
      ],
    });

    expect(
      run("scripts/operations/compare-parser-canonical.mjs", [
        "--old",
        oldPath,
        "--new",
        equalPath,
        "--report",
        equalReport,
      ]).status,
    ).toBe(0);
    expect(JSON.parse(await readFile(equalReport, "utf8"))).toMatchObject({
      equal: true,
      guild_count: { old: 1, new: 1 },
      player_count: { old: 1, new: 1 },
      pal_count: { old: 1, new: 1 },
    });

    expect(
      run("scripts/operations/compare-parser-canonical.mjs", [
        "--old",
        oldPath,
        "--new",
        changedPath,
        "--report",
        changedReport,
      ]).status,
    ).toBe(1);
    expect(JSON.parse(await readFile(changedReport, "utf8"))).toMatchObject({
      equal: false,
      gender_differences: [{ instance_uid: "synthetic-pal" }],
      passive_differences: [{ instance_uid: "synthetic-pal" }],
      location_differences: [{ instance_uid: "synthetic-pal" }],
    });
  });

  it("compares an old canonical snapshot through current redaction with inspect output", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-payload-compare-"));
    roots.push(root);
    const canonicalPath = join(root, "canonical.json");
    const actualPath = join(root, "actual.json");
    const reportPath = join(root, "report.json");
    const payload = toInventoryPublishPayload(canonical, {
      sourceHash: "a".repeat(64),
      sourceModifiedAt: "2026-07-29T00:00:00.000Z",
      parserVersion: "1.2.0",
    });
    await writeJson(canonicalPath, canonical);
    await writeJson(actualPath, payload);

    const result = run("scripts/operations/compare-sync-payload.mjs", [
      "--canonical",
      canonicalPath,
      "--actual",
      actualPath,
      "--report",
      reportPath,
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({
      equal: true,
      expected: { guild_count: 1, player_count: 1, pal_count: 1 },
      actual: { guild_count: 1, player_count: 1, pal_count: 1 },
    });
    expect(await readFile(reportPath, "utf8")).not.toContain("device_token");
  });

  it("accepts only a complete safe cutover verification report", () => {
    const expected = {
      worldId: "10000000-0000-4000-8000-000000000001",
      deviceId: "90000000-0000-4000-8000-000000000099",
      playerBindings: 3,
      guildCount: 2,
      playerCount: 3,
      palCount: 1,
    };
    const report = {
      world_id: expected.worldId,
      world_id_preserved: true,
      single_world: true,
      player_ids_preserved: true,
      bindings_preserved: true,
      binding_count: 3,
      guild_count: 2,
      player_count: 3,
      duplicate_guild_count: 0,
      duplicate_player_count: 0,
      latest_snapshot_id: "40000000-0000-4000-8000-000000000099",
      latest_parser_name: "palhatch-plm-save-parser",
      latest_parser_version: "1.2.0",
      latest_pal_count: 1,
      latest_unresolved_count: 0,
      unresolved_count_increased: false,
      latest_snapshot_source: "public_sync",
      sync_device_id: expected.deviceId,
      sync_device_world_id: expected.worldId,
      data_status: "normal",
      migration_state: "transitioned",
    };

    expect(assertCutoverReport(report, expected)).toMatchObject({
      ok: true,
      world_id: expected.worldId,
      device_id: expected.deviceId,
      parser_version: "1.2.0",
    });
    expect(() =>
      assertCutoverReport({ ...report, duplicate_player_count: 1 }, expected),
    ).toThrowError(/no_duplicate_players/);
    expect(() =>
      assertCutoverReport(
        { ...report, original_world_uid: "raw-secret" },
        expected,
      ),
    ).toThrowError(/CUTOVER_REPORT_INVALID/);
  });
});

function run(script: string, arguments_: string[]) {
  return spawnSync(
    process.execPath,
    [join(repositoryRoot, script), ...arguments_],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
