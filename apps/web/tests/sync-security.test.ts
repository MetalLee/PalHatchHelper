import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  createDeviceToken,
  createPairingCode,
  hashSyncSecret,
  readBearerToken,
} from "@/features/sync/security";
import { assertPublicSyncPayload } from "@/features/sync/payload";
import { readLimitedJson, SyncHttpError } from "@/features/sync/http";

describe("public Sync secret handling", () => {
  it("creates human-readable one-time codes but stores only a stable hash", () => {
    const code = createPairingCode(() => Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hashSyncSecret(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSyncSecret(code.toLowerCase().replace("-", " "))).toBe(
      hashSyncSecret(code),
    );
    expect(hashSyncSecret(code)).not.toContain(code);
  });

  it("creates a device token with at least 32 bytes of entropy and a safe prefix", () => {
    const token = createDeviceToken(() => Buffer.alloc(32, 11));
    expect(token.value).toMatch(/^pbs_[-_A-Za-z0-9]{43}$/);
    expect(token.prefix).toBe(token.value.slice(0, 12));
    expect(token.hash).toBe(hashSyncSecret(token.value));
  });

  it("accepts only a single Bearer credential", () => {
    expect(readBearerToken("Bearer pbs_fixture")).toBe("pbs_fixture");
    expect(readBearerToken("Basic pbs_fixture")).toBeNull();
    expect(readBearerToken("Bearer ")).toBeNull();
    expect(readBearerToken("Bearer one two")).toBeNull();
  });

  it("rejects raw identifiers and parser source metadata before publication", () => {
    const base = {
      server: { world_uid: `pb1_${"a".repeat(64)}` },
      guilds: [{ guild_uid: `pb1_${"b".repeat(64)}` }],
      players: [
        {
          player_uid: `pb1_${"c".repeat(64)}`,
          guild_uid: `pb1_${"b".repeat(64)}`,
        },
      ],
      pals: [
        {
          instance_uid: `pb1_${"d".repeat(64)}`,
          owner_player_uid: `pb1_${"c".repeat(64)}`,
          guild_uid: `pb1_${"b".repeat(64)}`,
          location_id: null,
        },
      ],
    };
    expect(() => assertPublicSyncPayload(base)).not.toThrow();
    expect(() =>
      assertPublicSyncPayload({
        ...base,
        server: { world_uid: "raw-world-guid" },
      }),
    ).toThrowError(/SYNC_UID_NOT_REDACTED/);
    expect(() =>
      assertPublicSyncPayload({
        ...base,
        pals: [
          { ...base.pals[0], metadata: { source_internal_name: "RawName" } },
        ],
      }),
    ).toThrowError(/SYNC_SOURCE_METADATA_FORBIDDEN/);
  });

  it("rejects oversized JSON and raw-file content types before parsing", async () => {
    const oversized = new NextRequest(
      "https://www.palbeacon.app/api/sync/snapshots",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(128) }),
      },
    );
    await expect(readLimitedJson(oversized, 64)).rejects.toEqual(
      expect.objectContaining<Partial<SyncHttpError>>({
        code: "SYNC_PAYLOAD_TOO_LARGE",
        status: 413,
      }),
    );

    const rawFile = new NextRequest(
      "https://www.palbeacon.app/api/sync/snapshots",
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: "raw-save-bytes",
      },
    );
    await expect(readLimitedJson(rawFile, 1024)).rejects.toEqual(
      expect.objectContaining<Partial<SyncHttpError>>({
        code: "SYNC_CONTENT_TYPE_UNSUPPORTED",
        status: 415,
      }),
    );
  });
});
