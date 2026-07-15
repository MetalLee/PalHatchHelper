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
        pal_sources.append(pal_id)
        passive_sources.extend(passive for passive in passives if isinstance(passive, str))
        typed_pals.append(value)

    pal_ids = build_stable_id_map(pal_sources)
    passive_ids = build_stable_id_map(passive_sources)
    for pal in typed_pals:
        source_pal_id = pal["pal_id"]
        source_passives = pal["passive_skill_ids"]
        assert isinstance(source_pal_id, str)
        assert isinstance(source_passives, list)
        typed_source_passives = [str(value) for value in source_passives]
        pal["pal_id"] = pal_ids[source_pal_id]
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
    "normalize_palworld_stable_id",
    "normalize_parser_snapshot_payload",
]
