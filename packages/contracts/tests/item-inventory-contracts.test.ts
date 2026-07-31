import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const schema = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "schema/item-inventory.schema.json"),
    "utf8",
  ),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateInventory = ajv.compile({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $defs: schema.$defs,
  $ref: "#/$defs/GuildItemInventoryResponse",
});

describe("item inventory contracts", () => {
  it("accepts request-time capacity context, guild chest totals and a 13-point trend", () => {
    const response = {
      status: "partial",
      snapshot_id: "40000000-0000-4000-8000-000000000004",
      captured_at: "2026-07-31T03:00:00Z",
      game_data_version_id: "50000000-0000-4000-8000-000000000005",
      trend_from_at: "2026-07-31T02:00:00Z",
      trend_interval_seconds: 300,
      inventory_quantities: [
        { item_id: "ingot", quantity: 7 },
        { item_id: "nail", quantity: 4 },
      ],
      capacity_recipes: [
        {
          recipe_id: "recipe.nail",
          product_item_id: "nail",
          product_count: 5,
          craft_kind: "handcraft",
          deny_recipe_chain: [],
          ingredients: [{ slot: 1, item_id: "ingot", count: 2 }],
        },
      ],
      items: [
        {
          item_id: "nail",
          name: "Nail",
          type_a: "material",
          type_b: "material",
          quantity: 4,
          guild_chest_quantity: 1,
          bases: [{ base_id: "base-1", name: "Ore Base", quantity: 4 }],
          recipes: [
            {
              recipe_id: "recipe.nail",
              product_count: 5,
              craft_kind: "handcraft",
              ingredients: [
                { slot: 1, item_id: "ingot", name: "Ingot", count: 2 },
              ],
            },
          ],
          capacity: {
            on_hand: 4,
            craftable_additional: 15,
            obtainable_total: 19,
            selected_recipe_id: "recipe.nail",
            status: "ready",
            recipe_plan: [
              {
                recipe_id: "recipe.nail",
                product_item_id: "nail",
                batches: 3,
                produced: 15,
              },
            ],
            limiting_materials: [{ item_id: "ingot", missing: 1 }],
          },
          trend_1h: [4, 4, null, null, 4, 4, 4, 5, 5, 5, 4, 4, 4],
        },
      ],
    };

    expect(
      validateInventory(response),
      JSON.stringify(validateInventory.errors),
    ).toBe(true);
    expect(validateInventory({ ...response, raw_stacks: [] })).toBe(false);
    expect(
      validateInventory({
        ...response,
        items: [
          { ...response.items[0], quantity: Number.MAX_SAFE_INTEGER + 1 },
        ],
      }),
    ).toBe(false);
  });

  it("represents unavailable inventory without inventing a snapshot", () => {
    expect(
      validateInventory({
        status: "unavailable",
        snapshot_id: null,
        captured_at: null,
        game_data_version_id: null,
        trend_from_at: null,
        trend_interval_seconds: 300,
        inventory_quantities: [],
        capacity_recipes: [],
        items: [],
      }),
      JSON.stringify(validateInventory.errors),
    ).toBe(true);
  });
});
