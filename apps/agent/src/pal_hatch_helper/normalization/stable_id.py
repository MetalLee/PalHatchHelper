import copy
import re
import unicodedata
from collections.abc import Iterable

from pydantic import ValidationError

from pal_hatch_helper.generated import CanonicalSnapshot
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import JSONValue

_STABLE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_MAXIMUM_STABLE_ID_LENGTH = 120


def normalize_palworld_stable_id(source: str) -> str:
    normalized = unicodedata.normalize("NFKC", source).lower()
    if (
        not normalized
        or len(normalized) > _MAXIMUM_STABLE_ID_LENGTH
        or _STABLE_ID_PATTERN.fullmatch(normalized) is None
    ):
        raise StructuredError(
            code=ErrorCode.GAME_ID_INVALID,
            summary="A game source identifier does not satisfy Palworld stable ID v1.",
            retryable=False,
        )
    return normalized


def normalize_inventory_pal_id(source: str) -> str:
    stable_id = normalize_palworld_stable_id(source)
    if stable_id.startswith("boss_") and len(stable_id) > len("boss_"):
        stable_id = stable_id[len("boss_") :]
        if stable_id.endswith("_otomo") and len(stable_id) > len("_otomo"):
            stable_id = stable_id[: -len("_otomo")]
    return stable_id


def build_stable_id_map(sources: Iterable[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    source_by_stable_id: dict[str, str] = {}
    for source in sources:
        stable_id = normalize_palworld_stable_id(source)
        previous = source_by_stable_id.get(stable_id)
        if previous is not None and previous != source:
            raise StructuredError(
                code=ErrorCode.GAME_ID_NORMALIZATION_COLLISION,
                summary="Distinct game source identifiers normalize to the same stable ID.",
                retryable=False,
            )
        source_by_stable_id[stable_id] = source
        result[source] = stable_id
    return result


def normalize_parser_snapshot_payload(payload: dict[str, JSONValue]) -> CanonicalSnapshot:
    """Build a CanonicalSnapshot without mutating the ParserAdapter's raw payload."""

    normalized_payload = copy.deepcopy(payload)
    pals = normalized_payload.get("pals")
    if not isinstance(pals, list):
        raise _canonical_schema_error()

    pal_sources: list[str] = []
    passive_sources: list[str] = []
    typed_pals: list[dict[str, JSONValue]] = []
    source_names: list[tuple[str, list[str]]] = []
    for value in pals:
        if not isinstance(value, dict):
            raise _canonical_schema_error()
        pal_id = value.get("pal_id")
        passives = value.get("passive_skill_ids")
        if (
            not isinstance(pal_id, str)
            or not isinstance(passives, list)
            or not all(isinstance(passive, str) for passive in passives)
        ):
            raise _canonical_schema_error()
        source_pal_id = pal_id
        source_passives = [passive for passive in passives if isinstance(passive, str)]
        metadata = value.get("metadata")
        if metadata is not None:
            if not isinstance(metadata, dict):
                raise _canonical_schema_error()
            metadata_pal_id = metadata.get("source_internal_name")
            metadata_passives = metadata.get("source_passive_skill_internal_names")
            if (
                not isinstance(metadata_pal_id, str)
                or not isinstance(metadata_passives, list)
                or not all(isinstance(passive, str) for passive in metadata_passives)
            ):
                raise _canonical_schema_error()
            typed_metadata_passives = [
                passive for passive in metadata_passives if isinstance(passive, str)
            ]
            if (
                len(typed_metadata_passives) != len(source_passives)
                or normalize_inventory_pal_id(metadata_pal_id) != normalize_inventory_pal_id(pal_id)
                or any(
                    normalize_palworld_stable_id(source) != normalize_palworld_stable_id(stable)
                    for source, stable in zip(typed_metadata_passives, source_passives, strict=True)
                )
            ):
                raise _canonical_schema_error()
            source_pal_id = metadata_pal_id
            source_passives = typed_metadata_passives
        pal_sources.append(source_pal_id)
        passive_sources.extend(source_passives)
        typed_pals.append(value)
        source_names.append((source_pal_id, source_passives))

    pal_ids = build_stable_id_map(pal_sources)
    passive_ids = build_stable_id_map(passive_sources)
    for pal, (source_pal_id, typed_source_passives) in zip(typed_pals, source_names, strict=True):
        pal["pal_id"] = normalize_inventory_pal_id(pal_ids[source_pal_id])
        pal["passive_skill_ids"] = [passive_ids[value] for value in typed_source_passives]
        source_passive_metadata: list[JSONValue] = []
        source_passive_metadata.extend(typed_source_passives)
        source_metadata: dict[str, JSONValue] = {
            "source_internal_name": source_pal_id,
            "source_passive_skill_internal_names": source_passive_metadata,
        }
        pal["metadata"] = source_metadata

    try:
        return CanonicalSnapshot.model_validate(normalized_payload)
    except ValidationError as error:
        raise _canonical_schema_error() from error


def _canonical_schema_error() -> StructuredError:
    return StructuredError(
        code=ErrorCode.CANONICAL_SCHEMA_INVALID,
        summary="Parser JSON does not satisfy the CanonicalSnapshot schema.",
        retryable=False,
    )


__all__ = [
    "build_stable_id_map",
    "normalize_inventory_pal_id",
    "normalize_palworld_stable_id",
    "normalize_parser_snapshot_payload",
]
