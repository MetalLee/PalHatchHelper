import hashlib
import json
import os
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

import pytest

from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine
from pal_hatch_helper.breeding.index import BreedingRecipeIndex, EffectiveBreedingRecipe
from pal_hatch_helper.game_catalog.artifacts import (
    FULL_CATALOG_SIDECAR_FILENAMES,
    create_catalog_bundle,
    extract_catalog_bundle_atomic,
)
from pal_hatch_helper.game_catalog.validation import load_catalog_directory
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.normalization.stable_id import normalize_palworld_stable_id
from tests.breeding.factories import inventory_pal, limits, request, runtime_facts

EXPECTED_CONTENT_HASH = "872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3"
EXPECTED_COUNTS = {
    "pals": 288,
    "passive_skills": 115,
    "active_skills": 227,
    "pal_active_skills": 2200,
    "partner_skills": 287,
    "breeding_recipes": 41617,
    "localizations": 6234,
}
EXPECTED_EXCLUSIONS = {
    ("active_skills", "ACTIVE_SKILL_DISABLED"): 9,
    ("active_skills", "ACTIVE_SKILL_NOT_CATALOG_VISIBLE"): 118,
    ("active_skills", "ACTIVE_SKILL_UNREFERENCED"): 30,
    ("breeding_recipes", "SPECIAL_COMBINATION_NOT_RELEASED"): 73,
    ("pal_active_skills", "PAL_ACTIVE_PAL_NOT_RELEASED"): 3396,
    ("pal_active_skills", "PAL_ACTIVE_SKILL_NOT_CATALOG_VISIBLE"): 176,
    ("pals", "BOSS_VARIANT"): 412,
    ("pals", "GYM_VARIANT"): 1,
    ("pals", "OILRIG_VARIANT"): 6,
    ("pals", "PALDEX_NOT_RELEASED"): 12,
    ("pals", "PAL_CONFIGURATION_INCOMPLETE"): 1,
    ("pals", "PAL_ICON_MISSING"): 23,
    ("pals", "POLICE_VARIANT"): 2,
    ("pals", "QUEST_VARIANT"): 5,
    ("pals", "SUMMON_VARIANT"): 3,
    ("partner_skills", "PARTNER_SKILL_NOT_DEFINED"): 1,
    ("passive_skills", "PASSIVE_NOT_DISPLAYABLE"): 1790,
}
T = TypeVar("T")


def _catalog_directory() -> Path:
    configured = os.environ.get("PALHATCH_REAL_CATALOG_DIR")
    if configured is None:
        pytest.skip("PALHATCH_REAL_CATALOG_DIR is required for private catalog acceptance")
    return Path(configured)


def _evidence() -> dict[str, object]:
    return json.loads((_catalog_directory() / "source-evidence.json").read_text())


def _sample(values: list[T], *, key: Callable[[T], str], size: int) -> list[T]:
    return sorted(
        values,
        key=lambda value: hashlib.sha256(
            f"phase4-build-24181105|{key(value)}".encode()
        ).hexdigest(),
    )[:size]


def _actual_gender(required: str, fallback: str) -> str:
    return fallback if required == "any" else required


