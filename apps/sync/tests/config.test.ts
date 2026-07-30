import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  configDirectory,
  deleteConfig,
  formatStatus,
  loadConfig,
  saveConfig,
  type SyncConfig,
} from "../src/config.js";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

describe("configuration security", () => {
  it("keeps the Linux path and uses APPDATA with a safe Windows fallback", () => {
    expect(
      configDirectory({
        platform: "linux",
        architecture: "x64",
        environment: {},
        homeDirectory: "/home/fixture",
      }),
    ).toBe("/home/fixture/.config/palbeacon");
    expect(
      configDirectory({
        platform: "win32",
        architecture: "x64",
        environment: { APPDATA: "C:\\Users\\Ada\\AppData\\Roaming" },
        homeDirectory: "C:\\Users\\Ada",
      }),
    ).toBe("C:\\Users\\Ada\\AppData\\Roaming\\PalBeacon");
    expect(
      configDirectory({
        platform: "win32",
        architecture: "x64",
        environment: {},
        homeDirectory: "C:\\Users\\Ada",
      }),
    ).toBe("C:\\Users\\Ada\\AppData\\Roaming\\PalBeacon");
  });

  it("writes config.json with mode 0600 and never renders the token in status", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-config-"));
    roots.push(root);
    const config: SyncConfig = {
      config_version: 3,
      api_base_url: "https://www.palbeacon.app",
      device_id: "00000000-0000-4000-8000-000000000001",
      device_token: "pbs_super-secret-device-token",
      save_dir: "/fixture/64EAE19D36004D1FA0321A3703BD825F",
      world_uid: "64EAE19D36004D1FA0321A3703BD825F",
      interval_seconds: 300,
      device_name: "Fixture server",
    };
    const path = await saveConfig(config, root);

    if (process.platform !== "win32") {
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject(config);
    expect(formatStatus(config)).not.toContain(config.device_token);
    expect(formatStatus(config)).toContain("https://www.palbeacon.app");
    expect(formatStatus(config)).toContain("Server:");
    expect(formatStatus(config, "zh-CN")).toContain("服务器:");
  });

  it("reports a stable code when no configuration exists", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "palbeacon-sync-config-missing-"),
    );
    roots.push(root);

    await expect(loadConfig(root)).rejects.toThrowError(
      /SYNC_CONFIG_NOT_FOUND/,
    );
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
        save_dir: "/fixture/64EAE19D36004D1FA0321A3703BD825F",
        [legacyPathField]: "/legacy/runtime.so",
        [legacyHashField]: "a".repeat(64),
        interval_seconds: 300,
        device_name: "Fixture server",
      })}\n`,
      "utf8",
    );

    const migrated = await loadConfig(root);

    expect(migrated).toMatchObject({
      config_version: 3,
      device_id: "00000000-0000-4000-8000-000000000001",
      device_token: "pbs_keep-this-token",
      save_dir: "/fixture/64EAE19D36004D1FA0321A3703BD825F",
      world_uid: "64EAE19D36004D1FA0321A3703BD825F",
    });
    const persisted = JSON.parse(
      await readFile(join(root, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty(legacyPathField);
    expect(persisted).not.toHaveProperty(legacyHashField);
  });

  it("saves, overwrites, reads and deletes a Windows-style configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-win-config-"));
    roots.push(root);
    const first: SyncConfig = {
      config_version: 3,
      api_base_url: "https://www.palbeacon.app",
      device_id: "00000000-0000-4000-8000-000000000001",
      device_token: "pbs_first-secret-token",
      save_dir:
        "C:\\PalServer\\Pal\\Saved\\SaveGames\\0\\64EAE19D36004D1FA0321A3703BD825F",
      world_uid: "64EAE19D36004D1FA0321A3703BD825F",
      interval_seconds: 300,
      device_name: "Windows fixture",
    };
    await saveConfig(first, root, "win32-x64");
    await saveConfig(
      { ...first, device_token: "pbs_replaced-secret-token" },
      root,
      "win32-x64",
    );
    expect(await loadConfig(root)).toMatchObject({
      device_token: "pbs_replaced-secret-token",
    });
    expect(formatStatus(await loadConfig(root))).not.toContain(
      "pbs_replaced-secret-token",
    );
    await deleteConfig(root);
    await expect(loadConfig(root)).rejects.toThrowError(
      /SYNC_CONFIG_NOT_FOUND/,
    );
  });

  it("rejects a legacy config whose selected directory has no valid world UID", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-config-bad-"));
    roots.push(root);
    await writeFile(
      join(root, "config.json"),
      `${JSON.stringify({
        config_version: 2,
        api_base_url: "https://www.palbeacon.app",
        device_id: "00000000-0000-4000-8000-000000000001",
        device_token: "pbs_keep-this-token",
        save_dir: "/fixture/not-a-world-id",
        interval_seconds: 300,
        device_name: "Fixture server",
      })}\n`,
      "utf8",
    );

    await expect(loadConfig(root)).rejects.toThrowError(
      /WORLD_SAVE_ID_INVALID/,
    );
  });
});
