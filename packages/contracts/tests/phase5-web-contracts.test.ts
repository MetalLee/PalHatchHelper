import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, expectTypeOf, it } from "vitest";

import schema from "../schema/phase5-web.schema.json";
import type {
  InventoryDataStatus,
  PalInventoryItem,
} from "../src/generated/phase5-web";

describe("Phase 5 web contracts", () => {
  it("accepts a safe paginated inventory response and excludes raw fields", () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const pageSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: schema.$defs,
      $ref: "#/$defs/PalInventoryPage",
    };
    const validate = ajv.compile(pageSchema);
    const page = {
      snapshot_id: "40000000-0000-4000-8000-000000000002",
      items: [
        {
          pal_instance_uid: "fixture-pal-a-owned-001",
          pal_id: "test_parent_a",
          encyclopedia_no: 1,
          pal_display_name: "棉悠悠",
          catalog_entry_state: "resolved",
          owner_filter_key: "a".repeat(64),
          owner_display_name: "Fixture Player A",
          gender: "male",
          level: 20,
          passive_skill_ids: ["test_passive_a"],
          passive_display_names: ["认真"],
          unknown_passive_skill_ids: [],
          location_type: "player_storage",
          location_name: "Fixture Storage A",
          ownership_scope: "player",
          share_enabled: true,
          is_owned_by_requester: true,
        },
      ],
      total_count: 1,
      page_number: 1,
      total_pages: 1,
      filter_options: {
        owners: [{ value: "a".repeat(64), label: "Fixture Player A" }],
        genders: ["male"],
        passives: [{ value: "test_passive_a", label: "认真" }],
        locations: ["player_storage"],
      },
      catalog_state: "published",
      game_data_version_id: "51000000-0000-4000-8000-000000000001",
    };

    expect(validate(page)).toBe(true);
    expect(
      validate({
        ...page,
        items: [{ ...page.items[0], raw_metadata: { forbidden: true } }],
      }),
    ).toBe(false);
    for (const internalField of [
      "owner_player_id",
      "guild_id",
      "snapshot_id",
    ]) {
      expect(
        validate({
          ...page,
          items: [{ ...page.items[0], [internalField]: "forbidden" }],
        }),
      ).toBe(false);
    }
  });

  it("keeps nullable RPC fields aligned with the generated shared types", () => {
    expectTypeOf<InventoryDataStatus["snapshot_id"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<InventoryDataStatus["captured_at"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<InventoryDataStatus["game_data_version_id"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<InventoryDataStatus["algorithm_version"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<PalInventoryItem["level"]>().toEqualTypeOf<number | null>();
    expectTypeOf<PalInventoryItem["location_name"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<PalInventoryItem["encyclopedia_no"]>().toEqualTypeOf<
      number | null
    >();
  });
});
