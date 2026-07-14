import type { FictionalCatalogFixture } from "./types";

export const fixtureCatalog: FictionalCatalogFixture = {
  fixture_notice: "FICTIONAL_TEST_DATA_ONLY",
  schema_version: "1.0.0",
  pals: [
    {
      pal_id: "fixture-pal-a",
      encyclopedia_no: 1,
      name_key: "fixture.pal.a.name",
      element_types: ["fixture-element"],
      rarity: 1,
      breeding_power: 100,
      metadata: { fictional: true },
    },
  ],
};
