import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import type { CanonicalSnapshot } from "../src/generated/canonical-snapshot";

const schema = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "schema/canonical-snapshot.schema.json"),
    "utf8",
  ),
) as object;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

describe("canonical snapshot contract", () => {
  it("accepts the normalized inventory boundary", () => {
    const snapshot: CanonicalSnapshot = {
      server: {
        world_uid: "fixture-world-001",
        save_version: "fixture-v1",
        captured_at: "2026-07-14T03:00:00Z",
      },
      guilds: [{ guild_uid: "fixture-guild-001", name: "Fixture Guild" }],
      players: [
        {
          player_uid: "fixture-player-001",
          nickname: "Redacted Player",
          level: 20,
          guild_uid: "fixture-guild-001",
        },
      ],
      pals: [
        {
          instance_uid: "fixture-pal-instance-001",
          owner_player_uid: "fixture-player-001",
          guild_uid: "fixture-guild-001",
          pal_id: "Lamball",
          gender: "female",
          level: 12,
          passive_skill_ids: ["Artisan"],
          location_type: "base",
          location_name: "Fixture Base",
        },
      ],
    };

    expect(validate(snapshot), JSON.stringify(validate.errors)).toBe(true);
  });
});
