import { afterEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  cleanup: vi.fn(async () => undefined),
  bundledParserManifest: vi.fn(async () => ({
    platform: "linux-x64" as const,
    version: "1.3.0",
    sha256: "a".repeat(64),
  })),
  createSnapshot: vi.fn(),
  parseSnapshot: vi.fn(),
  uploadSnapshot: vi.fn(async () => undefined),
  sendHeartbeat: vi.fn(async () => undefined),
  saveConfig: vi.fn(async () => "/fixture/config.json"),
}));

vi.mock("../src/snapshot.js", () => ({
  createReadOnlySnapshot: fakes.createSnapshot,
}));
vi.mock("../src/parser.js", () => ({
  bundledParserManifest: fakes.bundledParserManifest,
  parseSnapshot: fakes.parseSnapshot,
}));
vi.mock("../src/api.js", () => ({
  uploadSnapshot: fakes.uploadSnapshot,
  sendHeartbeat: fakes.sendHeartbeat,
}));
vi.mock("../src/config.js", async (original) => ({
  ...(await original()),
  saveConfig: fakes.saveConfig,
}));

import type { SyncConfig } from "../src/config.js";
import { syncOnce } from "../src/sync.js";

const baseConfig: SyncConfig = {
  config_version: 3,
  api_base_url: "https://www.palbeacon.app",
  device_id: "00000000-0000-4000-8000-000000000001",
  device_token: "pbs_secret",
  save_dir: "/fixture/64EAE19D36004D1FA0321A3703BD825F",
  world_uid: "64EAE19D36004D1FA0321A3703BD825F",
  interval_seconds: 300,
  device_name: "Fixture",
};

afterEach(() => vi.clearAllMocks());

describe("sync lifecycle", () => {
  it("always cleans the temporary save snapshot when parsing fails", async () => {
    fakes.createSnapshot.mockResolvedValue({
      path: "/temporary/read-only-snapshot",
      hash: "b".repeat(64),
      sourceModifiedAt: "2026-07-29T00:00:00.000Z",
      cleanup: fakes.cleanup,
    });
    fakes.parseSnapshot.mockRejectedValue(new Error("PARSER_FAILED"));

    await expect(syncOnce({ ...baseConfig })).rejects.toThrowError(
      /PARSER_FAILED/,
    );
    expect(fakes.cleanup).toHaveBeenCalledOnce();
    expect(fakes.uploadSnapshot).not.toHaveBeenCalled();
    expect(fakes.parseSnapshot).toHaveBeenCalledWith(
      "/temporary/read-only-snapshot",
      { worldUid: "64EAE19D36004D1FA0321A3703BD825F" },
    );
  });

  it("sends only a heartbeat when the stable save hash is unchanged", async () => {
    const hash = "c".repeat(64);
    fakes.createSnapshot.mockResolvedValue({
      path: "/temporary/read-only-snapshot",
      hash,
      sourceModifiedAt: "2026-07-29T00:00:00.000Z",
      cleanup: fakes.cleanup,
    });

    await expect(
      syncOnce({ ...baseConfig, state: { last_save_hash: hash } }),
    ).resolves.toBe("unchanged");
    expect(fakes.sendHeartbeat).toHaveBeenCalledOnce();
    expect(fakes.parseSnapshot).not.toHaveBeenCalled();
    expect(fakes.uploadSnapshot).not.toHaveBeenCalled();
    expect(fakes.cleanup).toHaveBeenCalledOnce();
  });

  it("publishes the Parser version from its verified bundle manifest", async () => {
    fakes.createSnapshot.mockResolvedValue({
      path: "/temporary/read-only-snapshot",
      hash: "d".repeat(64),
      sourceModifiedAt: "2026-07-29T00:00:00.000Z",
      cleanup: fakes.cleanup,
    });
    fakes.parseSnapshot.mockResolvedValue({
      server: {
        world_uid: "fixture-world",
        save_version: "PlM/0x31",
        captured_at: "2026-07-29T00:00:00.000Z",
      },
      guilds: [],
      players: [],
      pals: [],
    });

    await expect(syncOnce({ ...baseConfig })).resolves.toBe("uploaded");

    expect(fakes.bundledParserManifest).toHaveBeenCalledOnce();
    expect(fakes.uploadSnapshot).toHaveBeenCalledWith(
      baseConfig.api_base_url,
      baseConfig.device_token,
      expect.objectContaining({ parser_version: "1.3.0" }),
    );
    expect(fakes.cleanup).toHaveBeenCalledOnce();
  });
});
