from uuid import UUID

import pytest

from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine
from pal_hatch_helper.breeding.facts import (
    BreedingRuntimeFacts,
    FixedInventorySnapshot,
    VersionedBreedingCatalog,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

from .factories import GAME_DATA_VERSION_ID, inventory_pal, recipe, request


def _facts(request_value, recipes, *, version_id=GAME_DATA_VERSION_ID, status="published"):
    pal_ids = {request_value.target_pal_id}
    for item in request_value.inventory:
        pal_ids.add(item.pal_id)
    for item in recipes:
        pal_ids.update((item.parent_a_pal_id, item.parent_b_pal_id, item.child_pal_id))
    return BreedingRuntimeFacts(
        catalog=VersionedBreedingCatalog(
            version_id=version_id,
            content_hash=request_value.game_data_content_hash,
            status=status,
            pal_ids=frozenset(pal_ids),
            passive_skill_ids=frozenset(request_value.desired_passive_ids),
            recipes=tuple(recipes),
        ),
        inventory=FixedInventorySnapshot(
            snapshot_id=request_value.inventory_snapshot_id,
            world_id=request_value.world_id,
            items=tuple(request_value.inventory),
        ),
    )


def test_engine_rejects_catalog_from_a_different_exact_version() -> None:
    request_value = request(
        "pal-target",
        (
            inventory_pal("a-m", "pal-a", "male"),
            inventory_pal("b-f", "pal-b", "female"),
        ),
    )
    recipes = (recipe("pal-a", "pal-b", "pal-target"),)

    with pytest.raises(StructuredError) as caught:
        DeterministicBreedingEngine().search(
            request_value,
            _facts(
                request_value,
                recipes,
                version_id=UUID("20000000-0000-4000-8000-000000000002"),
            ),
        )

    assert caught.value.code is ErrorCode.BREEDING_GAME_DATA_VERSION_MISMATCH


def test_engine_rejects_unpublished_catalog_and_mismatched_inventory_snapshot() -> None:
    request_value = request(
        "pal-target",
        (
            inventory_pal("a-m", "pal-a", "male"),
            inventory_pal("b-f", "pal-b", "female"),
        ),
    )
    recipes = (recipe("pal-a", "pal-b", "pal-target"),)

    with pytest.raises(StructuredError) as unpublished:
        DeterministicBreedingEngine().search(
            request_value,
            _facts(request_value, recipes, status="staging"),
        )
    assert unpublished.value.code is ErrorCode.BREEDING_GAME_DATA_NOT_PUBLISHED

    valid_facts = _facts(request_value, recipes)
    mismatched = BreedingRuntimeFacts(
        catalog=valid_facts.catalog,
        inventory=FixedInventorySnapshot(
            snapshot_id=UUID("10000000-0000-4000-8000-000000000002"),
            world_id=valid_facts.inventory.world_id,
            items=valid_facts.inventory.items,
        ),
    )
    with pytest.raises(StructuredError) as snapshot:
        DeterministicBreedingEngine().search(request_value, mismatched)
    assert snapshot.value.code is ErrorCode.BREEDING_INVENTORY_SNAPSHOT_MISMATCH


def test_engine_rejects_catalog_content_hash_drift() -> None:
    request_value = request("pal-target", (inventory_pal("target", "pal-target", "male"),))
    facts = _facts(request_value, ())
    mismatched = BreedingRuntimeFacts(
        catalog=VersionedBreedingCatalog(
            version_id=facts.catalog.version_id,
            content_hash="b" * 64,
            status="published",
            pal_ids=facts.catalog.pal_ids,
            passive_skill_ids=facts.catalog.passive_skill_ids,
            recipes=facts.catalog.recipes,
        ),
        inventory=facts.inventory,
    )

    with pytest.raises(StructuredError) as caught:
        DeterministicBreedingEngine().search(request_value, mismatched)

    assert caught.value.code is ErrorCode.BREEDING_GAME_DATA_CONTENT_MISMATCH
