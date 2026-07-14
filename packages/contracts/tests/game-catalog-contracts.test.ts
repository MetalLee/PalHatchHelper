import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const schema = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../schema/game-catalog.schema.json"),
    "utf8",
  ),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

describe("game catalog contracts", () => {
  it("validates the immutable manifest and rejects undeclared fields", () => {
    const validate = ajv.compile(schema);
    const manifest = {
      schema_version: "1.0.0",
      game_build_id: "fixture-build",
      game_version: "fixture-version",
      package_hash: "a".repeat(64),
      content_hash: "b".repeat(64),
      extractor_name: "fixture-extractor",
      extractor_version: "1.0.0",
      created_at: "2026-07-14T00:00:00Z",
      locales: ["en-US", "zh-CN"],
      counts: {
        pals: 2,
        passive_skills: 1,
        active_skills: 1,
        pal_active_skills: 1,
        partner_skills: 1,
        breeding_recipes: 1,
        localizations: 8,
      },
      files: [
        {
          filename: "pals.jsonl",
          sha256: "c".repeat(64),
          record_count: 2,
        },
      ],
      compression: "tar.gz",
    };

    expect(validate(manifest)).toBe(true);
    expect(validate({ ...manifest, absolute_path: "/forbidden" })).toBe(false);
  });

  it("exposes every catalog record schema from the same source", () => {
    expect(Object.keys(schema.$defs)).toEqual(
      expect.arrayContaining([
        "GameDataVersion",
        "CatalogPal",
        "CatalogPassiveSkill",
        "CatalogActiveSkill",
        "CatalogPalActiveSkill",
        "CatalogPartnerSkill",
        "CatalogLocalization",
        "CatalogBreedingRecipe",
        "CatalogValidationReport",
        "CatalogFileChecksum",
      ]),
    );
  });
});
