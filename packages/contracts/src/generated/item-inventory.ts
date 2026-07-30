/* Generated from item-inventory.schema.json. Do not edit directly. */

export interface ItemInventoryContractsContracts {
  ItemInventoryBaseTotal: ItemInventoryBaseTotal;
  ItemRecipeIngredientView: ItemRecipeIngredientView;
  ItemRecipeView: ItemRecipeView;
  ItemRecipePlanStep: ItemRecipePlanStep;
  ItemRecipeLimitingMaterial: ItemRecipeLimitingMaterial;
  ItemRecipeCapacity: ItemRecipeCapacity;
  PublishedItemRecipeCapacity: PublishedItemRecipeCapacity;
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
export interface GuildItemInventoryItem {
  item_id: string;
  name: string;
  type_a: string;
  type_b: string;
  quantity: number;
  bases: ItemInventoryBaseTotal[];
  recipes: ItemRecipeView[];
  capacity: ItemRecipeCapacity | null;
}
export interface GuildItemInventoryResponse {
  status: "available" | "partial" | "unavailable";
  snapshot_id: string | null;
  captured_at: string | null;
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
