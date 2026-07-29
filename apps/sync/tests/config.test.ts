import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatStatus,
  loadConfig,
  saveConfig,
  type SyncConfig,
} from "../src/config.js";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

describe("configuration security", () => {
  it("writes config.json with mode 0600 and never renders the token in status", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-config-"));
    roots.push(root);
    const config: SyncConfig = {
      config_version: 2,
      api_base_url: "https://www.palbeacon.app",
      device_id: "00000000-0000-4000-8000-000000000001",
      device_token: "pbs_super-secret-device-token",
      save_dir: "/fixture/save",
      interval_seconds: 300,
      device_name: "Fixture server",
    };
    const path = await saveConfig(config, root);

    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject(config);
    expect(formatStatus(config)).not.toContain(config.device_token);
    expect(formatStatus(config)).toContain("https://www.palbeacon.app");
  });

  it("migrates the branch's legacy config without losing pairing credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-config-v1-"));
    roots.push(root);
    const legacyPathField = ["oodle", "lib"].join("_");
    const legacyHashField = ["oodle", "sha256"].join("_");
    await writeFile(
      join(root, "config.json"),
      `${JSON.stringify({
        api_base_url: "https://www.palbeacon.app",
        device_id: "00000000-0000-4000-8000-000000000001",
        device_token: "pbs_keep-this-token",
        save_dir: "/fixture/save",
        [legacyPathField]: "/legacy/runtime.so",
        [legacyHashField]: "a".repeat(64),
        interval_seconds: 300,
        device_name: "Fixture server",
      })}\n`,
      "utf8",
    );

    const migrated = await loadConfig(root);

    expect(migrated).toMatchObject({
      config_version: 2,
      device_id: "00000000-0000-4000-8000-000000000001",
      device_token: "pbs_keep-this-token",
      save_dir: "/fixture/save",
    });
    const persisted = JSON.parse(
      await readFile(join(root, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty(legacyPathField);
    expect(persisted).not.toHaveProperty(legacyHashField);
  });
});
