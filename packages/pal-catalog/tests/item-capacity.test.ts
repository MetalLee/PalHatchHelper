import { describe, expect, it } from "vitest";

import {
  ItemCapacityCalculator,
  type ItemCapacityRecipe,
} from "../src/item-capacity";

function recipe(
  recipeId: string,
  productItemId: string,
  productCount: number,
  ingredients: Array<[string, number]>,
  denyRecipeChain: string[] = [],
): ItemCapacityRecipe {
  return {
    recipe_id: recipeId,
    product_item_id: productItemId,
    product_count: productCount,
    craft_kind: "handcraft",
    deny_recipe_chain: denyRecipeChain,
    ingredients: ingredients.map(([itemId, count], index) => ({
      slot: index + 1,
      item_id: itemId,
      count,
    })),
  };
}

describe("ItemCapacityCalculator", () => {
  it("consumes existing intermediate inventory once and returns a deterministic plan", () => {
    const calculator = new ItemCapacityCalculator([
      recipe("r.ingot", "ingot", 2, [["ore", 3]]),
      recipe("r.nail", "nail", 5, [["ingot", 2]]),
    ]);

    const result = calculator.calculate("nail", {
      ore: 9,
      ingot: 1,
      nail: 4,
    });

    expect(result).toMatchObject({
      on_hand: 4,
      craftable_additional: 15,
      obtainable_total: 19,
      selected_recipe_id: "r.nail",
      status: "ready",
    });
    expect(
      result.recipe_plan.map(({ recipe_id, batches }) => [recipe_id, batches]),
    ).toEqual([
      ["r.ingot", 3],
      ["r.nail", 3],
    ]);
  });

  it("does not double count shared raw material across branches", () => {
    const calculator = new ItemCapacityCalculator([
      recipe("r.a", "part_a", 1, [["ore", 2]]),
      recipe("r.b", "part_b", 1, [["ore", 3]]),
      recipe("r.final", "machine", 1, [
        ["part_a", 1],
        ["part_b", 1],
      ]),
    ]);

    const result = calculator.calculate("machine", { ore: 9 });

    expect(result.craftable_additional).toBe(1);
    expect(result.limiting_materials).toEqual([{ item_id: "ore", missing: 1 }]);
  });

  it("backtracks to a nested alternative and selects top-level ties by recipe ID", () => {
    const calculator = new ItemCapacityCalculator([
      recipe("r.a.ore", "part_a", 1, [["ore", 2]]),
      recipe("r.a.stone", "part_a", 1, [["stone", 2]]),
      recipe("r.b", "part_b", 1, [["ore", 3]]),
      recipe("r.final", "machine", 1, [
        ["part_a", 1],
        ["part_b", 1],
      ]),
      recipe("r.z-cake", "cake", 1, [["flour", 2]]),
      recipe("r.a-cake", "cake", 2, [["berry", 3]]),
    ]);

    expect(
      calculator
        .calculate("machine", { ore: 3, stone: 2 })
        .recipe_plan.map(({ recipe_id }) => recipe_id),
    ).toEqual(["r.a.stone", "r.b", "r.final"]);
    expect(
      calculator.calculate("cake", { flour: 6, berry: 6 }).selected_recipe_id,
    ).toBe("r.a-cake");
  });

  it("fails closed for denied chains, cycles and unsupported production kinds", () => {
    const calculator = new ItemCapacityCalculator([
      recipe("r.powder", "powder", 1, [["stone", 1]]),
      recipe("r.blocked", "rocket", 1, [["powder", 1]], ["powder"]),
      recipe("r.a", "a", 1, [["b", 1]]),
      recipe("r.b", "b", 1, [["a", 1]]),
      {
        ...recipe("r.ranch", "milk", 1, [["feed", 1]]),
        craft_kind: "other",
      },
    ]);

    expect(calculator.calculate("rocket", { stone: 10 })).toMatchObject({
      craftable_additional: 0,
      limiting_materials: [{ item_id: "powder", missing: 1 }],
    });
    expect(calculator.calculate("a", {}).status).toBe("recipe_cycle");
    expect(calculator.calculate("milk", { feed: 100 }).status).toBe(
      "no_supported_recipe",
    );
  });
});
