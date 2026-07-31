import type { ItemRecipeCapacity } from "@palhatch/contracts";

export interface ItemCapacityIngredient {
  slot: number;
  item_id: string;
  count: number;
}

export interface ItemCapacityRecipe {
  recipe_id: string;
  product_item_id: string;
  product_count: number;
  ingredients: ItemCapacityIngredient[];
  craft_kind: "handcraft" | "cooking" | "other";
  deny_recipe_chain: string[];
}

type CapacityStatus = ItemRecipeCapacity["status"];

interface RecipeAlternative {
  recipeId: string;
  craftableAdditional: number;
  recipePlan: ItemRecipeCapacity["recipe_plan"];
  limitingMaterials: ItemRecipeCapacity["limiting_materials"];
  status: CapacityStatus;
}

interface Failure {
  limiting: Map<string, number>;
  status: CapacityStatus;
}

interface SearchBudget {
  remaining: number;
}

class Ledger {
  constructor(
    readonly quantities: Map<string, number>,
    readonly stepOrder: string[] = [],
    readonly stepBatches: Map<string, number> = new Map(),
  ) {}

  clone(): Ledger {
    return new Ledger(
      new Map(this.quantities),
      [...this.stepOrder],
      new Map(this.stepBatches),
    );
  }

  replace(other: Ledger): void {
    this.quantities.clear();
    for (const [key, value] of other.quantities)
      this.quantities.set(key, value);
    this.stepOrder.splice(0, this.stepOrder.length, ...other.stepOrder);
    this.stepBatches.clear();
    for (const [key, value] of other.stepBatches)
      this.stepBatches.set(key, value);
  }
}

const emptyFailure = (): Failure => ({ limiting: new Map(), status: "ready" });

function safeMultiply(left: number, right: number): number {
  const value = left * right;
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}

function failureKey(value: Failure): [number, string, CapacityStatus] {
  const entries = [...value.limiting].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return [
    entries.reduce((sum, [, missing]) => sum + missing, 0),
    JSON.stringify(entries),
    value.status,
  ];
}

function compareFailures(left: Failure, right: Failure): number {
  const a = failureKey(left);
  const b = failureKey(right);
  return a[0] - b[0] || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]);
}

export class ItemCapacityCalculator {
  private readonly recipesByProduct = new Map<string, ItemCapacityRecipe[]>();
  private readonly recipesById = new Map<string, ItemCapacityRecipe>();

  constructor(
    recipes: readonly ItemCapacityRecipe[],
    private readonly maximumSearchNodes = 10_000,
    private readonly maximumBatches = 1_000_000,
  ) {
    if (maximumSearchNodes < 1 || maximumBatches < 1) {
      throw new Error("ITEM_CAPACITY_LIMIT_INVALID");
    }
    const supported = [...recipes]
      .filter(
        ({ craft_kind }) =>
          craft_kind === "handcraft" || craft_kind === "cooking",
      )
      .sort((left, right) => left.recipe_id.localeCompare(right.recipe_id));
    for (const recipe of supported) {
      this.validateRecipe(recipe);
      if (this.recipesById.has(recipe.recipe_id)) {
        throw new Error("ITEM_CAPACITY_RECIPE_DUPLICATE");
      }
      this.recipesById.set(recipe.recipe_id, recipe);
      const products = this.recipesByProduct.get(recipe.product_item_id) ?? [];
      products.push(recipe);
      this.recipesByProduct.set(recipe.product_item_id, products);
    }
  }

  get productItemIds(): string[] {
    return [...this.recipesByProduct.keys()].sort();
  }

  calculate(
    itemId: string,
    inventory: Readonly<Record<string, number>>,
  ): ItemRecipeCapacity {
    const quantities = new Map<string, number>();
    for (const [key, value] of Object.entries(inventory)) {
      if (Number.isSafeInteger(value) && value > 0) quantities.set(key, value);
    }
    const onHand = quantities.get(itemId) ?? 0;
    const topRecipes = this.recipesByProduct.get(itemId) ?? [];
    if (topRecipes.length === 0) {
      return {
        on_hand: onHand,
        craftable_additional: 0,
        obtainable_total: onHand,
        selected_recipe_id: null,
        status: "no_supported_recipe",
        recipe_plan: [],
        limiting_materials: [],
      };
    }

    const alternatives = topRecipes
      .map((recipe) => this.capacityForRecipe(recipe, quantities))
      .sort(
        (left, right) =>
          right.craftableAdditional - left.craftableAdditional ||
          left.recipeId.localeCompare(right.recipeId),
      );
    const selected = alternatives[0];
    if (selected === undefined) throw new Error("ITEM_CAPACITY_RECIPE_MISSING");
    return {
      on_hand: onHand,
      craftable_additional: selected.craftableAdditional,
      obtainable_total: safeAdd(onHand, selected.craftableAdditional),
      selected_recipe_id: selected.recipeId,
      status: selected.status,
      recipe_plan: selected.recipePlan,
      limiting_materials: selected.limitingMaterials,
    };
  }

