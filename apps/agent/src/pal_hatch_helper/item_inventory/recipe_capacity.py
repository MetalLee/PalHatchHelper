from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from math import ceil
from typing import Literal

from pal_hatch_helper.generated import (
    CanonicalBase,
    CanonicalItemStack,
    ItemRecipeLimitingMaterial,
    ItemRecipePlanStep,
    PublishedItemRecipeCapacity,
)

CraftKind = Literal["handcraft", "cooking", "other"]
CapacityStatus = Literal[
    "ready",
    "no_supported_recipe",
    "recipe_cycle",
    "complexity_limit",
]


@dataclass(frozen=True, slots=True)
class IngredientFact:
    slot: int
    item_id: str
    count: int


@dataclass(frozen=True, slots=True)
class RecipeFact:
    recipe_id: str
    product_item_id: str
    product_count: int
    ingredients: tuple[IngredientFact, ...]
    craft_kind: CraftKind
    deny_recipe_chain: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RecipePlanStep:
    recipe_id: str
    product_item_id: str
    batches: int
    produced: int


@dataclass(frozen=True, slots=True)
class RecipeAlternative:
    recipe_id: str
    craftable_additional: int
    recipe_plan: tuple[RecipePlanStep, ...]
    limiting_materials: dict[str, int]
    status: CapacityStatus


@dataclass(frozen=True, slots=True)
class RecipeCapacityResult:
    item_id: str
    on_hand: int
    craftable_additional: int
    obtainable_total: int
    selected_recipe_id: str | None
    recipe_plan: tuple[RecipePlanStep, ...]
    limiting_materials: dict[str, int]
    alternatives: tuple[RecipeAlternative, ...]
    status: CapacityStatus


@dataclass(slots=True)
class _Ledger:
    quantities: dict[str, int]
    step_order: list[str]
    step_batches: dict[str, int]

    def clone(self) -> _Ledger:
        return _Ledger(
            quantities=dict(self.quantities),
            step_order=list(self.step_order),
            step_batches=dict(self.step_batches),
        )

    def replace(self, other: _Ledger) -> None:
        self.quantities = other.quantities
        self.step_order = other.step_order
        self.step_batches = other.step_batches


@dataclass(frozen=True, slots=True)
class _Failure:
    limiting: dict[str, int]
    status: CapacityStatus = "ready"


@dataclass(slots=True)
class _SearchBudget:
    remaining: int

    def consume(self) -> bool:
        self.remaining -= 1
        return self.remaining >= 0


