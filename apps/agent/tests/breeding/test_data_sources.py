import asyncio
import hashlib
import json
from pathlib import Path

import httpx
import pytest

from pal_hatch_helper.breeding.data_sources import (
    GitHubDataSourceAdapter,
    GitHubSourceConfig,
    SourceFetchPolicy,
    UploadDataSourceAdapter,
    UploadSourceConfig,
    UrlDataSourceAdapter,
    UrlSourceConfig,
    source_fetch_policy_from_settings,
    stage_breeding_source,
)
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.settings import Settings

FIXTURE_CONTENT = b'{"recipes":[],"source_version":"fixture-v1"}\n'


def test_runtime_settings_build_the_remote_source_policy() -> None:
    policy = source_fetch_policy_from_settings(
        Settings(
            breeding_remote_sources_enabled=True,
            breeding_source_timeout_seconds=12,
            breeding_source_maximum_bytes=4096,
        )
    )

    assert policy == SourceFetchPolicy(
        remote_enabled=True,
        timeout_seconds=12,
        maximum_bytes=4096,
    )


def test_upload_content_is_atomically_staged_with_raw_hash_and_source_version(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        paths = CatalogPaths(tmp_path)
        artifact = await stage_breeding_source(
            UploadDataSourceAdapter(
                UploadSourceConfig(
                    name="fixture-upload",
                    filename="recipes.json",
                    source_version="fixture-v1",
                ),
                FIXTURE_CONTENT,
            ),
            paths=paths,
        )

        expected_hash = hashlib.sha256(FIXTURE_CONTENT).hexdigest()
        assert artifact.raw_content_hash == expected_hash
        assert artifact.source_version == "fixture-v1"
        assert artifact.content_path.read_bytes() == FIXTURE_CONTENT
        assert artifact.directory.parent == paths.extraction_staging
        assert not list(paths.extraction_staging.glob(".stage-*"))

        metadata = json.loads(artifact.metadata_path.read_text(encoding="utf-8"))
        assert metadata["raw_content_hash"] == expected_hash
        assert metadata["source_type"] == "upload"
        assert metadata["source_version"] == "fixture-v1"

    asyncio.run(scenario())


def test_remote_sources_are_disabled_by_default_without_making_a_request(
    tmp_path: Path,
) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=FIXTURE_CONTENT)

    async def scenario() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = UrlDataSourceAdapter(
                UrlSourceConfig(
                    name="disabled-url",
                    url="https://fixtures.example/recipes.json",
                    source_version="fixture-v1",
                ),
                policy=SourceFetchPolicy(),
                http_client=client,
            )
            with pytest.raises(StructuredError) as caught:
                await stage_breeding_source(adapter, paths=CatalogPaths(tmp_path))

        assert caught.value.code is ErrorCode.BREEDING_SOURCE_DISABLED
        assert requests == []

    asyncio.run(scenario())


def test_github_and_url_adapters_use_configured_https_sources_without_external_network(
    tmp_path: Path,
) -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return httpx.Response(200, content=FIXTURE_CONTENT, headers={"etag": '"fixture-etag"'})

    async def scenario() -> None:
        policy = SourceFetchPolicy(remote_enabled=True, maximum_bytes=1024)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            github = GitHubDataSourceAdapter(
                GitHubSourceConfig(
                    name="fixture-github",
                    owner="fixture-owner",
                    repository="fixture-repository",
                    ref="fixture-commit",
                    path="data/recipes.json",
                ),
                policy=policy,
                http_client=client,
            )
            url = UrlDataSourceAdapter(
                UrlSourceConfig(
                    name="fixture-url",
                    url="https://fixtures.example/recipes.json",
                    source_version="fixture-release",
                ),
                policy=policy,
                http_client=client,
            )
            github_artifact = await stage_breeding_source(
                github,
                paths=CatalogPaths(tmp_path / "github"),
            )
            url_artifact = await stage_breeding_source(
                url,
                paths=CatalogPaths(tmp_path / "url"),
            )

        assert github_artifact.source_version == "fixture-commit"
        assert url_artifact.source_version == "fixture-release"

    asyncio.run(scenario())
    assert requested_urls == [
        "https://raw.githubusercontent.com/fixture-owner/fixture-repository/fixture-commit/data/recipes.json",
        "https://fixtures.example/recipes.json",
    ]
