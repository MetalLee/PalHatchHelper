import hashlib
import ipaddress
import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Literal, Protocol
from urllib.parse import quote, urlparse
from uuid import uuid4

import httpx

from pal_hatch_helper.game_catalog.jsonl import write_json_atomic
from pal_hatch_helper.game_catalog.paths import CatalogPaths, fsync_directory
from pal_hatch_helper.generated import StagedBreedingSourceMetadata
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

SourceType = Literal["github", "url", "upload"]


@dataclass(frozen=True, slots=True)
class SourceFetchPolicy:
    """Safety limits shared by configurable remote source adapters."""

    remote_enabled: bool = False
    maximum_bytes: int = 10 * 1024 * 1024
    timeout_seconds: float = 30.0

    def __post_init__(self) -> None:
        if self.maximum_bytes <= 0 or self.timeout_seconds <= 0:
            raise ValueError("source limits must be positive")


@dataclass(frozen=True, slots=True)
class GitHubSourceConfig:
    name: str
    owner: str
    repository: str
    ref: str
    path: str
    enabled: bool = True


@dataclass(frozen=True, slots=True)
class UrlSourceConfig:
    name: str
    url: str
    source_version: str
    enabled: bool = True


@dataclass(frozen=True, slots=True)
class UploadSourceConfig:
    name: str
    filename: str
    source_version: str
    enabled: bool = True


@dataclass(frozen=True, slots=True)
class FetchedBreedingSource:
    source_type: SourceType
    source_name: str
    source_version: str
    filename: str
    content: bytes


@dataclass(frozen=True, slots=True)
class StagedBreedingSource:
    directory: Path
    content_path: Path
    metadata_path: Path
    source_type: SourceType
    source_name: str
    source_version: str
    raw_content_hash: str


class BreedingDataSourceAdapter(Protocol):
    async def fetch(self) -> FetchedBreedingSource: ...


class SourceFetchSettings(Protocol):
    breeding_remote_sources_enabled: bool
    breeding_source_maximum_bytes: int
    breeding_source_timeout_seconds: float


def source_fetch_policy_from_settings(settings: SourceFetchSettings) -> SourceFetchPolicy:
    return SourceFetchPolicy(
        remote_enabled=settings.breeding_remote_sources_enabled,
        maximum_bytes=settings.breeding_source_maximum_bytes,
        timeout_seconds=settings.breeding_source_timeout_seconds,
    )


