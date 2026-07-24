import json
from copy import deepcopy
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator  # type: ignore[import-untyped]

from pal_hatch_helper.generated import CanonicalSnapshot
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.normalization.validator import CanonicalSnapshotValidator


def canonical_payload() -> dict[str, object]:
    return {
        "server": {
            "world_uid": "fixture-world-001",
            "save_version": "fixture-v1",
            "captured_at": "2026-07-14T03:00:00Z",
        },
        "guilds": [{"guild_uid": "fixture-guild-001", "name": "Fixture Guild"}],
        "players": [
            {
                "player_uid": "fixture-player-001",
                "nickname": "Redacted Player",
                "level": 20,
                "guild_uid": "fixture-guild-001",
            }
        ],
        "pals": [
            {
                "instance_uid": "fixture-pal-instance-001",
                "owner_player_uid": "fixture-player-001",
                "guild_uid": "fixture-guild-001",
                "pal_id": "Lamball",
                "gender": "female",
                "level": 12,
                "passive_skill_ids": ["Artisan"],
                "location_type": "base",
                "location_name": "Fixture Base",
            }
        ],
    }


def _validator() -> CanonicalSnapshotValidator:
    return CanonicalSnapshotValidator(
        expected_world_uid="fixture-world-001",
        known_pal_ids={"Lamball"},
        known_passive_skill_ids={"Artisan"},
    )


def test_canonical_snapshot_uses_the_shared_schema() -> None:
    schema_path = (
        Path(__file__).parents[4]
        / "packages"
        / "contracts"
        / "schema"
        / "canonical-snapshot.schema.json"
    )
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    payload = canonical_payload()

    Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER).validate(
        payload
    )
    model = CanonicalSnapshot.model_validate(payload)

    assert model.server.captured_at.tzinfo is not None


def test_world_uid_mismatch_is_rejected() -> None:
    payload = canonical_payload()
    server = payload["server"]
    assert isinstance(server, dict)
    server["world_uid"] = "another-world"

    with pytest.raises(StructuredError) as caught:
        _validator().validate(CanonicalSnapshot.model_validate(payload))

    assert caught.value.code is ErrorCode.CANONICAL_WORLD_UID_MISMATCH


def test_duplicate_pal_instance_uid_is_rejected() -> None:
    payload = canonical_payload()
    pals = payload["pals"]
    assert isinstance(pals, list)
    pals.append(deepcopy(pals[0]))

    with pytest.raises(StructuredError) as caught:
        _validator().validate(CanonicalSnapshot.model_validate(payload))

    assert caught.value.code is ErrorCode.CANONICAL_PAL_UID_DUPLICATE


def test_conflicting_player_uid_mapping_is_rejected() -> None:
    payload = canonical_payload()
    players = payload["players"]
    assert isinstance(players, list)
    conflicting = deepcopy(players[0])
    assert isinstance(conflicting, dict)
    conflicting["nickname"] = "Different Mapping"
    players.append(conflicting)

    with pytest.raises(StructuredError) as caught:
        _validator().validate(CanonicalSnapshot.model_validate(payload))

    assert caught.value.code is ErrorCode.CANONICAL_PLAYER_UID_CONFLICT


def test_conflicting_guild_uid_mapping_has_its_own_error_code() -> None:
    payload = canonical_payload()
    guilds = payload["guilds"]
    assert isinstance(guilds, list)
    conflicting = deepcopy(guilds[0])
    assert isinstance(conflicting, dict)
    conflicting["name"] = "Different Guild Mapping"
    guilds.append(conflicting)

    with pytest.raises(StructuredError) as caught:
        _validator().validate(CanonicalSnapshot.model_validate(payload))

    assert caught.value.code is ErrorCode.CANONICAL_GUILD_UID_CONFLICT


def test_unknown_pal_and_passive_are_retained_with_warnings() -> None:
    payload = canonical_payload()
    pals = payload["pals"]
    assert isinstance(pals, list) and isinstance(pals[0], dict)
    pals[0]["pal_id"] = "FuturePal"
    pals[0]["passive_skill_ids"] = ["Artisan", "FuturePassive"]
    canonical = CanonicalSnapshot.model_validate(payload)

    validated = _validator().validate(canonical)

    assert validated.canonical.pals[0].pal_id == "FuturePal"
    assert validated.canonical.pals[0].passive_skill_ids == ["Artisan", "FuturePassive"]
    assert {warning.code for warning in validated.warnings} == {
        "UNKNOWN_PAL",
        "UNKNOWN_PASSIVE",
    }


def test_unknown_optional_pal_fields_are_retained_with_safe_warnings() -> None:
    payload = canonical_payload()
    pals = payload["pals"]
    assert isinstance(pals, list) and isinstance(pals[0], dict)
    pals[0]["gender"] = "unknown"
    pals[0]["level"] = None
    pals[0]["location_type"] = "unknown"
    pals[0]["location_name"] = None

    validated = _validator().validate(CanonicalSnapshot.model_validate(payload))

    assert len(validated.pals) == 1
    assert {warning.code for warning in validated.warnings} == {
        "UNKNOWN_GENDER",
        "UNKNOWN_LEVEL",
        "UNKNOWN_LOCATION",
    }


@pytest.mark.parametrize(
    ("owner_uid", "guild_uid", "expected_codes"),
    [
        ("missing-player", "fixture-guild-001", {"OWNER_UNRESOLVED"}),
        ("fixture-player-001", "missing-guild", {"GUILD_UNRESOLVED"}),
    ],
)
def test_unresolved_owner_or_guild_is_excluded_from_sharing(
    owner_uid: str,
    guild_uid: str,
    expected_codes: set[str],
) -> None:
    payload = canonical_payload()
    pals = payload["pals"]
    assert isinstance(pals, list) and isinstance(pals[0], dict)
    pals[0]["owner_player_uid"] = owner_uid
    pals[0]["guild_uid"] = guild_uid

    validated = _validator().validate(CanonicalSnapshot.model_validate(payload))

    assert not validated.pals[0].shared_eligible
    assert expected_codes <= set(validated.pals[0].warning_codes)


def test_ownerless_base_pal_with_resolved_guild_is_guild_owned_and_shareable() -> None:
    payload = canonical_payload()
    pals = payload["pals"]
    assert isinstance(pals, list) and isinstance(pals[0], dict)
    pals[0]["owner_player_uid"] = None
    pals[0]["guild_uid"] = "fixture-guild-001"
    pals[0]["location_type"] = "base"

    validated = _validator().validate(CanonicalSnapshot.model_validate(payload))

    pal = validated.pals[0]
    assert pal.ownership_scope == "guild"
    assert pal.owner_resolved
    assert pal.guild_resolved
    assert pal.shared_eligible
    assert "OWNER_UNRESOLVED" not in pal.warning_codes


def test_ownerless_non_base_pal_remains_unresolved() -> None:
    payload = canonical_payload()
    pals = payload["pals"]
    assert isinstance(pals, list) and isinstance(pals[0], dict)
    pals[0]["owner_player_uid"] = None
    pals[0]["guild_uid"] = "fixture-guild-001"
    pals[0]["location_type"] = "player_storage"

    validated = _validator().validate(CanonicalSnapshot.model_validate(payload))

    pal = validated.pals[0]
    assert pal.ownership_scope == "unresolved"
    assert not pal.shared_eligible
    assert "OWNER_UNRESOLVED" in pal.warning_codes
