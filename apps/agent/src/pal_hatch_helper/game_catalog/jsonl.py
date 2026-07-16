import json
import os
import tempfile
from collections.abc import Iterable, Iterator, Mapping, Sequence
from pathlib import Path

from pal_hatch_helper.game_catalog.paths import fsync_directory
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

type JSONScalar = str | int | float | bool | None
type JSONValue = JSONScalar | list[JSONValue] | dict[str, JSONValue]
type JSONRecord = dict[str, JSONValue]

_DEFAULT_SET_FIELDS = frozenset(
    {"element_types", "locales", "errors", "warnings", "passive_skill_ids"}
)


def canonical_json(value: object, *, set_fields: set[str] | None = None) -> str:
    normalized = _normalize(
        value,
        set_fields=set(_DEFAULT_SET_FIELDS).union(set_fields or set()),
    )
    try:
        return json.dumps(
            normalized,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise StructuredError(
            code=ErrorCode.GAME_DATA_JSON_INVALID,
            summary="Catalog data contains an unsupported JSON value.",
            retryable=False,
        ) from error


def _dotnet_canonical_json(value: object) -> str:
    """Serialize with the escaping used by the audited .NET extractor."""

    normalized = _normalize(value, set_fields=set(_DEFAULT_SET_FIELDS))
    serialized = json.dumps(
        normalized,
        ensure_ascii=True,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    output: list[str] = []
    in_string = False
    index = 0
    html_escapes = {
        "&": "\\u0026",
        "'": "\\u0027",
        "+": "\\u002B",
        "<": "\\u003C",
        ">": "\\u003E",
        "`": "\\u0060",
    }
    while index < len(serialized):
        character = serialized[index]
        if character == '"':
            in_string = not in_string
            output.append(character)
            index += 1
            continue
        if in_string and character == "\\" and index + 1 < len(serialized):
            escape = serialized[index + 1]
            if escape == "u" and index + 5 < len(serialized):
                output.append("\\u" + serialized[index + 2 : index + 6].upper())
                index += 6
                continue
            if escape == '"':
                output.append("\\u0022")
                index += 2
                continue
            output.extend((character, escape))
            index += 2
            continue
        if in_string and character in html_escapes:
            output.append(html_escapes[character])
        else:
            output.append(character)
        index += 1
    return "".join(output)


def read_jsonl(path: Path, *, require_canonical: bool = True) -> Iterator[JSONRecord]:
    try:
        with path.open("r", encoding="utf-8", newline="") as source:
            for line_number, raw_line in enumerate(source, start=1):
                if not raw_line.endswith("\n") or raw_line.endswith("\r\n"):
                    raise _jsonl_error(path, line_number, "Catalog JSONL must use LF line endings.")
                line = raw_line[:-1]
                if not line:
                    raise _jsonl_error(
                        path, line_number, "Catalog JSONL cannot contain blank lines."
                    )
                try:
                    value: object = json.loads(line)
                except (json.JSONDecodeError, UnicodeDecodeError) as error:
                    raise StructuredError(
                        code=ErrorCode.GAME_DATA_JSON_INVALID,
                        summary=f"Catalog JSON is invalid at {path.name}:{line_number}.",
                        retryable=False,
                    ) from error
                if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
                    raise _jsonl_error(path, line_number, "Each JSONL record must be an object.")
                record = _as_record(value)
                if (
                    require_canonical
                    and canonical_json(record) != line
                    and _dotnet_canonical_json(record) != line
                ):
                    raise _jsonl_error(path, line_number, "Catalog JSONL is not canonical.")
                yield record
    except UnicodeDecodeError as error:
        raise StructuredError(
            code=ErrorCode.GAME_DATA_JSON_INVALID,
            summary=f"Catalog file {path.name} is not valid UTF-8.",
            retryable=False,
        ) from error


def write_jsonl_atomic(
    path: Path,
    records: Iterable[Mapping[str, object]],
    *,
    primary_key: str | Sequence[str],
    set_fields: set[str] | None = None,
) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    key_fields = (primary_key,) if isinstance(primary_key, str) else tuple(primary_key)
    normalized_records: list[JSONRecord] = []
    for record in records:
        normalized = _normalize(
            dict(record),
            set_fields=set(_DEFAULT_SET_FIELDS).union(set_fields or set()),
        )
        if not isinstance(normalized, dict):
            raise StructuredError(
                code=ErrorCode.GAME_DATA_JSON_INVALID,
                summary="Each catalog JSONL value must be an object.",
                retryable=False,
            )
        normalized_records.append(_as_record(normalized))
    try:
        normalized_records.sort(
            key=lambda record: tuple(str(record[field]) for field in key_fields)
        )
    except KeyError as error:
        raise StructuredError(
            code=ErrorCode.GAME_DATA_SCHEMA_INVALID,
            summary=f"Catalog record is missing primary key {error.args[0]}.",
            retryable=False,
        ) from error

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            for record in normalized_records:
                output.write(canonical_json(record))
                output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, path)
        fsync_directory(path.parent)
    finally:
        temporary_path.unlink(missing_ok=True)
    return len(normalized_records)


def write_json_atomic(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            output.write(canonical_json(value))
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, path)
        fsync_directory(path.parent)
    finally:
        temporary_path.unlink(missing_ok=True)


def _normalize(value: object, *, set_fields: set[str], parent_key: str | None = None) -> JSONValue:
    if value is None or isinstance(value, str | bool | int):
        return value
    if isinstance(value, float):
        if not (float("-inf") < value < float("inf")):
            raise StructuredError(
                code=ErrorCode.GAME_DATA_JSON_INVALID,
                summary="Catalog JSON cannot contain NaN or Infinity.",
                retryable=False,
            )
        return value
    if isinstance(value, Mapping):
        if not all(isinstance(key, str) for key in value):
            raise StructuredError(
                code=ErrorCode.GAME_DATA_JSON_INVALID,
                summary="Catalog JSON object keys must be strings.",
                retryable=False,
            )
        return {
            str(key): _normalize(item, set_fields=set_fields, parent_key=str(key))
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, Iterable) and not isinstance(value, bytes | bytearray):
        items = [_normalize(item, set_fields=set_fields) for item in value]
        if parent_key in set_fields:
            by_value = {canonical_json(item): item for item in items}
            return [by_value[key] for key in sorted(by_value)]
        return items
    raise StructuredError(
        code=ErrorCode.GAME_DATA_JSON_INVALID,
        summary="Catalog data contains an unsupported JSON value.",
        retryable=False,
    )


def _as_record(value: Mapping[str, object]) -> JSONRecord:
    return {str(key): _as_json_value(item) for key, item in value.items()}


def _as_json_value(value: object) -> JSONValue:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, list):
        return [_as_json_value(item) for item in value]
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        return {str(key): _as_json_value(item) for key, item in value.items()}
    raise StructuredError(
        code=ErrorCode.GAME_DATA_JSON_INVALID,
        summary="Catalog record contains an unsupported JSON value.",
        retryable=False,
    )


def _jsonl_error(path: Path, line_number: int, summary: str) -> StructuredError:
    return StructuredError(
        code=ErrorCode.GAME_DATA_JSONL_INVALID,
        summary=f"{summary} ({path.name}:{line_number})",
        retryable=False,
    )
