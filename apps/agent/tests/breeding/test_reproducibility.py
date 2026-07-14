import pytest

from pal_hatch_helper.breeding.engine import (
    ALGORITHM_VERSION,
    DeterministicBreedingEngine,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

from .factories import inventory_pal, recipe, request, search


def test_same_fixed_input_and_versions_are_byte_reproducible_regardless_of_input_order() -> None:
    inventory = (
        inventory_pal("a-m", "pal-a", "male", passives=("p1",)),
        inventory_pal("b-f", "pal-b", "female", passives=("p2",)),
        inventory_pal("c-m", "pal-c", "male", passives=("p3",)),
    )
    recipes = (
        recipe("pal-a", "pal-b", "pal-mid"),
        recipe("pal-c", "pal-mid", "pal-target"),
    )
    canonical_request = request(
        "pal-target",
        inventory,
        desired_passive_ids=("p1", "p2", "p3"),
    )
    shuffled_request = canonical_request.model_copy(update={"inventory": list(reversed(inventory))})
    engine = DeterministicBreedingEngine()

    first = search(engine, canonical_request, recipes)
    second = search(engine, shuffled_request, tuple(reversed(recipes)))

    assert first.model_dump_json() == second.model_dump_json()
    assert first.result_digest == second.result_digest


@pytest.mark.parametrize(
    ("algorithm_version", "scoring_profile_version", "expected_code"),
    [
        (
            "unknown-algorithm",
            None,
            ErrorCode.BREEDING_ALGORITHM_VERSION_UNSUPPORTED,
        ),
        (
            ALGORITHM_VERSION,
            "unknown-scoring-profile",
            ErrorCode.BREEDING_SCORING_PROFILE_UNSUPPORTED,
        ),
    ],
)
def test_unknown_fixed_versions_do_not_fall_back(
    algorithm_version: str,
    scoring_profile_version: str | None,
    expected_code: ErrorCode,
) -> None:
    engine_request = request(
        "pal-target",
        (
            inventory_pal("a-m", "pal-a", "male"),
            inventory_pal("b-f", "pal-b", "female"),
        ),
        algorithm_version=algorithm_version,
        scoring_profile_version=scoring_profile_version,
    )

    with pytest.raises(StructuredError) as raised:
        search(
            DeterministicBreedingEngine(),
            engine_request,
            (recipe("pal-a", "pal-b", "pal-target"),),
        )

    assert raised.value.code is expected_code