  private capacityForRecipe(
    recipe: ItemCapacityRecipe,
    inventory: ReadonlyMap<string, number>,
  ): RecipeAlternative {
    let low = 0;
    let high = 1;
    let lastSuccess: Ledger | null = null;
    let failure = emptyFailure();
    while (high <= this.maximumBatches) {
      const attempt = this.attempt(recipe, high, inventory);
      if (attempt.ledger === null) {
        failure = attempt.failure;
        break;
      }
      low = high;
      lastSuccess = attempt.ledger;
      if (high === this.maximumBatches) {
        return {
          recipeId: recipe.recipe_id,
          craftableAdditional: 0,
          recipePlan: [],
          limitingMaterials: [],
          status: "complexity_limit",
        };
      }
      high = Math.min(high * 2, this.maximumBatches);
    }

    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      const attempt = this.attempt(recipe, middle, inventory);
      if (attempt.ledger === null) {
        high = middle;
        failure = attempt.failure;
      } else {
        low = middle;
        lastSuccess = attempt.ledger;
      }
    }
    const failedNext = this.attempt(recipe, low + 1, inventory);
    if (failedNext.ledger === null) failure = failedNext.failure;
    if (low > 0) lastSuccess = this.attempt(recipe, low, inventory).ledger;
    const status =
      low === 0 &&
      (failure.status === "recipe_cycle" ||
        failure.status === "complexity_limit")
        ? failure.status
        : "ready";
    return {
      recipeId: recipe.recipe_id,
      craftableAdditional: safeMultiply(low, recipe.product_count),
      recipePlan: this.plan(lastSuccess),
      limitingMaterials: [...failure.limiting]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([materialId, missing]) => ({ item_id: materialId, missing })),
      status,
    };
  }

  private attempt(
    recipe: ItemCapacityRecipe,
    batches: number,
    inventory: ReadonlyMap<string, number>,
  ): { ledger: Ledger | null; failure: Failure } {
    const ledger = new Ledger(new Map(inventory));
    const failure = this.executeRecipe(
      recipe,
      batches,
      ledger,
      new Set(recipe.deny_recipe_chain),
      new Set([recipe.product_item_id]),
      { remaining: this.maximumSearchNodes },
    );
    return failure === null
      ? { ledger, failure: emptyFailure() }
      : { ledger: null, failure };
  }

  private executeRecipe(
    recipe: ItemCapacityRecipe,
    batches: number,
    ledger: Ledger,
    forbidden: ReadonlySet<string>,
    activeItems: ReadonlySet<string>,
    budget: SearchBudget,
  ): Failure | null {
    budget.remaining -= 1;
    if (budget.remaining < 0)
      return { limiting: new Map(), status: "complexity_limit" };
    const candidate = ledger.clone();
    const nestedForbidden = new Set([
      ...forbidden,
      ...recipe.deny_recipe_chain,
    ]);
    const satisfied = this.satisfyIngredients(
      [...recipe.ingredients].sort((left, right) => left.slot - right.slot),
      0,
      batches,
      candidate,
      nestedForbidden,
      activeItems,
      budget,
    );
    if (satisfied.ledger === null) return satisfied.failure;
    const complete = satisfied.ledger;
    complete.quantities.set(
      recipe.product_item_id,
      (complete.quantities.get(recipe.product_item_id) ?? 0) +
        safeMultiply(recipe.product_count, batches),
    );
    if (!complete.stepBatches.has(recipe.recipe_id)) {
      complete.stepOrder.push(recipe.recipe_id);
      complete.stepBatches.set(recipe.recipe_id, 0);
    }
    complete.stepBatches.set(
      recipe.recipe_id,
      (complete.stepBatches.get(recipe.recipe_id) ?? 0) + batches,
    );
    ledger.replace(complete);
    return null;
  }

  private satisfyIngredients(
    ingredients: readonly ItemCapacityIngredient[],
    index: number,
    batches: number,
    ledger: Ledger,
    forbidden: ReadonlySet<string>,
    activeItems: ReadonlySet<string>,
    budget: SearchBudget,
  ): { ledger: Ledger | null; failure: Failure } {
    const ingredient = ingredients[index];
    if (ingredient === undefined) return { ledger, failure: emptyFailure() };
    const obtained = this.obtainOptions(
      ingredient.item_id,
      safeMultiply(ingredient.count, batches),
      ledger,
      forbidden,
      activeItems,
      budget,
    );
    const failures = [...obtained.failures];
    for (const option of obtained.options) {
      const result = this.satisfyIngredients(
        ingredients,
        index + 1,
        batches,
        option,
        forbidden,
        activeItems,
        budget,
      );
      if (result.ledger !== null) return result;
      failures.push(result.failure);
    }
    failures.sort(compareFailures);
    return {
      ledger: null,
      failure: failures[0] ?? {
        limiting: new Map(),
        status: "complexity_limit",
      },
    };
  }

  private obtainOptions(
    itemId: string,
    amount: number,
    ledger: Ledger,
    forbidden: ReadonlySet<string>,
    activeItems: ReadonlySet<string>,
    budget: SearchBudget,
  ): { options: Ledger[]; failures: Failure[] } {
    const candidate = ledger.clone();
    const available = candidate.quantities.get(itemId) ?? 0;
    const consumed = Math.min(available, amount);
    if (consumed > 0) candidate.quantities.set(itemId, available - consumed);
    const shortfall = amount - consumed;
    if (shortfall === 0) return { options: [candidate], failures: [] };
    if (activeItems.has(itemId)) {
      return {
        options: [],
        failures: [
          { limiting: new Map([[itemId, shortfall]]), status: "recipe_cycle" },
        ],
      };
    }
    const recipes = forbidden.has(itemId)
      ? []
      : (this.recipesByProduct.get(itemId) ?? []);
    if (recipes.length === 0) {
      return {
        options: [],
        failures: [
          { limiting: new Map([[itemId, shortfall]]), status: "ready" },
        ],
      };
    }
    const options: Ledger[] = [];
    const failures: Failure[] = [];
    for (const recipe of recipes) {
      const branch = candidate.clone();
      const failure = this.executeRecipe(
        recipe,
        Math.ceil(shortfall / recipe.product_count),
        branch,
        forbidden,
        new Set([...activeItems, itemId]),
        budget,
      );
      if (failure !== null) {
        failures.push(failure);
        continue;
      }
      const produced = branch.quantities.get(itemId) ?? 0;
      if (produced < shortfall) {
        failures.push({
          limiting: new Map([[itemId, shortfall - produced]]),
          status: "ready",
        });
        continue;
      }
      branch.quantities.set(itemId, produced - shortfall);
      options.push(branch);
    }
    return { options, failures };
  }

  private plan(ledger: Ledger | null): ItemRecipeCapacity["recipe_plan"] {
    if (ledger === null) return [];
    return ledger.stepOrder.map((recipeId) => {
      const recipe = this.recipesById.get(recipeId);
      if (recipe === undefined) throw new Error("ITEM_CAPACITY_RECIPE_MISSING");
      const batches = ledger.stepBatches.get(recipeId) ?? 0;
      return {
        recipe_id: recipeId,
        product_item_id: recipe.product_item_id,
        batches,
        produced: safeMultiply(batches, recipe.product_count),
      };
    });
  }

  private validateRecipe(recipe: ItemCapacityRecipe): void {
    if (
      !Number.isSafeInteger(recipe.product_count) ||
      recipe.product_count < 1 ||
      recipe.ingredients.length < 1
    ) {
      throw new Error("ITEM_CAPACITY_RECIPE_INVALID");
    }
    const slots = new Set<number>();
    for (const ingredient of recipe.ingredients) {
      if (
        !Number.isSafeInteger(ingredient.slot) ||
        ingredient.slot < 1 ||
        !Number.isSafeInteger(ingredient.count) ||
        ingredient.count < 1 ||
        slots.has(ingredient.slot)
      ) {
        throw new Error("ITEM_CAPACITY_RECIPE_INVALID");
      }
      slots.add(ingredient.slot);
    }
  }
}