class RecipeCapacityCalculator:
    """Compute exact recipe capacity without mutating the supplied inventory."""

    def __init__(
        self,
        recipes: list[RecipeFact] | tuple[RecipeFact, ...],
        *,
        maximum_search_nodes: int = 10_000,
        maximum_batches: int = 1_000_000,
    ) -> None:
        if maximum_search_nodes < 1 or maximum_batches < 1:
            raise ValueError("recipe capacity limits must be positive")
        supported = tuple(
            sorted(
                (recipe for recipe in recipes if recipe.craft_kind in {"handcraft", "cooking"}),
                key=lambda recipe: recipe.recipe_id,
            )
        )
        self._validate_recipes(supported)
        by_product: dict[str, list[RecipeFact]] = defaultdict(list)
        by_id: dict[str, RecipeFact] = {}
        for recipe in supported:
            by_product[recipe.product_item_id].append(recipe)
            by_id[recipe.recipe_id] = recipe
        self._recipes_by_product = {
            product: tuple(values) for product, values in by_product.items()
        }
        self._recipes_by_id = by_id
        self._maximum_search_nodes = maximum_search_nodes
        self._maximum_batches = maximum_batches

    @property
    def product_item_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._recipes_by_product))

    def calculate(
        self,
        item_id: str,
        inventory: dict[str, int],
    ) -> RecipeCapacityResult:
        normalized_inventory = {
            key: value
            for key, value in inventory.items()
            if isinstance(value, int) and not isinstance(value, bool) and value > 0
        }
        on_hand = normalized_inventory.get(item_id, 0)
        top_recipes = self._recipes_by_product.get(item_id, ())
        if not top_recipes:
            return RecipeCapacityResult(
                item_id=item_id,
                on_hand=on_hand,
                craftable_additional=0,
                obtainable_total=on_hand,
                selected_recipe_id=None,
                recipe_plan=(),
                limiting_materials={},
                alternatives=(),
                status="no_supported_recipe",
            )

        alternatives = tuple(
            sorted(
                (self._capacity_for_recipe(recipe, normalized_inventory) for recipe in top_recipes),
                key=lambda alternative: (
                    -alternative.craftable_additional,
                    alternative.recipe_id,
                ),
            )
        )
        selected = alternatives[0]
        return RecipeCapacityResult(
            item_id=item_id,
            on_hand=on_hand,
            craftable_additional=selected.craftable_additional,
            obtainable_total=on_hand + selected.craftable_additional,
            selected_recipe_id=selected.recipe_id,
            recipe_plan=selected.recipe_plan,
            limiting_materials=selected.limiting_materials,
            alternatives=alternatives,
            status=selected.status,
        )

    def _capacity_for_recipe(
        self,
        recipe: RecipeFact,
        inventory: dict[str, int],
    ) -> RecipeAlternative:
        low = 0
        high = 1
        last_success: _Ledger | None = None
        failure = _Failure({})
        while high <= self._maximum_batches:
            attempt, attempt_failure = self._attempt(recipe, high, inventory)
            if attempt is None:
                failure = attempt_failure
                break
            low = high
            last_success = attempt
            if high == self._maximum_batches:
                return RecipeAlternative(
                    recipe_id=recipe.recipe_id,
                    craftable_additional=0,
                    recipe_plan=(),
                    limiting_materials={},
                    status="complexity_limit",
                )
            high = min(high * 2, self._maximum_batches)

        while low + 1 < high:
            middle = (low + high) // 2
            attempt, attempt_failure = self._attempt(recipe, middle, inventory)
            if attempt is None:
                high = middle
                failure = attempt_failure
            else:
                low = middle
                last_success = attempt

        failed_next, failed_next_reason = self._attempt(recipe, low + 1, inventory)
        if failed_next is None:
            failure = failed_next_reason
        if low > 0:
            last_success, _ = self._attempt(recipe, low, inventory)
        status: CapacityStatus = "ready"
        if low == 0 and failure.status in {"recipe_cycle", "complexity_limit"}:
            status = failure.status
        return RecipeAlternative(
            recipe_id=recipe.recipe_id,
            craftable_additional=low * recipe.product_count,
            recipe_plan=self._plan(last_success),
            limiting_materials=dict(sorted(failure.limiting.items())),
            status=status,
        )

    def _attempt(
        self,
        recipe: RecipeFact,
        batches: int,
        inventory: dict[str, int],
    ) -> tuple[_Ledger | None, _Failure]:
        ledger = _Ledger(dict(inventory), [], {})
        failure = self._execute_recipe(
            recipe,
            batches,
            ledger,
            forbidden=frozenset(recipe.deny_recipe_chain),
            active_items=frozenset({recipe.product_item_id}),
            budget=_SearchBudget(self._maximum_search_nodes),
        )
        return (ledger, _Failure({})) if failure is None else (None, failure)

    def _execute_recipe(
        self,
        recipe: RecipeFact,
        batches: int,
        ledger: _Ledger,
        *,
        forbidden: frozenset[str],
        active_items: frozenset[str],
        budget: _SearchBudget,
    ) -> _Failure | None:
        if not budget.consume():
            return _Failure({}, "complexity_limit")
        candidate = ledger.clone()
        nested_forbidden = forbidden | frozenset(recipe.deny_recipe_chain)
        satisfied, failure = self._satisfy_ingredients(
            tuple(sorted(recipe.ingredients, key=lambda value: value.slot)),
            0,
            batches,
            candidate,
            forbidden=nested_forbidden,
            active_items=active_items,
            budget=budget,
        )
        if satisfied is None:
            return failure
        candidate = satisfied
        candidate.quantities[recipe.product_item_id] = (
            candidate.quantities.get(recipe.product_item_id, 0) + recipe.product_count * batches
        )
        if recipe.recipe_id not in candidate.step_batches:
            candidate.step_order.append(recipe.recipe_id)
            candidate.step_batches[recipe.recipe_id] = 0
        candidate.step_batches[recipe.recipe_id] += batches
        ledger.replace(candidate)
        return None

    def _satisfy_ingredients(
        self,
        ingredients: tuple[IngredientFact, ...],
        index: int,
        batches: int,
        ledger: _Ledger,
        *,
        forbidden: frozenset[str],
        active_items: frozenset[str],
        budget: _SearchBudget,
    ) -> tuple[_Ledger | None, _Failure]:
        if index == len(ingredients):
            return ledger, _Failure({})
        ingredient = ingredients[index]
        options, failures = self._obtain_options(
            ingredient.item_id,
            ingredient.count * batches,
            ledger,
            forbidden=forbidden,
            active_items=active_items,
            budget=budget,
        )
        for option in options:
            result, failure = self._satisfy_ingredients(
                ingredients,
                index + 1,
                batches,
                option,
                forbidden=forbidden,
                active_items=active_items,
                budget=budget,
            )
            if result is not None:
                return result, _Failure({})
            failures.append(failure)
        if not failures:
            return None, _Failure({}, "complexity_limit")
        return None, min(failures, key=self._failure_key)

    def _obtain_options(
        self,
        item_id: str,
        amount: int,
        ledger: _Ledger,
        *,
        forbidden: frozenset[str],
        active_items: frozenset[str],
        budget: _SearchBudget,
    ) -> tuple[list[_Ledger], list[_Failure]]:
        candidate = ledger.clone()
        available = candidate.quantities.get(item_id, 0)
        consumed = min(available, amount)
        if consumed:
            candidate.quantities[item_id] = available - consumed
        shortfall = amount - consumed
        if shortfall == 0:
            return [candidate], []
        if item_id in active_items:
            return [], [_Failure({item_id: shortfall}, "recipe_cycle")]

        recipes = self._recipes_by_product.get(item_id, ()) if item_id not in forbidden else ()
        if not recipes:
            return [], [_Failure({item_id: shortfall})]

        options: list[_Ledger] = []
        failures: list[_Failure] = []
        for recipe in recipes:
            branch = candidate.clone()
            batches = ceil(shortfall / recipe.product_count)
            failure = self._execute_recipe(
                recipe,
                batches,
                branch,
                forbidden=forbidden,
                active_items=active_items | frozenset({item_id}),
                budget=budget,
            )
            if failure is not None:
                failures.append(failure)
                continue
            produced = branch.quantities.get(item_id, 0)
            if produced < shortfall:
                failures.append(_Failure({item_id: shortfall - produced}))
                continue
            branch.quantities[item_id] = produced - shortfall
            options.append(branch)
        return options, failures

    def _plan(self, ledger: _Ledger | None) -> tuple[RecipePlanStep, ...]:
        if ledger is None:
            return ()
        return tuple(
            RecipePlanStep(
                recipe_id=recipe_id,
                product_item_id=self._recipes_by_id[recipe_id].product_item_id,
                batches=ledger.step_batches[recipe_id],
                produced=(
                    ledger.step_batches[recipe_id] * self._recipes_by_id[recipe_id].product_count
                ),
            )
            for recipe_id in ledger.step_order
        )

    @staticmethod
    def _failure_key(failure: _Failure) -> tuple[int, tuple[tuple[str, int], ...], str]:
        return (
            sum(failure.limiting.values()),
            tuple(sorted(failure.limiting.items())),
            failure.status,
        )

    @staticmethod
    def _validate_recipes(recipes: tuple[RecipeFact, ...]) -> None:
        seen: set[str] = set()
        for recipe in recipes:
            if recipe.recipe_id in seen:
                raise ValueError(f"duplicate recipe ID: {recipe.recipe_id}")
            seen.add(recipe.recipe_id)
            if recipe.product_count < 1 or not recipe.ingredients:
                raise ValueError(f"invalid recipe: {recipe.recipe_id}")
            slots: set[int] = set()
            for ingredient in recipe.ingredients:
                if ingredient.slot < 1 or ingredient.count < 1 or ingredient.slot in slots:
                    raise ValueError(f"invalid recipe ingredient: {recipe.recipe_id}")
                slots.add(ingredient.slot)


