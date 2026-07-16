import asyncio
import gzip
import io
import json
import shutil
import tarfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import httpx
import pytest
from pydantic import SecretStr

from pal_hatch_helper.game_catalog.artifacts import (
    ARTIFACT_FILENAMES,
    SupabaseCatalogArtifactStore,
    create_catalog_bundle,
    extract_catalog_bundle_atomic,
)
from pal_hatch_helper.game_catalog.importer import prepare_normalized_catalog
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.game_catalog.repository import (
    InMemoryCatalogMetadataStore,
    LayeredGameCatalogRepository,
)
from pal_hatch_helper.game_catalog.validation import (
    load_catalog_directory,
    validate_catalog_directory,
)
from pal_hatch_helper.generated import GameDataVersion
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

VERSION_ID = UUID("71000000-0000-4000-8000-000000000001")


def fixture_directory() -> Path:
    return Path(__file__).parents[4] / "data" / "catalog-fixtures" / "minimal-valid"


def fixture_root() -> Path:
    return fixture_directory().parent


def version_metadata(*, schema_version: str = "1.0.0") -> GameDataVersion:
    return GameDataVersion(
        id=VERSION_ID,
        game_build_id="fixture-build",
        game_version="fixture-version",
        package_hash="e" * 64,
        content_hash="471a576b1660288347e76a45bd1d48a60366517dbd390b4ccdb30416712a389f",
        schema_version=schema_version,
        extractor_name="fixture-extractor",
        extractor_version="1.0.0",
        artifact_bucket="game-catalog-artifacts",
        artifact_path=(
            "versions/471a576b1660288347e76a45bd1d48a60366517dbd390b4ccdb30416712a389f/"
            "catalog.tar.gz"
        ),
        status="published",
        imported_at=datetime(2026, 7, 14, tzinfo=UTC),
        validated_at=datetime(2026, 7, 14, tzinfo=UTC),
        published_at=datetime(2026, 7, 14, tzinfo=UTC),
    )


def test_manifest_count_and_file_hash_mismatches_are_rejected(tmp_path: Path) -> None:
    copied = tmp_path / "catalog"
    shutil.copytree(fixture_directory(), copied)
    manifest_path = copied / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["counts"]["pals"] = 99
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    report = validate_catalog_directory(copied)

    assert not report.valid
    assert "CATALOG_MANIFEST_COUNT_MISMATCH" in report.errors

    shutil.copyfile(fixture_directory() / "manifest.json", manifest_path)
    pals_path = copied / "pals.jsonl"
    pals_path.write_text(
        pals_path.read_text(encoding="utf-8").replace('"rarity":2', '"rarity":3'),
        encoding="utf-8",
    )
    report = validate_catalog_directory(copied)
    assert ErrorCode.GAME_DATA_HASH_MISMATCH.value in report.errors


def test_named_invalid_fixtures_fail_for_their_intended_reason() -> None:
    assert (
        ErrorCode.GAME_DATA_HASH_MISMATCH.value
        in validate_catalog_directory(fixture_root() / "invalid-hash").errors
    )
    assert (
        "CATALOG_REFERENCE_INVALID"
        in validate_catalog_directory(
            fixture_root() / "invalid-reference", require_manifest=False
        ).errors
    )
    assert (
        "CATALOG_DUPLICATE_ID"
        in validate_catalog_directory(
            fixture_root() / "duplicate-id", require_manifest=False
        ).errors
    )


def test_bundle_round_trip_and_exact_repository_cache_rebuild(tmp_path: Path) -> None:
    paths = CatalogPaths(tmp_path)
    paths.ensure()
    metadata = version_metadata()
    normalized = paths.normalized / metadata.content_hash
    shutil.copytree(fixture_directory(), normalized)
    repository = LayeredGameCatalogRepository(
        paths=paths,
        metadata_store=InMemoryCatalogMetadataStore((metadata,)),
        artifact_store=_MissingArtifactStore(),
    )

    async def scenario() -> None:
        loaded = await repository.load_version(VERSION_ID)
        assert loaded.content_hash == metadata.content_hash
        assert (paths.cache / f"{VERSION_ID}.sqlite").is_file()

        (paths.cache / f"{VERSION_ID}.sqlite").write_bytes(b"corrupted")
        fresh_repository = LayeredGameCatalogRepository(
            paths=paths,
            metadata_store=InMemoryCatalogMetadataStore((metadata,)),
            artifact_store=_MissingArtifactStore(),
        )
        rebuilt = await fresh_repository.load_version(VERSION_ID)
        assert rebuilt.pals[0].pal_id == "fixture-pal-a"

    asyncio.run(scenario())

    bundle = create_catalog_bundle(fixture_directory())
    assert bundle == create_catalog_bundle(fixture_directory())
    destination = tmp_path / "unpacked"
    extract_catalog_bundle_atomic(bundle, destination)
    assert load_catalog_directory(destination).content_hash == metadata.content_hash


