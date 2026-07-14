from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from pal_hatch_helper.generated import CatalogBreedingRecipe
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

RecipeType = Literal["normal", "special"]


@dataclass(frozen=True, slots=True)
class EffectiveBreedingRecipe:
    parent_a_pal_id: str
    parent_b_pal_id: str
    child_pal_id: str
    recipe_type: RecipeType

    @property
    def parent_pair(self) -> tuple[str, str]:
        return self.parent_a_pal_id, self.parent_b_pal_id

    @property
    def signature(self) -> str:
        return (
            f"{self.recipe_type}:{self.parent_a_pal_id}+{self.parent_b_pal_id}>{self.child_pal_id}"
        )


class BreedingRecipeIndex:
    def __init__(self, recipes: tuple[EffectiveBreedingRecipe, ...]) -> None:
        self._recipes = recipes
        self._by_pair = {recipe.parent_pair: recipe for recipe in recipes}
        by_child: dict[str, list[EffectiveBreedingRecipe]] = defaultdict(list)
        graph_pals: set[str] = set()
        for recipe in recipes:
            by_child[recipe.child_pal_id].append(recipe)
            graph_pals.update((recipe.parent_a_pal_id, recipe.parent_b_pal_id, recipe.child_pal_id))
        self._by_child = {
            child: tuple(sorted(values, key=_recipe_sort_key)) for child, values in by_child.items()
        }
        self._graph_pals = frozenset(graph_pals)

    @classmethod
    def build(cls, recipes: Iterable[CatalogBreedingRecipe]) -> "BreedingRecipeIndex":
        grouped: dict[tuple[str, str], dict[RecipeType, set[str]]] = defaultdict(
            lambda: {"normal": set(), "special": set()}
        )
        for recipe in recipes:
            parent_a, parent_b = sorted((recipe.parent_a_pal_id, recipe.parent_b_pal_id))
            recipe_type: RecipeType = recipe.recipe_type
            grouped[(parent_a, parent_b)][recipe_type].add(recipe.child_pal_id)

        effective: list[EffectiveBreedingRecipe] = []
        for (parent_a, parent_b), typed_children in sorted(grouped.items()):
            for recipe_type in ("special", "normal"):
                children = typed_children[recipe_type]
                if len(children) > 1:
                    raise StructuredError(
                        code=ErrorCode.BREEDING_RECIPE_CONFLICT,
                        summary=(
                            "The fixed breeding version contains conflicting recipes for "
                            "a normalized parent pair."
                        ),
                        retryable=False,
                    )
            selected_type: RecipeType = "special" if typed_children["special"] else "normal"
            selected_children = typed_children[selected_type]
            if not selected_children:
                continue
            effective.append(
                EffectiveBreedingRecipe(
                    parent_a_pal_id=parent_a,
                    parent_b_pal_id=parent_b,
                    child_pal_id=next(iter(selected_children)),
                    recipe_type=selected_type,
                )
            )
        return cls(tuple(sorted(effective, key=_recipe_sort_key)))

    @property
    def recipes(self) -> tuple[EffectiveBreedingRecipe, ...]:
        return self._recipes

    @property
    def effective_recipe_count(self) -> int:
        return len(self._recipes)

    @property
    def graph_pals(self) -> frozenset[str]:
        return self._graph_pals

    def resolve(self, parent_a_pal_id: str, parent_b_pal_id: str) -> EffectiveBreedingRecipe | None:
        parent_a, parent_b = sorted((parent_a_pal_id, parent_b_pal_id))
        return self._by_pair.get((parent_a, parent_b))

    def recipes_for_child(self, child_pal_id: str) -> tuple[EffectiveBreedingRecipe, ...]:
        return self._by_child.get(child_pal_id, ())


def _recipe_sort_key(recipe: EffectiveBreedingRecipe) -> tuple[str, str, str, str]:
    return (
        recipe.child_pal_id,
        recipe.parent_a_pal_id,
        recipe.parent_b_pal_id,
        recipe.recipe_type,
    )
