from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from pal_hatch_helper.generated import CatalogBreedingRecipe
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

RecipeType = Literal["normal", "special"]
ParentGender = Literal["any", "female", "male"]
ConcreteGender = Literal["female", "male"]


@dataclass(frozen=True, slots=True)
class EffectiveBreedingRecipe:
    parent_a_pal_id: str
    parent_a_gender: ParentGender
    parent_b_pal_id: str
    parent_b_gender: ParentGender
    child_pal_id: str
    recipe_type: RecipeType

    @property
    def parent_pair(self) -> tuple[str, str]:
        return self.parent_a_pal_id, self.parent_b_pal_id

    @property
    def signature(self) -> str:
        return (
            f"{self.recipe_type}:{self.parent_a_pal_id}:{self.parent_a_gender}+"
            f"{self.parent_b_pal_id}:{self.parent_b_gender}>{self.child_pal_id}"
        )


class BreedingRecipeIndex:
    def __init__(self, recipes: tuple[EffectiveBreedingRecipe, ...]) -> None:
        self._recipes = recipes
        by_pair: dict[tuple[str, str], list[EffectiveBreedingRecipe]] = defaultdict(list)
        by_child: dict[str, list[EffectiveBreedingRecipe]] = defaultdict(list)
        graph_pals: set[str] = set()
        for recipe in recipes:
            by_pair[recipe.parent_pair].append(recipe)
            by_child[recipe.child_pal_id].append(recipe)
            graph_pals.update((recipe.parent_a_pal_id, recipe.parent_b_pal_id, recipe.child_pal_id))
        self._by_pair = {
            pair: tuple(sorted(values, key=_recipe_sort_key)) for pair, values in by_pair.items()
        }
        self._by_child = {
            child: tuple(sorted(values, key=_recipe_sort_key)) for child, values in by_child.items()
        }
        self._graph_pals = frozenset(graph_pals)

    @classmethod
    def build(cls, recipes: Iterable[CatalogBreedingRecipe]) -> "BreedingRecipeIndex":
        grouped: dict[
            tuple[str, str],
            list[tuple[ParentGender, ParentGender, RecipeType, str]],
        ] = defaultdict(list)
        for recipe in recipes:
            parent_a = recipe.parent_a_pal_id
            parent_b = recipe.parent_b_pal_id
            parent_a_gender: ParentGender = recipe.parent_a_gender
            parent_b_gender: ParentGender = recipe.parent_b_gender
            if parent_a > parent_b:
                parent_a, parent_b = parent_b, parent_a
                parent_a_gender, parent_b_gender = parent_b_gender, parent_a_gender
            recipe_type: RecipeType = recipe.recipe_type
            grouped[(parent_a, parent_b)].append(
                (parent_a_gender, parent_b_gender, recipe_type, recipe.child_pal_id)
            )

        effective: list[EffectiveBreedingRecipe] = []
        for (parent_a, parent_b), candidates in sorted(grouped.items()):
            outcomes: dict[tuple[ConcreteGender, ConcreteGender], tuple[RecipeType, str]] = {}
            for orientation in (("female", "male"), ("male", "female")):
                matching = [
                    candidate
                    for candidate in candidates
                    if _gender_matches(candidate[0], orientation[0])
                    and _gender_matches(candidate[1], orientation[1])
                ]
                selected_type: RecipeType = (
                    "special" if any(item[2] == "special" for item in matching) else "normal"
                )
                children = {item[3] for item in matching if item[2] == selected_type}
                if len(children) > 1:
                    raise StructuredError(
                        code=ErrorCode.BREEDING_RECIPE_CONFLICT,
                        summary=(
                            "The fixed breeding version contains conflicting recipes for "
                            "a normalized parent pair and gender orientation."
                        ),
                        retryable=False,
                    )
                if children:
                    outcomes[orientation] = (selected_type, next(iter(children)))

            unique_outcomes = set(outcomes.values())
            if len(outcomes) == 2 and len(unique_outcomes) == 1:
                recipe_type, child_pal_id = next(iter(unique_outcomes))
                effective.append(
                    EffectiveBreedingRecipe(
                        parent_a_pal_id=parent_a,
                        parent_a_gender="any",
                        parent_b_pal_id=parent_b,
                        parent_b_gender="any",
                        child_pal_id=child_pal_id,
                        recipe_type=recipe_type,
                    )
                )
                continue
            for (parent_a_gender, parent_b_gender), (
                recipe_type,
                child_pal_id,
            ) in sorted(outcomes.items()):
                effective.append(
                    EffectiveBreedingRecipe(
                        parent_a_pal_id=parent_a,
                        parent_a_gender=parent_a_gender,
                        parent_b_pal_id=parent_b,
                        parent_b_gender=parent_b_gender,
                        child_pal_id=child_pal_id,
                        recipe_type=recipe_type,
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

    def resolve(
        self,
        parent_a_pal_id: str,
        parent_b_pal_id: str,
        parent_a_gender: ConcreteGender | None = None,
        parent_b_gender: ConcreteGender | None = None,
    ) -> EffectiveBreedingRecipe | None:
        if parent_a_pal_id <= parent_b_pal_id:
            parent_a, parent_b = parent_a_pal_id, parent_b_pal_id
        else:
            parent_a, parent_b = parent_b_pal_id, parent_a_pal_id
            parent_a_gender, parent_b_gender = parent_b_gender, parent_a_gender
        matches = self._by_pair.get((parent_a, parent_b), ())
        if parent_a_gender is None or parent_b_gender is None:
            return matches[0] if len(matches) == 1 else None
        return next(
            (
                recipe
                for recipe in matches
                if _gender_matches(recipe.parent_a_gender, parent_a_gender)
                and _gender_matches(recipe.parent_b_gender, parent_b_gender)
            ),
            None,
        )

    def recipes_for_child(self, child_pal_id: str) -> tuple[EffectiveBreedingRecipe, ...]:
        return self._by_child.get(child_pal_id, ())


def _gender_matches(required: ParentGender, actual: ConcreteGender) -> bool:
    return required == "any" or required == actual


def _recipe_sort_key(recipe: EffectiveBreedingRecipe) -> tuple[str, str, str, str, str, str]:
    return (
        recipe.child_pal_id,
        recipe.parent_a_pal_id,
        recipe.parent_a_gender,
        recipe.parent_b_pal_id,
        recipe.parent_b_gender,
        recipe.recipe_type,
    )