def test_real_catalog_integrity_and_audit_arithmetic() -> None:
    catalog = load_catalog_directory(_catalog_directory())
    manifest = catalog.manifest
    provenance = manifest.source_provenance
    evidence = _evidence()
    excluded = evidence["excluded_records"]

    assert manifest.content_hash == EXPECTED_CONTENT_HASH
    assert manifest.counts.model_dump() == EXPECTED_COUNTS
    assert manifest.schema_version == "1.1.0"
    assert manifest.package_hash == (
        "ed7d9aefb8cae7f4e29810bc7bcd5155f0dec147ac25527eb24a10a30f6b182a"
    )
    assert provenance is not None
    assert provenance.source_client_app_id == "1623730"
    assert provenance.source_client_build_id == "24181527"
    assert provenance.target_server_app_id == "2394010"
    assert provenance.target_server_build_id == "24181105"
    assert provenance.source_client_game_version == provenance.target_server_game_version
    assert provenance.compatibility_status == "exact_game_version_match"
    assert provenance.mappings_usmap_sha256 == (
        "561ef13c8ee3cf785e4de8aa5bc9b3ad1646e416d895f1d1166fa27ebdfd26b0"
    )
    assert provenance.extractor_repository_commit == ("705f9144a0f1c8891a3129e7db1db597ab97a109")
    assert provenance.upstream_reference_commit == ("b822c7fda4f019bd7c57f45437f14a74061a29bc")

    assert isinstance(excluded, list)
    breakdown = Counter((str(item["category"]), str(item["reason_code"])) for item in excluded)
    assert breakdown == EXPECTED_EXCLUSIONS
    assert sum(breakdown.values()) == 6058
    assert evidence["unresolved_records"] == []
    assert evidence["warnings"] == []

    pal_ids = {pal.pal_id for pal in catalog.pals}
    partner_pal_ids = {skill.pal_id for skill in catalog.partner_skills}
    assert pal_ids - partner_pal_ids == {"plantslime_flower"}
    explicit_absences = [
        item
        for item in excluded
        if item["category"] == "partner_skills"
        and item["reason_code"] == "PARTNER_SKILL_NOT_DEFINED"
    ]
    assert explicit_absences == [
        {
            "category": "partner_skills",
            "reason_code": "PARTNER_SKILL_NOT_DEFINED",
            "source_internal_name": "PlantSlime_Flower",
        }
    ]
    assert len(catalog.partner_skills) + len(explicit_absences) == len(catalog.pals)

    passive_excluded = breakdown[("passive_skills", "PASSIVE_NOT_DISPLAYABLE")]
    assert len(catalog.passive_skills) + passive_excluded == 1905
    assert len(catalog.passive_skills) == 115
    assert passive_excluded == 1790

    for record in (*catalog.pals, *catalog.passive_skills, *catalog.active_skills):
        source_name = record.metadata["source_internal_name"]
        stable_id = getattr(
            record,
            "pal_id"
            if hasattr(record, "pal_id")
            else ("passive_skill_id" if hasattr(record, "passive_skill_id") else "active_skill_id"),
        )
        assert normalize_palworld_stable_id(str(source_name)) == stable_id


