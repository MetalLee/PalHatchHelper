import type { CanonicalSnapshot } from "@palhatch/contracts";
import { describe, expect, it } from "vitest";

import { redactUid, toInventoryPublishPayload } from "../src/redaction.js";

const canonical: CanonicalSnapshot = {
  server: {
    world_uid: "raw-world-uid",
    save_version: "fixture",
    captured_at: "2026-07-29T00:00:00.000Z",
  },
  guilds: [{ guild_uid: "raw-guild-uid", name: "Fixture Guild" }],
  players: [
    {
      player_uid: "raw-player-uid",
      nickname: "Fixture Player",
      level: 50,
      guild_uid: "raw-guild-uid",
    },
  ],
  pals: [
    {
      instance_uid: "raw-instance-uid",
      owner_player_uid: "raw-player-uid",
      guild_uid: "raw-guild-uid",
      pal_id: "Lamball",
      is_boss: false,
      gender: "female",
      level: 12,
      passive_skill_ids: ["Artisan"],
      location_type: "player_storage",
      location_name: "Palbox",
      location_id: "raw-location-id",
      location_slot_index: 3,
      location_access_scope: "player",
      metadata: {
        source_internal_name: "SheepBall",
        source_passive_skill_internal_names: ["CraftSpeed_up1"],
      },
    },
  ],
};

describe("upload redaction", () => {
  it("uses a stable namespaced hash for every sensitive UID", () => {
    expect(redactUid("raw-world-uid")).toBe(redactUid("raw-world-uid"));
    expect(redactUid("raw-world-uid")).toMatch(/^pb1_[0-9a-f]{64}$/);
    expect(redactUid("raw-world-uid")).not.toBe(redactUid("raw-guild-uid"));
  });

  it("keeps breeding facts while removing raw UIDs and parser source metadata", () => {
    const payload = toInventoryPublishPayload(canonical, {
      sourceHash: "a".repeat(64),
      sourceModifiedAt: "2026-07-29T00:00:00.000Z",
      parserVersion: "1.2.0",
    });
    const serialized = JSON.stringify(payload);
    for (const raw of [
      "raw-world-uid",
      "raw-guild-uid",
      "raw-player-uid",
      "raw-instance-uid",
      "raw-location-id",
      "SheepBall",
      "CraftSpeed_up1",
    ]) {
      expect(serialized).not.toContain(raw);
    }
    expect(serialized).toContain("Lamball");
    expect(serialized).toContain("Artisan");
    expect(serialized).toContain("Fixture Player");
  });
});
