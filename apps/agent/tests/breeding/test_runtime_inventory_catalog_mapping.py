import logging

from pal_hatch_helper.repositories.breeding import _inventory_snapshot


def _item(instance_uid: str, pal_id: str) -> dict[str, object]:
    return {
        "instance_uid": instance_uid,
        "pal_id": pal_id,
        "owner_player_id": None,
        "guild_id": None,
        "gender": "male",
        "passive_skill_ids": [],
        "location_type": "player_storage",
        "location_name": None,
        "share_enabled": False,
        "owner_resolved": True,
        "guild_resolved": True,
        "present_in_snapshot": True,
        "breeding_enabled": True,
        "plan_locked": False,
    }


def test_inventory_maps_released_boss_variants_and_filters_unknown_species(
    caplog,
) -> None:
    payload = {
        "snapshot_id": "40000000-0000-4000-8000-000000000001",
        "world_id": "00000000-0000-4000-8000-000000000000",
        "items": [
            _item("boss-instance", "boss_anubis"),
            _item("regular-instance", "anubis"),
            _item("unknown-instance", "yakushimamonster001"),
        ],
    }

    with caplog.at_level(logging.WARNING):
        snapshot = _inventory_snapshot(payload, frozenset({"anubis"}))

    assert [(item.instance_uid, item.pal_id) for item in snapshot.items] == [
        ("boss-instance", "anubis"),
        ("regular-instance", "anubis"),
    ]
    assert "breeding_inventory_species_normalized" in caplog.messages
    assert "breeding_inventory_species_filtered" in caplog.messages
