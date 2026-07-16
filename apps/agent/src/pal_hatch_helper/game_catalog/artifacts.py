import gzip
import io
import os
import tarfile
import tempfile
from collections.abc import Mapping
from pathlib import Path, PurePosixPath
from typing import Protocol
from urllib.parse import quote

import httpx
from pydantic import SecretStr

from pal_hatch_helper.game_catalog.paths import fsync_directory
from pal_hatch_helper.game_catalog.validation import (
    REQUIRED_PACKAGE_FILES,
    load_catalog_directory,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

ARTIFACT_FILENAMES = (
    "manifest.json",
    *REQUIRED_PACKAGE_FILES,
    "validation-report.json",
    "checksums.sha256",
)
FULL_CATALOG_SIDECAR_FILENAMES = (
    "source-package-manifest.json",
    "source-evidence.json",
    "extraction-summary.json",
)


class CatalogArtifactStore(Protocol):
    async def put_version_bundle(self, content_hash: str, bundle: bytes) -> None: ...

    async def put_version_metadata(
        self, content_hash: str, manifest: bytes, validation_report: bytes
    ) -> None: ...

    async def get_version_bundle(self, content_hash: str) -> bytes: ...

    async def exists(self, content_hash: str) -> bool: ...


class LocalCatalogArtifactStore:
    def __init__(self, root: Path) -> None:
        self._root = root

    def path_for(self, content_hash: str) -> Path:
        return self._root / "versions" / content_hash / "catalog.tar.gz"

    async def put_version_bundle(self, content_hash: str, bundle: bytes) -> None:
        path = self.path_for(content_hash)
        self._write_immutable(path, bundle)

    async def put_version_metadata(
        self, content_hash: str, manifest: bytes, validation_report: bytes
    ) -> None:
        version_root = self.path_for(content_hash).parent
        self._write_immutable(version_root / "manifest.json", manifest)
        self._write_immutable(version_root / "validation-report.json", validation_report)

    @staticmethod
    def _write_immutable(path: Path, payload: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            if path.read_bytes() != payload:
                raise StructuredError(
                    code=ErrorCode.GAME_DATA_HASH_MISMATCH,
                    summary="An immutable local catalog artifact already has different bytes.",
                    retryable=False,
                )
            return
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".catalog.", suffix=".tmp", dir=path.parent
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(payload)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary_path, path)
            fsync_directory(path.parent)
        finally:
            temporary_path.unlink(missing_ok=True)

    async def get_version_bundle(self, content_hash: str) -> bytes:
        try:
            return self.path_for(content_hash).read_bytes()
        except FileNotFoundError as error:
            raise StructuredError(
                code=ErrorCode.GAME_DATA_ARTIFACT_MISSING,
                summary="The exact requested catalog artifact is missing.",
                retryable=False,
            ) from error

    async def exists(self, content_hash: str) -> bool:
        return self.path_for(content_hash).is_file()


class SupabaseCatalogArtifactStore:
    """Private Storage adapter using the Agent's existing Service Role configuration."""

    def __init__(
        self,
        *,
        base_url: str,
        service_role_key: SecretStr,
        bucket: str,
        request_timeout_seconds: float = 10,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        key = service_role_key.get_secret_value()
        self._base_url = base_url.rstrip("/")
        self._bucket = bucket
        self._headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        self._owns_http_client = http_client is None
        self._http_client = http_client or httpx.AsyncClient(
            timeout=request_timeout_seconds,
            trust_env=False,
        )

    async def put_version_bundle(self, content_hash: str, bundle: bytes) -> None:
        await self._put_object(
            f"versions/{content_hash}/catalog.tar.gz",
            bundle,
            "application/gzip",
        )

    async def put_version_metadata(
        self, content_hash: str, manifest: bytes, validation_report: bytes
    ) -> None:
        await self._put_object(
            f"versions/{content_hash}/manifest.json",
            manifest,
            "application/json",
        )
        await self._put_object(
            f"versions/{content_hash}/validation-report.json",
            validation_report,
            "application/json",
        )

    async def _put_object(self, object_path: str, payload: bytes, content_type: str) -> None:
        response = await self._request_path(
            "POST",
            object_path,
            content=payload,
            headers={**self._headers, "Content-Type": content_type, "x-upsert": "false"},
        )
        if self._is_duplicate_response(response):
            return
        if response.is_error:
            raise self._storage_error(response.status_code)

    @staticmethod
    def _is_duplicate_response(response: httpx.Response) -> bool:
        if response.status_code == 409:
            return True
        if response.status_code != 400:
            return False
        try:
            payload = response.json()
        except ValueError:
            return False
        return bool(
            isinstance(payload, dict)
            and str(payload.get("statusCode")) == "409"
            and payload.get("error") == "Duplicate"
        )

    async def get_version_bundle(self, content_hash: str) -> bytes:
        response = await self._request("GET", content_hash, headers=self._headers)
        if self._is_not_found_response(response):
            raise StructuredError(
                code=ErrorCode.GAME_DATA_ARTIFACT_MISSING,
                summary="The exact requested catalog artifact is missing.",
                retryable=False,
            )
        if response.is_error:
            raise self._storage_error(response.status_code)
        return response.content

    async def exists(self, content_hash: str) -> bool:
        response = await self._request(
            "GET",
            content_hash,
            headers={**self._headers, "Range": "bytes=0-0"},
        )
        if self._is_not_found_response(response):
            return False
        if response.is_error:
            raise self._storage_error(response.status_code)
        return True

    async def close(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()

    async def _request(
        self,
        method: str,
        content_hash: str,
        *,
        headers: Mapping[str, str],
        content: bytes | None = None,
    ) -> httpx.Response:
        return await self._request_path(
            method,
            f"versions/{content_hash}/catalog.tar.gz",
            headers=headers,
            content=content,
        )

    async def _request_path(
        self,
        method: str,
        object_path: str,
        *,
        headers: Mapping[str, str],
        content: bytes | None = None,
    ) -> httpx.Response:
        path = quote(object_path, safe="/")
        bucket = quote(self._bucket, safe="")
        try:
            return await self._http_client.request(
                method,
                f"{self._base_url}/storage/v1/object/{bucket}/{path}",
                headers=headers,
                content=content,
            )
        except (httpx.TimeoutException, httpx.TransportError) as error:
            raise StructuredError(
                code=ErrorCode.DATABASE_UNAVAILABLE,
                summary="Catalog artifact storage is temporarily unavailable.",
                retryable=True,
            ) from error

    @staticmethod
    def _is_not_found_response(response: httpx.Response) -> bool:
        if response.status_code == 404:
            return True
        if response.status_code != 400:
            return False
        try:
            payload = response.json()
        except ValueError:
            return False
        return bool(
            isinstance(payload, dict)
            and str(payload.get("statusCode")) == "404"
            and str(payload.get("error", "")).lower() in {"not_found", "not found"}
        )

    @staticmethod
    def _storage_error(status_code: int) -> StructuredError:
        return StructuredError(
            code=(
                ErrorCode.DATABASE_UNAVAILABLE
                if status_code in {408, 429} or status_code >= 500
                else ErrorCode.GAME_DATA_IMPORT_REJECTED
            ),
            summary="Supabase rejected a catalog artifact operation.",
            retryable=status_code in {408, 429} or status_code >= 500,
        )


def create_catalog_bundle(directory: Path) -> bytes:
    catalog = load_catalog_directory(directory)
    filenames = ARTIFACT_FILENAMES
    if catalog.schema_version == "1.1.0":
        filenames = (*filenames, *FULL_CATALOG_SIDECAR_FILENAMES)
    output = io.BytesIO()
    with (
        gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as compressed,
        tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive,
    ):
        for filename in sorted(filenames):
            path = directory / filename
            if not path.is_file():
                raise StructuredError(
                    code=ErrorCode.GAME_DATA_ARTIFACT_MISSING,
                    summary=f"Catalog bundle input {filename} is missing.",
                    retryable=False,
                )
            payload = path.read_bytes()
            info = tarfile.TarInfo(filename)
            info.size = len(payload)
            info.mode = 0o644
            info.mtime = 0
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            archive.addfile(info, io.BytesIO(payload))
    return output.getvalue()


def extract_catalog_bundle_atomic(bundle: bytes, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{destination.name}.", dir=destination.parent))
    try:
        with tarfile.open(fileobj=io.BytesIO(bundle), mode="r:gz") as archive:
            members = archive.getmembers()
            names = {member.name for member in members}
            allowed_file_sets = (
                set(ARTIFACT_FILENAMES),
                set((*ARTIFACT_FILENAMES, *FULL_CATALOG_SIDECAR_FILENAMES)),
            )
            if len(members) != len(names) or names not in allowed_file_sets:
                raise StructuredError(
                    code=ErrorCode.GAME_DATA_VALIDATION_FAILED,
                    summary="Catalog bundle contains an invalid file set.",
                    retryable=False,
                )
            for member in members:
                path = PurePosixPath(member.name)
                if not member.isfile() or path.is_absolute() or ".." in path.parts:
                    raise StructuredError(
                        code=ErrorCode.GAME_DATA_VALIDATION_FAILED,
                        summary="Catalog bundle contains an unsafe path.",
                        retryable=False,
                    )
                source = archive.extractfile(member)
                if source is None:
                    raise StructuredError(
                        code=ErrorCode.GAME_DATA_VALIDATION_FAILED,
                        summary="Catalog bundle contains an unreadable member.",
                        retryable=False,
                    )
                path_on_disk = temporary / member.name
                with path_on_disk.open("wb") as output:
                    output.write(source.read())
                    output.flush()
                    os.fsync(output.fileno())
        load_catalog_directory(temporary)
        if destination.exists():
            existing = load_catalog_directory(destination)
            incoming = load_catalog_directory(temporary)
            if existing.content_hash != incoming.content_hash:
                raise StructuredError(
                    code=ErrorCode.GAME_DATA_HASH_MISMATCH,
                    summary="An immutable normalized directory already has different content.",
                    retryable=False,
                )
            return
        os.replace(temporary, destination)
        fsync_directory(destination.parent)
    except StructuredError:
        raise
    except (OSError, tarfile.TarError) as error:
        raise StructuredError(
            code=ErrorCode.GAME_DATA_VALIDATION_FAILED,
            summary="Catalog bundle is unreadable or incomplete.",
            retryable=False,
        ) from error
    finally:
        if temporary.exists():
            for child in temporary.iterdir():
                child.unlink(missing_ok=True)
            temporary.rmdir()
