import { describe, expect, it } from "vitest";

import {
  parseInventoryPublishPayload,
  parseSyncHeartbeatRequest,
  parseSyncPairRequest,
} from "../src/public-sync-validation";

const payload = {
  source_save_hash: "a".repeat(64),
  source_modified_at: "2026-07-29T00:00:00.000Z",
  save_version: "fixture",
  captured_at: "2026-07-29T00:00:00.000Z",
  parser_name: "palhatch-plm-save-parser",
  parser_version: "1.1.0",
  server: {
    world_uid: "pb1_" + "b".repeat(64),
    save_version: "fixture",
    captured_at: "2026-07-29T00:00:00.000Z",
  },
  guilds: [],
  players: [],
  pals: [],
  warnings: [],
};

describe("public Sync shared contracts", () => {
  it("validates the existing InventoryPublishPayload at the cloud boundary", () => {
    expect(parseInventoryPublishPayload(payload)).toEqual(payload);
    expect(() =>
      parseInventoryPublishPayload({ ...payload, raw_save: "Level.sav" }),
    ).toThrowError(/SYNC_PAYLOAD_INVALID/);
  });

  it("validates pair and heartbeat requests without accepting authority fields", () => {
    expect(
      parseSyncPairRequest({
        code: "ABCD-EFGH",
        device_name: "我的帕鲁服务器",
        platform: "linux-x64",
        app_version: "0.1.0",
      }),
    ).toMatchObject({ platform: "linux-x64" });
    expect(() =>
      parseSyncPairRequest({
        code: "ABCD-EFGH",
        device_name: "server",
        platform: "linux-x64",
        owner_user_id: "00000000-0000-0000-0000-000000000000",
      }),
    ).toThrowError(/SYNC_REQUEST_INVALID/);
    expect(
      parseSyncHeartbeatRequest({ app_version: "0.1.0", status: "unchanged" }),
    ).toEqual({ app_version: "0.1.0", status: "unchanged" });
  });
});
