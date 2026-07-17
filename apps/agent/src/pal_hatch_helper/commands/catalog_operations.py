import hashlib
import io
import os
import shutil
import tarfile
import tempfile
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePosixPath
from typing import Literal, Protocol
from uuid import UUID

import zstandard
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError, model_validator

from pal_hatch_helper.game_catalog.artifacts import (
    ARTIFACT_FILENAMES,
    FULL_CATALOG_SIDECAR_FILENAMES,
    SupabaseCatalogArtifactStore,
)
from pal_hatch_helper.game_catalog.gateway import CatalogImportGateway
from pal_hatch_helper.game_catalog.importer import stage_catalog_version
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.game_catalog.validation import validate_catalog_directory
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import DatabaseClient, JSONValue

MAX_PACKAGE_BYTES = 64 * 1024 * 1024
MAX_EXPANDED_BYTES = 512 * 1024 * 1024
_UPLOAD_PREFIX = "admin-uploads/"


class CatalogAdminOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation_id: UUID
    operation_type: Literal["validate", "stage"]
    upload_id: UUID
    source_id: UUID
    object_path: str = Field(min_length=80, max_length=200)
    size_bytes: int = Field(ge=1, le=MAX_PACKAGE_BYTES)
    package_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    created_at: AwareDatetime

    @model_validator(mode="after")
    def validate_server_object_path(self) -> "CatalogAdminOperation":
        parts = PurePosixPath(self.object_path).parts
        if (
            len(parts) != 3
            or parts[0] != _UPLOAD_PREFIX.rstrip("/")
            or parts[2] != f"{self.upload_id}.tar.zst"
        ):
            raise ValueError("server-generated upload path is invalid")
        try:
            UUID(parts[1])
        except ValueError as error:
            raise ValueError("server-generated upload owner is invalid") from error
        return self


class CatalogOperationRepository(Protocol):
    async def claim(
        self, worker_id: str, stale_before: datetime
    ) -> CatalogAdminOperation | None: ...

    async def complete(
        self,
        operation: CatalogAdminOperation,
        worker_id: str,
        safe_summary: Mapping[str, object],
        staged_version_id: UUID | None,
    ) -> None: ...

    async def fail(
        self,
        operation: CatalogAdminOperation,
        worker_id: str,
        error: StructuredError,
    ) -> None: ...


class SupabaseCatalogOperationRepository:
    def __init__(self, database: DatabaseClient) -> None:
        self._database = database

    async def claim(self, worker_id: str, stale_before: datetime) -> CatalogAdminOperation | None:
        payload = await self._database.rpc(
            "claim_admin_catalog_operation",
            {"p_worker_id": worker_id, "p_stale_before": stale_before.isoformat()},
        )
        if payload is None:
            return None
        if not isinstance(payload, dict):
            raise _invalid_response("claim_admin_catalog_operation")
        try:
            return CatalogAdminOperation.model_validate(payload)
        except ValidationError as error:
            raise _invalid_response("claim_admin_catalog_operation") from error

    async def complete(
        self,
        operation: CatalogAdminOperation,
        worker_id: str,
        safe_summary: Mapping[str, object],
        staged_version_id: UUID | None,
    ) -> None:
        result = await self._database.rpc(
            "complete_admin_catalog_operation",
            {
                "p_operation_id": str(operation.operation_id),
                "p_worker_id": worker_id,
                "p_result_summary": _safe_json(safe_summary),
                "p_staged_version_id": (
                    str(staged_version_id) if staged_version_id is not None else None
                ),
            },
        )
        if result is not True:
            raise _invalid_response("complete_admin_catalog_operation")

    async def fail(
        self,
        operation: CatalogAdminOperation,
        worker_id: str,
        error: StructuredError,
    ) -> None:
        result = await self._database.rpc(
            "fail_admin_catalog_operation",
            {
                "p_operation_id": str(operation.operation_id),
                "p_worker_id": worker_id,
                "p_error_code": error.code.value,
                "p_result_summary": {"outcome": "failed", "error_code": error.code.value},
            },
        )
        if result is not True:
            raise _invalid_response("fail_admin_catalog_operation")


