import type {
  GuildItemInventoryItem,
  GuildItemInventoryResponse,
} from "@palhatch/contracts";
import { describe, expect, it } from "vitest";

import { calculateGuildItemCapacities } from "@/features/items/capacity";

describe("request-time item capacity", () => {
  it("calculates every visible item from one shared inventory and recipe context", () => {
    const response: GuildItemInventoryResponse = {
      status: "available",
      snapshot_id: "40000000-0000-4000-8000-000000000004",
      captured_at: "2026-08-01T00:00:00Z",
      game_data_version_id: "50000000-0000-4000-8000-000000000005",
      trend_from_at: "2026-07-31T23:00:00Z",
      trend_interval_seconds: 300,
      inventory_quantities: [{ item_id: "ingot", quantity: 6 }],
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
      items: [item("ingot", 6), item("nail", 0), item("unused", 0)],
    };

    const calculated = calculateGuildItemCapacities(response);

    expect(calculated.items.map(({ item_id }) => item_id)).toEqual([
      "ingot",
      "nail",
    ]);
    expect(calculated.items[1]?.capacity?.craftable_additional).toBe(15);
    expect(calculated.items[1]?.capacity?.on_hand).toBe(0);
  });
});

function item(itemId: string, quantity: number): GuildItemInventoryItem {
  return {
    item_id: itemId,
    name: itemId,
    type_a: "material",
    type_b: "material",
    quantity,
    guild_chest_quantity: 0,
    bases: [],
    recipes: [],
    capacity: null,
    trend_1h: [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  };
}