def test_real_catalog_fixed_seed_samples_and_route_smoke() -> None:
    catalog = load_catalog_directory(_catalog_directory())
    pals = list(catalog.pals)
    passives = list(catalog.passive_skills)
    active = list(catalog.active_skills)
    relations = list(catalog.pal_active_skills)
    partners = list(catalog.partner_skills)
    normal_recipes = [item for item in catalog.breeding_recipes if item.recipe_type == "normal"]
    special_recipes = [item for item in catalog.breeding_recipes if item.recipe_type == "special"]

    sampled_pals = _sample(pals, key=lambda item: item.pal_id, size=30)
    sampled_passives = _sample(passives, key=lambda item: item.passive_skill_id, size=30)
    sampled_active = _sample(active, key=lambda item: item.active_skill_id, size=30)
    sampled_relations = _sample(
        relations,
        key=lambda item: f"{item.pal_id}|{item.active_skill_id}|{item.learn_level}",
        size=30,
    )
    sampled_partners = _sample(partners, key=lambda item: item.partner_skill_id, size=30)
    sampled_normal = _sample(
        normal_recipes,
        key=lambda item: (
            f"{item.parent_a_pal_id}|{item.parent_a_gender}|"
            f"{item.parent_b_pal_id}|{item.parent_b_gender}|{item.child_pal_id}"
        ),
        size=30,
    )
    assert all(
        len(values) == 30
        for values in (
            sampled_pals,
            sampled_passives,
            sampled_active,
            sampled_relations,
            sampled_partners,
            sampled_normal,
        )
    )

    pal_ids = {item.pal_id for item in pals}
    passive_ids = {item.passive_skill_id for item in passives}
    active_ids = {item.active_skill_id for item in active}
    localizations = {(item.locale, item.text_key): item.text for item in catalog.localizations}
    assert all(item.element_types for item in sampled_pals)
    assert all(item.pal_id in pal_ids and item.active_skill_id in active_ids for item in relations)
    assert all(item.pal_id in pal_ids for item in partners)
    assert all(
        item.parent_a_pal_id in pal_ids
        and item.parent_b_pal_id in pal_ids
        and item.child_pal_id in pal_ids
        for item in catalog.breeding_recipes
    )
    for item in (*sampled_pals, *sampled_passives, *sampled_active, *sampled_partners):
        assert ("en-US", item.name_key) in localizations
        assert ("zh-CN", item.name_key) in localizations
    assert passive_ids

    index = BreedingRecipeIndex.build(catalog.breeding_recipes)
    assert special_recipes
    for special in special_recipes:
        for gender_a, gender_b in (("female", "male"), ("male", "female")):
            if special.parent_a_gender not in ("any", gender_a):
                continue
            if special.parent_b_gender not in ("any", gender_b):
                continue
            resolved = index.resolve(
                special.parent_a_pal_id,
                special.parent_b_pal_id,
                gender_a,
                gender_b,
            )
            assert resolved is not None
            assert resolved.recipe_type == "special"

    smoke_recipes: list[EffectiveBreedingRecipe] = []
    seen_targets: set[str] = set()
    candidates = _sample(
        [
            item
            for item in index.recipes
            if item.child_pal_id not in {item.parent_a_pal_id, item.parent_b_pal_id}
        ],
        key=lambda item: item.signature,
        size=index.effective_recipe_count,
    )
    for item in candidates:
        if item.child_pal_id in seen_targets:
            continue
        smoke_recipes.append(item)
        seen_targets.add(item.child_pal_id)
        if len(smoke_recipes) == 10:
            break
    assert len(smoke_recipes) == 10

    engine = DeterministicBreedingEngine()
    digests: dict[str, str] = {}
    for position, recipe_value in enumerate(smoke_recipes):
        gender_a = _actual_gender(recipe_value.parent_a_gender, "male")
        gender_b = _actual_gender(recipe_value.parent_b_gender, "female")
        inventory = (
            inventory_pal(f"smoke-{position:02d}-a", recipe_value.parent_a_pal_id, gender_a),
            inventory_pal(f"smoke-{position:02d}-b", recipe_value.parent_b_pal_id, gender_b),
        )
        request_value = request(
            recipe_value.child_pal_id,
            inventory,
            search_limits=limits(max_generations=1, timeout_ms=30_000),
        ).model_copy(update={"game_data_content_hash": EXPECTED_CONTENT_HASH})
        facts = runtime_facts(request_value, catalog.breeding_recipes)
        first = engine.search(request_value, facts)
        second = engine.search(request_value, facts)
        assert first.routes
        assert first.result_digest == second.result_digest
        assert first.model_dump_json() == second.model_dump_json()
        assert first.routes[0].steps[-1].child_pal_id == recipe_value.child_pal_id
        swapped = index.resolve(
            recipe_value.parent_b_pal_id,
            recipe_value.parent_a_pal_id,
            gender_b,
            gender_a,
        )
        assert swapped is not None
        assert swapped.child_pal_id == recipe_value.child_pal_id
        assert swapped.recipe_type == recipe_value.recipe_type
        digests[recipe_value.child_pal_id] = first.result_digest

    mismatch_recipe = smoke_recipes[0]
    valid_request = request(
        mismatch_recipe.child_pal_id,
        (
            inventory_pal(
                "mismatch-a",
                mismatch_recipe.parent_a_pal_id,
                _actual_gender(mismatch_recipe.parent_a_gender, "male"),
            ),
            inventory_pal(
                "mismatch-b",
                mismatch_recipe.parent_b_pal_id,
                _actual_gender(mismatch_recipe.parent_b_gender, "female"),
            ),
        ),
        search_limits=limits(max_generations=1),
    ).model_copy(update={"game_data_content_hash": EXPECTED_CONTENT_HASH})
    mismatched_request = valid_request.model_copy(update={"game_data_content_hash": "0" * 64})
    with pytest.raises(StructuredError) as caught:
        engine.search(mismatched_request, runtime_facts(valid_request, catalog.breeding_recipes))
    assert caught.value.code is ErrorCode.BREEDING_GAME_DATA_CONTENT_MISMATCH

    acceptance_digest = hashlib.sha256(
        json.dumps(digests, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    print(
        json.dumps(
            {
                "acceptance_digest": acceptance_digest,
                "special_recipe_count": len(special_recipes),
                "targets": digests,
            },
            sort_keys=True,
        )
    )


def test_real_catalog_private_bundle_is_reproducible(tmp_path: Path) -> None:
    directory = _catalog_directory()
    first = create_catalog_bundle(directory)
    second = create_catalog_bundle(directory)

    assert first == second
    destination = tmp_path / "real-catalog"
    extract_catalog_bundle_atomic(first, destination)
    assert load_catalog_directory(destination).content_hash == EXPECTED_CONTENT_HASH
    assert all((destination / filename).is_file() for filename in FULL_CATALOG_SIDECAR_FILENAMES)
