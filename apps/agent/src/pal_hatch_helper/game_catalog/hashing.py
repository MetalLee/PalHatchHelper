import hashlib
from collections.abc import Iterable
from pathlib import Path

from pal_hatch_helper.game_catalog.jsonl import canonical_json

FileHash = tuple[str, str, int]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def compute_content_hash(schema_version: str, files: Iterable[FileHash]) -> str:
    hash_input = {
        "files": [
            {"filename": filename, "record_count": record_count, "sha256": sha256}
            for filename, sha256, record_count in sorted(files, key=lambda item: item[0])
        ],
        "schema_version": schema_version,
    }
    return hashlib.sha256(canonical_json(hash_input).encode("utf-8")).hexdigest()