class GitHubDataSourceAdapter:
    def __init__(
        self,
        config: GitHubSourceConfig,
        *,
        policy: SourceFetchPolicy | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._config = config
        self._policy = policy or SourceFetchPolicy()
        self._http_client = http_client

    async def fetch(self) -> FetchedBreedingSource:
        _require_remote_enabled(self._config.enabled, self._policy)
        path = _safe_repository_path(self._config.path)
        segments = (
            quote(_safe_github_component(self._config.owner), safe=""),
            quote(_safe_github_component(self._config.repository), safe=""),
            quote(_safe_github_component(self._config.ref), safe=""),
            "/".join(quote(part, safe="") for part in path.parts),
        )
        url = "https://raw.githubusercontent.com/" + "/".join(segments)
        content = await _fetch_https(
            url,
            policy=self._policy,
            http_client=self._http_client,
        )
        return FetchedBreedingSource(
            source_type="github",
            source_name=_safe_name(self._config.name),
            source_version=_safe_version(self._config.ref),
            filename=_safe_filename(path.name),
            content=content,
        )


class UrlDataSourceAdapter:
    def __init__(
        self,
        config: UrlSourceConfig,
        *,
        policy: SourceFetchPolicy | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._config = config
        self._policy = policy or SourceFetchPolicy()
        self._http_client = http_client

    async def fetch(self) -> FetchedBreedingSource:
        _require_remote_enabled(self._config.enabled, self._policy)
        url = _validated_https_url(self._config.url)
        content = await _fetch_https(
            url,
            policy=self._policy,
            http_client=self._http_client,
        )
        parsed = urlparse(url)
        filename = Path(parsed.path).name or "breeding-data.json"
        return FetchedBreedingSource(
            source_type="url",
            source_name=_safe_name(self._config.name),
            source_version=_safe_version(self._config.source_version),
            filename=_safe_filename(filename),
            content=content,
        )


class UploadDataSourceAdapter:
    def __init__(
        self,
        config: UploadSourceConfig,
        content: bytes,
        *,
        policy: SourceFetchPolicy | None = None,
    ) -> None:
        self._config = config
        self._content = content
        self._policy = policy or SourceFetchPolicy()

    async def fetch(self) -> FetchedBreedingSource:
        if not self._config.enabled:
            raise _disabled_error()
        if len(self._content) > self._policy.maximum_bytes:
            raise _too_large_error()
        return FetchedBreedingSource(
            source_type="upload",
            source_name=_safe_name(self._config.name),
            source_version=_safe_version(self._config.source_version),
            filename=_safe_filename(self._config.filename),
            content=self._content,
        )


async def stage_breeding_source(
    adapter: BreedingDataSourceAdapter,
    *,
    paths: CatalogPaths,
    fetched_at: datetime | None = None,
) -> StagedBreedingSource:
    """Fetch into Agent-owned staging without importing or publishing anything."""

    source = await adapter.fetch()
    paths.ensure()
    raw_content_hash = hashlib.sha256(source.content).hexdigest()
    temporary = Path(tempfile.mkdtemp(prefix=".stage-", dir=paths.extraction_staging))
    try:
        content_path = temporary / "source.bin"
        with content_path.open("wb") as output:
            output.write(source.content)
            output.flush()
            os.fsync(output.fileno())
        metadata = StagedBreedingSourceMetadata(
            source_type=source.source_type,
            source_name=source.source_name,
            source_version=source.source_version,
            filename=source.filename,
            raw_content_hash=raw_content_hash,
            fetched_at=fetched_at or datetime.now(UTC),
        )
        write_json_atomic(temporary / "source-metadata.json", metadata.model_dump(mode="json"))
        fsync_directory(temporary)
        destination = paths.extraction_staging / f"{raw_content_hash[:16]}-{uuid4().hex}"
        os.replace(temporary, destination)
        fsync_directory(destination.parent)
        return StagedBreedingSource(
            directory=destination,
            content_path=destination / "source.bin",
            metadata_path=destination / "source-metadata.json",
            source_type=source.source_type,
            source_name=source.source_name,
            source_version=source.source_version,
            raw_content_hash=raw_content_hash,
        )
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


async def _fetch_https(
    url: str,
    *,
    policy: SourceFetchPolicy,
    http_client: httpx.AsyncClient | None,
) -> bytes:
    validated_url = _validated_https_url(url)
    try:
        if http_client is None:
            async with httpx.AsyncClient(
                timeout=policy.timeout_seconds,
                follow_redirects=False,
                trust_env=False,
            ) as client:
                return await _read_response(
                    client,
                    validated_url,
                    maximum_bytes=policy.maximum_bytes,
                    timeout_seconds=policy.timeout_seconds,
                )
        return await _read_response(
            http_client,
            validated_url,
            maximum_bytes=policy.maximum_bytes,
            timeout_seconds=policy.timeout_seconds,
        )
    except StructuredError:
        raise
    except (httpx.HTTPError, OSError) as error:
        raise StructuredError(
            code=ErrorCode.BREEDING_SOURCE_FETCH_FAILED,
            summary="The configured breeding data source could not be fetched.",
            retryable=True,
        ) from error


async def _read_response(
    client: httpx.AsyncClient,
    url: str,
    *,
    maximum_bytes: int,
    timeout_seconds: float,
) -> bytes:
    async with client.stream(
        "GET",
        url,
        headers={"accept": "application/json"},
        follow_redirects=False,
        timeout=timeout_seconds,
    ) as response:
        response.raise_for_status()
        content_length = response.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > maximum_bytes:
                    raise _too_large_error()
            except ValueError:
                pass
        chunks: list[bytes] = []
        size = 0
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > maximum_bytes:
                raise _too_large_error()
            chunks.append(chunk)
        return b"".join(chunks)


def _require_remote_enabled(enabled: bool, policy: SourceFetchPolicy) -> None:
    if not enabled or not policy.remote_enabled:
        raise _disabled_error()


def _validated_https_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname is None or parsed.username is not None:
        raise _invalid_source_error()
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise _invalid_source_error()
    return value


def _safe_repository_path(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if path.is_absolute() or not path.name or any(part in {"", ".", ".."} for part in path.parts):
        raise _invalid_source_error()
    return path


def _safe_github_component(value: str) -> str:
    if not value or len(value) > 200 or value in {".", ".."} or "/" in value or "\\" in value:
        raise _invalid_source_error()
    return value


def _safe_name(value: str) -> str:
    stripped = value.strip()
    if not 1 <= len(stripped) <= 120:
        raise _invalid_source_error()
    return stripped


def _safe_version(value: str) -> str:
    stripped = value.strip()
    if not 1 <= len(stripped) <= 120:
        raise _invalid_source_error()
    return stripped


def _safe_filename(value: str) -> str:
    if not value or len(value) > 255 or Path(value).name != value or value in {".", ".."}:
        raise _invalid_source_error()
    return value


def _disabled_error() -> StructuredError:
    return StructuredError(
        code=ErrorCode.BREEDING_SOURCE_DISABLED,
        summary="The configured breeding data source is disabled.",
        retryable=False,
    )


def _invalid_source_error() -> StructuredError:
    return StructuredError(
        code=ErrorCode.BREEDING_SOURCE_INVALID,
        summary="The breeding data source configuration is invalid.",
        retryable=False,
    )


def _too_large_error() -> StructuredError:
    return StructuredError(
        code=ErrorCode.BREEDING_SOURCE_TOO_LARGE,
        summary="The breeding data source exceeds the configured byte limit.",
        retryable=False,
    )
