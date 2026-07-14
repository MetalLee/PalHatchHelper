import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const schema = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../schema/breeding-data.schema.json"),
    "utf8",
  ),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

describe("breeding data contracts", () => {
  it("accepts the strict source format and rejects undeclared recipe fields", () => {
    const validate = ajv.compile(schema);
    const document = {
      source_version: "fixture-v1",
      recipes: [
        {
          parents: ["fixture-pal-b", "fixture-pal-a"],
          child_pal_id: "fixture-pal-c",
          recipe_type: "special",
          metadata: { fixture: true },
        },
      ],
    };

    expect(validate(document)).toBe(true);
    expect(
      validate({
        ...document,
        recipes: [{ ...document.recipes[0], priority: 999 }],
      }),
    ).toBe(false);
  });

  it("defines shared validation, staging, and diff reports", () => {
    expect(Object.keys(schema.$defs)).toEqual(
      expect.arrayContaining([
        "StagedBreedingSourceMetadata",
        "BreedingDataValidationReport",
        "BreedingDataDiffReport",
      ]),
    );
  });
});
