import io
import tarfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
import zstandard

from pal_hatch_helper.commands.catalog_operations import (
    CatalogAdminOperation,
    _extract_normalized_catalog,
)
from pal_hatch_helper.game_catalog.artifacts import ARTIFACT_FILENAMES
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.game_catalog.validation import load_catalog_directory
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

OWNER_ID = UUID("10000000-0000-4000-8000-000000000001")
UPLOAD_ID = UUID("81000000-0000-4000-8000-000000000001")
OPERATION_ID = UUID("82000000-0000-4000-8000-000000000001")


def test_admin_catalog_tar_zst_is_extracted_to_agent_owned_staging(tmp_path: Path) -> None:
    package = _package()
    operation = _operation(package)

    directory = _extract_normalized_catalog(package, operation, CatalogPaths(tmp_path))

    catalog = load_catalog_directory(directory)
    assert catalog.content_hash == (
        "471a576b1660288347e76a45bd1d48a60366517dbd390b4ccdb30416712a389f"
    )
    assert directory.is_relative_to(tmp_path / "game-catalog" / "extraction" / "staging")


def test_admin_catalog_tar_zst_rejects_unlisted_member(tmp_path: Path) -> None:
    package = _package(extra_member="payload.exe")
    operation = _operation(package)

    with pytest.raises(StructuredError) as caught:
        _extract_normalized_catalog(package, operation, CatalogPaths(tmp_path))

    assert caught.value.code is ErrorCode.GAME_DATA_VALIDATION_FAILED
    upload_staging = tmp_path / "game-catalog" / "extraction" / "staging" / "admin-uploads"
    assert not list(upload_staging.iterdir())


def test_admin_catalog_tar_zst_rejects_hash_mismatch(tmp_path: Path) -> None:
    package = _package()
    operation = _operation(package, package_sha256="0" * 64)

    with pytest.raises(StructuredError) as caught:
        _extract_normalized_catalog(package, operation, CatalogPaths(tmp_path))

    assert caught.value.code is ErrorCode.GAME_DATA_HASH_MISMATCH


def _operation(
    package: bytes,
    *,
    package_sha256: str | None = None,
) -> CatalogAdminOperation:
    import hashlib

    return CatalogAdminOperation(
        operation_id=OPERATION_ID,
        operation_type="validate",
        upload_id=UPLOAD_ID,
        source_id=UUID("76000000-0000-4000-8000-000000000001"),
        object_path=f"admin-uploads/{OWNER_ID}/{UPLOAD_ID}.tar.zst",
        size_bytes=len(package),
        package_sha256=package_sha256 or hashlib.sha256(package).hexdigest(),
        created_at=datetime.now(UTC),
    )


def _package(*, extra_member: str | None = None) -> bytes:
    fixture = Path(__file__).parents[4] / "data" / "catalog-fixtures" / "minimal-valid"
    archive_bytes = io.BytesIO()
    with tarfile.open(fileobj=archive_bytes, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for filename in ARTIFACT_FILENAMES:
            payload = (fixture / filename).read_bytes()
            info = tarfile.TarInfo(filename)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
        if extra_member is not None:
            payload = b"not allowed"
            info = tarfile.TarInfo(extra_member)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
    return zstandard.ZstdCompressor().compress(archive_bytes.getvalue())
