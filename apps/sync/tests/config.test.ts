import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { formatStatus, saveConfig, type SyncConfig } from "../src/config.js";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

describe("configuration security", () => {
  it("writes config.json with mode 0600 and never renders the token in status", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-config-"));
    roots.push(root);
    const config: SyncConfig = {
      api_base_url: "https://www.palbeacon.app",
      device_id: "00000000-0000-4000-8000-000000000001",
      device_token: "pbs_super-secret-device-token",
      save_dir: "/fixture/save",
      oodle_lib: "/fixture/liboo2corelinux64.so.9",
      oodle_sha256: "a".repeat(64),
      interval_seconds: 300,
      device_name: "Fixture server",
    };
    const path = await saveConfig(config, root);

    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject(config);
    expect(formatStatus(config)).not.toContain(config.device_token);
    expect(formatStatus(config)).toContain("https://www.palbeacon.app");
  });
});
