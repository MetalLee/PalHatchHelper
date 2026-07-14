import type { CatalogPal } from "@palhatch/contracts";

export interface FictionalCatalogFixture {
  readonly fixture_notice: "FICTIONAL_TEST_DATA_ONLY";
  readonly schema_version: "1.0.0";
  readonly pals: readonly CatalogPal[];
}

export interface CatalogBrowserPal {
  readonly pal_id: string;
  readonly encyclopedia_no: number | null;
  readonly display_name: string;
  readonly element_types: readonly string[];
  readonly rarity: number;
}

export interface CatalogQueryResult<T> {
  readonly version_id: string;
  readonly items: readonly T[];
  readonly next_cursor: string | null;
}