class CatalogAdminOperationWorker:
    def __init__(
        self,
        repository: CatalogOperationRepository,
        *,
        artifact_store: SupabaseCatalogArtifactStore,
        gateway: CatalogImportGateway,
        paths: CatalogPaths,
        artifact_bucket: str,
        worker_id: str,
        stale_after_seconds: float = 120,
    ) -> None:
        self._repository = repository
        self._artifact_store = artifact_store
        self._gateway = gateway
        self._paths = paths
        self._artifact_bucket = artifact_bucket
        self._worker_id = worker_id
        self._stale_after = timedelta(seconds=stale_after_seconds)

    async def run_once(self) -> bool:
        operation = await self._repository.claim(
            self._worker_id, datetime.now(UTC) - self._stale_after
        )
        if operation is None:
            return False
        try:
            payload = await self._artifact_store.get_private_object(operation.object_path)
            directory = _extract_normalized_catalog(payload, operation, self._paths)
            try:
                report = validate_catalog_directory(directory)
                if not report.valid:
                    raise StructuredError(
                        code=ErrorCode.GAME_DATA_VALIDATION_FAILED,
                        summary="The uploaded normalized catalog failed deterministic validation.",
                        retryable=False,
                    )
                summary: dict[str, object] = {
                    "outcome": "validated",
                    "content_hash": report.content_hash,
                    "counts": report.counts.model_dump(mode="json"),
                    "warnings": report.warnings,
                }
                version_id: UUID | None = None
                if operation.operation_type == "stage":
                    version_id = await stage_catalog_version(
                        directory,
                        source_id=operation.source_id,
                        artifact_bucket=self._artifact_bucket,
                        artifact_store=self._artifact_store,
                        gateway=self._gateway,
                    )
                    summary.update({"outcome": "staged", "staged_version_id": str(version_id)})
                await self._repository.complete(operation, self._worker_id, summary, version_id)
            finally:
                shutil.rmtree(directory, ignore_errors=True)
        except StructuredError as error:
            await self._repository.fail(operation, self._worker_id, error)
        return True


def _extract_normalized_catalog(
    package: bytes,
    operation: CatalogAdminOperation,
    paths: CatalogPaths,
) -> Path:
    if len(package) != operation.size_bytes or len(package) > MAX_PACKAGE_BYTES:
        raise _invalid_package(ErrorCode.GAME_DATA_HASH_MISMATCH)
    if hashlib.sha256(package).hexdigest() != operation.package_sha256:
        raise _invalid_package(ErrorCode.GAME_DATA_HASH_MISMATCH)
    paths.ensure()
    extraction_root = paths.extraction_staging / "admin-uploads"
    extraction_root.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix=f".{operation.upload_id}.", dir=extraction_root))
    allowed_sets = (
        set(ARTIFACT_FILENAMES),
        set((*ARTIFACT_FILENAMES, *FULL_CATALOG_SIDECAR_FILENAMES)),
    )
    allowed_names = set((*ARTIFACT_FILENAMES, *FULL_CATALOG_SIDECAR_FILENAMES))
    names: set[str] = set()
    expanded_bytes = 0
    try:
        try:
            with (
                zstandard.ZstdDecompressor().stream_reader(io.BytesIO(package)) as decompressed,
                tarfile.open(fileobj=decompressed, mode="r|") as archive,
            ):
                for member in archive:
                    path = PurePosixPath(member.name)
                    if (
                        not member.isfile()
                        or path.is_absolute()
                        or len(path.parts) != 1
                        or ".." in path.parts
                        or member.name in names
                        or member.name not in allowed_names
                        or member.size < 0
                    ):
                        raise _invalid_package(ErrorCode.GAME_DATA_VALIDATION_FAILED)
                    expanded_bytes += member.size
                    if expanded_bytes > MAX_EXPANDED_BYTES:
                        raise _invalid_package(ErrorCode.GAME_DATA_VALIDATION_FAILED)
                    source = archive.extractfile(member)
                    if source is None:
                        raise _invalid_package(ErrorCode.GAME_DATA_VALIDATION_FAILED)
                    destination = directory / member.name
                    with destination.open("xb") as output:
                        remaining = member.size
                        while remaining:
                            chunk = source.read(min(1024 * 1024, remaining))
                            if not chunk:
                                raise _invalid_package(ErrorCode.GAME_DATA_VALIDATION_FAILED)
                            output.write(chunk)
                            remaining -= len(chunk)
                        if source.read(1):
                            raise _invalid_package(ErrorCode.GAME_DATA_VALIDATION_FAILED)
                        output.flush()
                        os.fsync(output.fileno())
                    names.add(member.name)
        except (zstandard.ZstdError, tarfile.TarError, OSError, EOFError) as error:
            raise _invalid_package(ErrorCode.GAME_DATA_VALIDATION_FAILED) from error
        if names not in allowed_sets:
            raise _invalid_package(ErrorCode.GAME_DATA_VALIDATION_FAILED)
        return directory
    except BaseException:
        shutil.rmtree(directory, ignore_errors=True)
        raise


def _safe_json(value: Mapping[str, object]) -> dict[str, JSONValue]:
    result: dict[str, JSONValue] = {}
    for key, item in value.items():
        if item is None or isinstance(item, str | int | float | bool):
            result[key] = item
        elif isinstance(item, list):
            result[key] = [str(entry) for entry in item]
        elif isinstance(item, dict):
            result[key] = {
                str(nested_key): nested_value
                for nested_key, nested_value in item.items()
                if nested_value is None or isinstance(nested_value, str | int | float | bool)
            }
        else:
            result[key] = str(item)
    return result


def _invalid_package(code: ErrorCode) -> StructuredError:
    return StructuredError(
        code=code,
        summary="The uploaded normalized catalog package is invalid.",
        retryable=False,
    )


def _invalid_response(function_name: str) -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary=f"{function_name} returned an invalid response.",
        retryable=False,
    )


__all__ = [
    "CatalogAdminOperation",
    "CatalogAdminOperationWorker",
    "SupabaseCatalogOperationRepository",
]
