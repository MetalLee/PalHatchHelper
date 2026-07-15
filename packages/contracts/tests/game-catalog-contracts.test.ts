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

  it("keeps 1.0.0 compatible and describes complete 1.1.0 provenance", () => {
    const validate = ajv.compile(schema);
    const baseManifest = {
      schema_version: "1.0.0",
      game_build_id: "fixture-build",
      game_version: "fixture-version",
      package_hash: "a".repeat(64),
      content_hash: "b".repeat(64),
      extractor_name: "fixture-extractor",
      extractor_version: "1.0.0",
      created_at: "2026-07-14T00:00:00Z",
      locales: ["en-US"],
      counts: {
        pals: 1,
        passive_skills: 1,
        active_skills: 1,
        pal_active_skills: 1,
        partner_skills: 1,
        breeding_recipes: 1,
        localizations: 1,
      },
      files: [
        {
          filename: "pals.jsonl",
          sha256: "c".repeat(64),
          record_count: 1,
        },
      ],
      compression: "tar.zst",
    };
    const provenance = {
      extraction_mode: "full_game_catalog",
      upstream_reference_repository: "tylercamp/palcalc",
      upstream_reference_commit: "b822c7fda4f019bd7c57f45437f14a74061a29bc",
      upstream_license: "MIT",
      extractor_repository_commit: "d".repeat(40),
      extractor_build: "fixture-build",
      cue4parse_version: "1.2.2.202607",
      source_client_app_id: "1623730",
      source_client_build_id: "client-build",
      source_client_appmanifest_sha256: "d".repeat(64),
      source_client_game_version: "v1.0.0",
      target_server_app_id: "2394010",
      target_server_build_id: "server-build",
      target_server_appmanifest_sha256: "e".repeat(64),
      target_server_game_version: "v1.0.0",
      mappings_usmap_sha256: "f".repeat(64),
      source_package_manifest_sha256: "1".repeat(64),
      extracted_at: "2026-07-15T00:00:00Z",
      compatibility_status: "exact_game_version_match",
      compatibility_evidence: [
        "client_game_version_equals_target_server_game_version",
      ],
    };

    expect(validate(baseManifest), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...baseManifest,
        schema_version: "1.1.0",
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseManifest,
        schema_version: "1.1.0",
        extractor_name: "palhatch-full-catalog-extractor",
        source_provenance: provenance,
      }),
      JSON.stringify(validate.errors),
    ).toBe(true);
    expect(
      validate({
        ...baseManifest,
        schema_version: "1.1.0",
        extractor_name: "palhatch-full-catalog-extractor",
        source_provenance: { ...provenance, cue4parse_version: "latest" },
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseManifest,
        schema_version: "1.1.0",
        extractor_name: "palhatch-full-catalog-extractor",
        source_provenance: {
          ...provenance,
          target_server_app_id: "fixture-dedicated-server",
        },
      }),
      JSON.stringify(validate.errors),
    ).toBe(true);
    expect(
      validate({
        ...baseManifest,
        schema_version: "1.1.0",
        extractor_name: "unreviewed-extractor",
        source_provenance: provenance,
      }),
    ).toBe(false);
  });
});
