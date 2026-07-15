import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildPalworldStableIdMap, normalizePalworldStableId } from "../src";

interface GoldenVectors {
  vectors: { source: string; stable_id: string }[];
  invalid_vectors: { source: string; error_code: string }[];
  collision_vectors: {
    sources: string[];
    stable_id: string;
    error_code: string;
  }[];
}

const golden = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../contracts/data/palworld-stable-id-v1.json",
    ),
    "utf8",
  ),
) as GoldenVectors;

describe("Palworld stable ID v1", () => {
  it("matches every shared normalization vector", () => {
    for (const vector of golden.vectors) {
      expect(normalizePalworldStableId(vector.source)).toBe(vector.stable_id);
    }
  });

  it("rejects invalid values without slugging or translating them", () => {
    for (const vector of golden.invalid_vectors) {
      expect(() => normalizePalworldStableId(vector.source)).toThrow(
        vector.error_code,
      );
    }
  });

  it("fails when distinct source IDs normalize to the same stable ID", () => {
    for (const vector of golden.collision_vectors) {
      expect(() => buildPalworldStableIdMap(vector.sources)).toThrow(
        vector.error_code,
      );
    }
  });
});