@pytest.mark.parametrize("unsafe_type", ("duplicate", "symlink", "hardlink", "device"))
def test_bundle_extraction_rejects_duplicate_and_non_regular_members(
    tmp_path: Path, unsafe_type: str
) -> None:
    uncompressed = io.BytesIO()
    with tarfile.open(fileobj=uncompressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for position, filename in enumerate(sorted(ARTIFACT_FILENAMES)):
            payload = (fixture_directory() / filename).read_bytes()
            info = tarfile.TarInfo(filename)
            info.size = len(payload)
            if position == 0 and unsafe_type != "duplicate":
                info.size = 0
                if unsafe_type == "symlink":
                    info.type = tarfile.SYMTYPE
                    info.linkname = "manifest.json"
                elif unsafe_type == "hardlink":
                    info.type = tarfile.LNKTYPE
                    info.linkname = "manifest.json"
                else:
                    info.type = tarfile.CHRTYPE
                    info.devmajor = 1
                    info.devminor = 3
                archive.addfile(info)
            else:
                archive.addfile(info, io.BytesIO(payload))
        if unsafe_type == "duplicate":
            duplicate = tarfile.TarInfo("manifest.json")
            duplicate.size = 3
            archive.addfile(duplicate, io.BytesIO(b"{}\n"))
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb", mtime=0) as output:
        output.write(uncompressed.getvalue())

    with pytest.raises(StructuredError) as caught:
        extract_catalog_bundle_atomic(compressed.getvalue(), tmp_path / "unsafe")

    assert caught.value.code is ErrorCode.GAME_DATA_VALIDATION_FAILED


def test_repository_stops_on_unsupported_requested_schema(tmp_path: Path) -> None:
    paths = CatalogPaths(tmp_path)
    paths.ensure()
    repository = LayeredGameCatalogRepository(
        paths=paths,
        metadata_store=InMemoryCatalogMetadataStore((version_metadata(schema_version="9.0.0"),)),
        artifact_store=_MissingArtifactStore(),
    )

    async def scenario() -> None:
        with pytest.raises(StructuredError) as caught:
            await repository.load_version(VERSION_ID)
        assert caught.value.code is ErrorCode.GAME_DATA_SCHEMA_UNSUPPORTED

    asyncio.run(scenario())


def test_prepare_normalized_catalog_is_content_idempotent_and_atomic(tmp_path: Path) -> None:
    paths = CatalogPaths(tmp_path / "data")

    first = prepare_normalized_catalog(
        fixture_directory(),
        paths=paths,
        game_build_id="fixture-build",
        game_version="fixture-version",
        package_hash="e" * 64,
        extractor_name="fixture-extractor",
        extractor_version="1.0.0",
        created_at=datetime(2026, 7, 14, tzinfo=UTC),
    )
    second = prepare_normalized_catalog(
        fixture_directory(),
        paths=paths,
        game_build_id="fixture-build",
        game_version="fixture-version",
        package_hash="e" * 64,
        extractor_name="fixture-extractor",
        extractor_version="1.0.0",
        created_at=datetime(2026, 7, 15, tzinfo=UTC),
    )

    assert first == second
    assert first.name == version_metadata().content_hash
    assert not list(paths.normalized.glob(".normalize.*"))


def test_supabase_artifact_store_uses_private_object_path_and_redacts_failures() -> None:
    service_role = "fixture-service-role-secret-that-must-not-leak"
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "HEAD":
            return httpx.Response(200)
        if request.method == "GET":
            return httpx.Response(200, content=b"fixture")
        return httpx.Response(200, json={"Key": "fixture"})

    async def scenario() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            store = SupabaseCatalogArtifactStore(
                base_url="https://example.supabase.co",
                service_role_key=SecretStr(service_role),
                bucket="game-catalog-artifacts",
                http_client=client,
            )
            await store.put_version_bundle("a" * 64, b"fixture")
            await store.put_version_metadata("a" * 64, b"{}\n", b"{}\n")
            assert await store.exists("a" * 64)
            assert await store.get_version_bundle("a" * 64) == b"fixture"

    asyncio.run(scenario())
    assert all("game-catalog-artifacts/versions/" in str(request.url) for request in requests)
    assert all(request.headers["authorization"] == f"Bearer {service_role}" for request in requests)


def test_supabase_artifact_store_treats_wrapped_duplicate_as_idempotent() -> None:
    responses = iter(
        (
            httpx.Response(
                400,
                json={
                    "statusCode": "409",
                    "error": "Duplicate",
                    "message": "The resource already exists",
                },
            ),
            httpx.Response(400, json={"message": "invalid object"}),
        )
    )

    async def scenario() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: next(responses))
        ) as client:
            store = SupabaseCatalogArtifactStore(
                base_url="https://example.supabase.co",
                service_role_key=SecretStr("fixture-secret"),
                bucket="game-catalog-artifacts",
                http_client=client,
            )
            await store.put_version_bundle("a" * 64, b"fixture")
            with pytest.raises(StructuredError) as caught:
                await store.put_version_bundle("b" * 64, b"fixture")
            assert caught.value.code is ErrorCode.GAME_DATA_IMPORT_REJECTED

    asyncio.run(scenario())


class _MissingArtifactStore:
    async def put_version_bundle(self, content_hash: str, bundle: bytes) -> None:
        raise AssertionError((content_hash, bundle))

    async def get_version_bundle(self, content_hash: str) -> bytes:
        raise AssertionError(content_hash)

    async def put_version_metadata(
        self, content_hash: str, manifest: bytes, validation_report: bytes
    ) -> None:
        raise AssertionError((content_hash, manifest, validation_report))

    async def exists(self, content_hash: str) -> bool:
        return False