def capacities_for_snapshot(
    calculator: RecipeCapacityCalculator,
    bases: Sequence[CanonicalBase],
    stacks: Sequence[CanonicalItemStack],
    *,
    item_aliases: Mapping[str, str] | None = None,
) -> tuple[PublishedItemRecipeCapacity, ...]:
    """Calculate guild capacities only from audited, base-owned container stacks."""

    aliases = item_aliases or {}
    base_guilds = {base.base_id: base.guild_uid for base in bases if base.guild_uid is not None}
    inventories: dict[str, dict[str, int]] = {
        guild_uid: {} for guild_uid in sorted(set(base_guilds.values()))
    }
    allowed_container_types = {
        "storage_box",
        "refrigerator",
        "feed_box",
        "production_output",
    }
    for stack in stacks:
        if (
            stack.resolution_status != "resolved"
            or stack.container_type not in allowed_container_types
            or stack.base_id is None
            or stack.guild_uid is None
            or base_guilds.get(stack.base_id) != stack.guild_uid
        ):
            continue
        inventory = inventories.setdefault(stack.guild_uid, {})
        item_id = aliases.get(stack.item_id, stack.item_id)
        inventory[item_id] = inventory.get(item_id, 0) + stack.quantity

    capacities: list[PublishedItemRecipeCapacity] = []
    for guild_uid, inventory in sorted(inventories.items()):
        for item_id in calculator.product_item_ids:
            result = calculator.calculate(item_id, inventory)
            capacities.append(
                PublishedItemRecipeCapacity(
                    guild_uid=guild_uid,
                    item_id=item_id,
                    on_hand=result.on_hand,
                    craftable_additional=result.craftable_additional,
                    obtainable_total=result.obtainable_total,
                    selected_recipe_id=result.selected_recipe_id,
                    status=result.status,
                    recipe_plan=[
                        ItemRecipePlanStep(
                            recipe_id=step.recipe_id,
                            product_item_id=step.product_item_id,
                            batches=step.batches,
                            produced=step.produced,
                        )
                        for step in result.recipe_plan
                    ],
                    limiting_materials=[
                        ItemRecipeLimitingMaterial(item_id=material_id, missing=missing)
                        for material_id, missing in sorted(result.limiting_materials.items())
                    ],
                )
            )
    return tuple(capacities)
