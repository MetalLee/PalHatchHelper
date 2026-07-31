/* Generated from item-inventory.schema.json. Do not edit directly. */

export interface ItemInventoryContractsContracts {
  ItemInventoryBaseTotal: ItemInventoryBaseTotal;
  ItemRecipeIngredientView: ItemRecipeIngredientView;
  ItemRecipeView: ItemRecipeView;
  ItemRecipePlanStep: ItemRecipePlanStep;
  ItemRecipeLimitingMaterial: ItemRecipeLimitingMaterial;
  ItemRecipeCapacity: ItemRecipeCapacity;
  PublishedItemRecipeCapacity: PublishedItemRecipeCapacity;
  ItemInventoryQuantity: ItemInventoryQuantity;
  ItemCapacityIngredient: ItemCapacityIngredient;
  ItemCapacityRecipe: ItemCapacityRecipe;
  GuildItemInventoryItem: GuildItemInventoryItem;
  GuildItemInventoryResponse: GuildItemInventoryResponse;
  ItemInventoryTrendPoint: ItemInventoryTrendPoint;
  ItemInventoryTrendResponse: ItemInventoryTrendResponse;
}
export interface ItemInventoryBaseTotal {
  base_id: string;
  name: string | null;
  quantity: number;
}
export interface ItemRecipeIngredientView {
  slot: number;
  item_id: string;
  name: string;
  count: number;
}
export interface ItemRecipeView {
  recipe_id: string;
  product_count: number;
  craft_kind: "handcraft" | "cooking";
  /**
   * @minItems 1
   * @maxItems 5
   */
  ingredients:
    | [ItemRecipeIngredientView]
    | [ItemRecipeIngredientView, ItemRecipeIngredientView]
    | [ItemRecipeIngredientView, ItemRecipeIngredientView, ItemRecipeIngredientView]
    | [ItemRecipeIngredientView, ItemRecipeIngredientView, ItemRecipeIngredientView, ItemRecipeIngredientView]
    | [
        ItemRecipeIngredientView,
        ItemRecipeIngredientView,
        ItemRecipeIngredientView,
        ItemRecipeIngredientView,
        ItemRecipeIngredientView
      ];
}
export interface ItemRecipePlanStep {
  recipe_id: string;
  product_item_id: string;
  batches: number;
  produced: number;
}
export interface ItemRecipeLimitingMaterial {
  item_id: string;
  missing: number;
}
export interface ItemRecipeCapacity {
  on_hand: number;
  craftable_additional: number;
  obtainable_total: number;
  selected_recipe_id: string | null;
  status: "ready" | "no_supported_recipe" | "recipe_cycle" | "complexity_limit";
  recipe_plan: ItemRecipePlanStep[];
  limiting_materials: ItemRecipeLimitingMaterial[];
}
export interface PublishedItemRecipeCapacity {
  guild_uid: string;
  item_id: string;
  on_hand: number;
  craftable_additional: number;
  obtainable_total: number;
  selected_recipe_id: string | null;
  status: "ready" | "no_supported_recipe" | "recipe_cycle" | "complexity_limit";
  recipe_plan: ItemRecipePlanStep[];
  limiting_materials: ItemRecipeLimitingMaterial[];
}
export interface ItemInventoryQuantity {
  item_id: string;
  quantity: number;
}
export interface ItemCapacityIngredient {
  slot: number;
  item_id: string;
  count: number;
}
export interface ItemCapacityRecipe {
  recipe_id: string;
  product_item_id: string;
  product_count: number;
  craft_kind: "handcraft" | "cooking";
  deny_recipe_chain: string[];
  /**
   * @minItems 1
   * @maxItems 5
   */
  ingredients:
    | [ItemCapacityIngredient]
    | [ItemCapacityIngredient, ItemCapacityIngredient]
    | [ItemCapacityIngredient, ItemCapacityIngredient, ItemCapacityIngredient]
    | [ItemCapacityIngredient, ItemCapacityIngredient, ItemCapacityIngredient, ItemCapacityIngredient]
    | [
        ItemCapacityIngredient,
        ItemCapacityIngredient,
        ItemCapacityIngredient,
        ItemCapacityIngredient,
        ItemCapacityIngredient
      ];
}
export interface GuildItemInventoryItem {
  item_id: string;
  name: string;
  type_a: string;
  type_b: string;
  quantity: number;
  guild_chest_quantity: number;
  bases: ItemInventoryBaseTotal[];
  recipes: ItemRecipeView[];
  capacity: ItemRecipeCapacity | null;
  /**
   * @minItems 13
   * @maxItems 13
   */
  trend_1h: [
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null
  ];
}
export interface GuildItemInventoryResponse {
  status: "available" | "partial" | "unavailable";
  snapshot_id: string | null;
  captured_at: string | null;
  game_data_version_id: string | null;
  trend_from_at: string | null;
  trend_interval_seconds: 300;
  inventory_quantities: ItemInventoryQuantity[];
  capacity_recipes: ItemCapacityRecipe[];
  items: GuildItemInventoryItem[];
}
export interface ItemInventoryTrendPoint {
  sampled_at: string;
  quantity: number;
  delta: number | null;
}
export interface ItemInventoryTrendResponse {
  item_id: string;
  base_id: string | null;
  bucket: "hour" | "day";
  from_at: string;
  to_at: string;
  points: ItemInventoryTrendPoint[];
}
