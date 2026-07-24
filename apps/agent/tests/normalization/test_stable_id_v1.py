import json
from pathlib import Path

import pytest

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.normalization.stable_id import (
    build_stable_id_map,
    normalize_palworld_stable_id,
    normalize_parser_snapshot_payload,
)
from pal_hatch_helper.repositories.database import JSONValue


def _golden_vectors() -> dict[str, object]:
    path = (
        Path(__file__).parents[4] / "packages" / "contracts" / "data" / "palworld-stable-id-v1.json"
    )
    value = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def test_python_matches_shared_stable_id_golden_vectors() -> None:
    vectors = _golden_vectors()["vectors"]
    assert isinstance(vectors, list)
    for vector in vectors:
        assert isinstance(vector, dict)
        assert normalize_palworld_stable_id(str(vector["source"])) == vector["stable_id"]


def test_python_rejects_invalid_stable_ids_without_slugging() -> None:
    vectors = _golden_vectors()["invalid_vectors"]
    assert isinstance(vectors, list)
    for vector in vectors:
        assert isinstance(vector, dict)
        with pytest.raises(StructuredError) as caught:
            normalize_palworld_stable_id(str(vector["source"]))
        assert caught.value.code is ErrorCode.GAME_ID_INVALID


def test_python_detects_normalization_collisions() -> None:
    vectors = _golden_vectors()["collision_vectors"]
    assert isinstance(vectors, list)
    for vector in vectors:
        assert isinstance(vector, dict)
        sources = vector["sources"]
        assert isinstance(sources, list)
        with pytest.raises(StructuredError) as caught:
            build_stable_id_map([str(source) for source in sources])
        assert caught.value.code is ErrorCode.GAME_ID_NORMALIZATION_COLLISION


def test_parser_boundary_normalizes_ids_and_preserves_filtered_source_metadata() -> None:
    payload: dict[str, JSONValue] = {
        "server": {
            "world_uid": "fixture-world-001",
            "save_version": "fixture-v1",
            "captured_at": "2026-07-14T03:00:00Z",
        },
        "guilds": [],
        "players": [],
        "pals": [
            {
                "instance_uid": "fixture-pal-instance-001",
                "owner_player_uid": None,
                "guild_uid": None,
                "pal_id": "PlantSlime_Flower",
                "is_boss": False,
                "gender": "unknown",
                "level": None,
                "passive_skill_ids": ["Artisan", "Swift.Runner"],
                "location_type": "unknown",
                "location_name": None,
                "location_id": None,
                "location_slot_index": None,
                "location_access_scope": "unresolved",
            }
        ],
    }

    normalized = normalize_parser_snapshot_payload(payload)

    assert normalized.pals[0].pal_id == "plantslime_flower"
    assert normalized.pals[0].passive_skill_ids == ["artisan", "swift.runner"]
    assert normalized.pals[0].metadata is not None
    assert normalized.pals[0].metadata.source_internal_name == "PlantSlime_Flower"
    assert normalized.pals[0].metadata.source_passive_skill_internal_names == [
        "Artisan",
        "Swift.Runner",
    ]


def test_parser_boundary_preserves_verified_pre_normalized_source_metadata() -> None:
    payload: dict[str, JSONValue] = {
        "server": {
            "world_uid": "fixture-world-001",
            "save_version": "PlM/0x31",
            "captured_at": "2026-07-18T16:00:00Z",
        },
        "guilds": [],
        "players": [],
        "pals": [
            {
                "instance_uid": "fixture-pal-instance-001",
                "owner_player_uid": None,
                "guild_uid": None,
                "pal_id": "plantslime_flower",
                "is_boss": False,
                "gender": "unknown",
                "level": None,
                "passive_skill_ids": ["artisan"],
                "location_type": "unknown",
                "location_name": None,
                "location_id": None,
                "location_slot_index": None,
                "location_access_scope": "unresolved",
                "metadata": {
                    "source_internal_name": "PlantSlime_Flower",
                    "source_passive_skill_internal_names": ["Artisan"],
                },
            }
        ],
    }

    normalized = normalize_parser_snapshot_payload(payload)

    assert normalized.pals[0].pal_id == "plantslime_flower"
    assert normalized.pals[0].passive_skill_ids == ["artisan"]
    assert normalized.pals[0].metadata is not None
    assert normalized.pals[0].metadata.source_internal_name == "PlantSlime_Flower"
    assert normalized.pals[0].metadata.source_passive_skill_internal_names == ["Artisan"]


def test_boss_inventory_prefix_maps_to_base_pal_and_preserves_source_name() -> None:
    payload: dict[str, JSONValue] = {
        "server": {
            "world_uid": "fixture-world-001",
            "save_version": "PlM/0x31",
            "captured_at": "2026-07-18T16:00:00Z",
        },
        "guilds": [],
        "players": [],
        "pals": [
            {
                "instance_uid": "fixture-pal-boss-001",
                "owner_player_uid": None,
                "guild_uid": None,
                "pal_id": "BOSS_Anubis",
                "is_boss": True,
                "gender": "male",
                "level": 50,
                "passive_skill_ids": ["Artisan"],
                "location_type": "unknown",
                "location_name": None,
                "location_id": None,
                "location_slot_index": None,
                "location_access_scope": "unresolved",
                "metadata": {
                    "source_internal_name": "BOSS_Anubis",
                    "source_passive_skill_internal_names": ["Artisan"],
                },
            }
        ],
    }

    normalized = normalize_parser_snapshot_payload(payload)

    assert normalized.pals[0].pal_id == "anubis"
    assert normalized.pals[0].is_boss
    assert normalized.pals[0].metadata is not None
    assert normalized.pals[0].metadata.source_internal_name == "BOSS_Anubis"


def test_boss_companion_suffix_maps_to_base_pal_and_preserves_source_name() -> None:
    payload: dict[str, JSONValue] = {
        "server": {
            "world_uid": "fixture-world-001",
            "save_version": "PlM/0x31",
            "captured_at": "2026-07-18T16:00:00Z",
        },
        "guilds": [],
        "players": [],
        "pals": [
            {
                "instance_uid": "fixture-pal-boss-companion-001",
                "owner_player_uid": None,
                "guild_uid": None,
                "pal_id": "BOSS_KingWhale_otomo",
                "is_boss": True,
                "gender": "male",
                "level": 50,
                "passive_skill_ids": ["Artisan"],
                "location_type": "unknown",
                "location_name": None,
                "location_id": None,
                "location_slot_index": None,
                "location_access_scope": "unresolved",
                "metadata": {
                    "source_internal_name": "BOSS_KingWhale_otomo",
                    "source_passive_skill_internal_names": ["Artisan"],
                },
            }
        ],
    }

    normalized = normalize_parser_snapshot_payload(payload)

    assert normalized.pals[0].pal_id == "kingwhale"
    assert normalized.pals[0].metadata is not None
    assert normalized.pals[0].metadata.source_internal_name == "BOSS_KingWhale_otomo"
