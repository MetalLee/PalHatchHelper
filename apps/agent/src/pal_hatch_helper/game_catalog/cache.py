import os
import sqlite3
import tempfile
from pathlib import Path
from uuid import UUID

from pydantic import ValidationError

from pal_hatch_helper.game_catalog.jsonl import canonical_json
from pal_hatch_helper.game_catalog.models import LoadedGameCatalog
from pal_hatch_helper.game_catalog.paths import fsync_directory
from pal_hatch_helper.generated import (
    CatalogActiveSkill,
    CatalogBreedingRecipe,
    CatalogLocalization,
    CatalogPal,
    CatalogPalActiveSkill,
    CatalogPartnerSkill,
    CatalogPassiveSkill,
    GameCatalogManifest,
)

_RECORD_TABLES = (
    ("pals", CatalogPal, "pals"),
    ("passive_skills", CatalogPassiveSkill, "passive_skills"),
    ("active_skills", CatalogActiveSkill, "active_skills"),
    ("pal_active_skills", CatalogPalActiveSkill, "pal_active_skills"),
    ("partner_skills", CatalogPartnerSkill, "partner_skills"),
    ("breeding_recipes", CatalogBreedingRecipe, "breeding_recipes"),
    ("localizations", CatalogLocalization, "localizations"),
)


class CatalogSQLiteCache:
    def __init__(self, root: Path) -> None:
        self._root = root

    def path_for(self, version_id: UUID) -> Path:
        return self._root / f"{version_id}.sqlite"

    def build(self, version_id: UUID, catalog: LoadedGameCatalog) -> Path:
        self._root.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{version_id}.", suffix=".tmp", dir=self._root
        )
        os.close(descriptor)
        temporary = Path(temporary_name)
        try:
            connection = sqlite3.connect(temporary)
            try:
                connection.executescript(
                    """
                    pragma journal_mode=off;
                    pragma synchronous=full;
                    create table metadata (
                      version_id text primary key,
                      content_hash text not null,
                      schema_version text not null,
                      manifest_json text not null
                    );
                    create table pals (pal_id text primary key, payload text not null);
                    create table passive_skills (
                      passive_skill_id text primary key,
                      rank integer not null,
                      payload text not null
                    );
                    create table active_skills (
                      active_skill_id text primary key,
                      payload text not null
                    );
                    create table pal_active_skills (
                      pal_id text not null,
                      active_skill_id text not null,
                      learn_level integer not null,
                      payload text not null,
                      primary key (pal_id, active_skill_id, learn_level)
                    );
                    create table partner_skills (
                      partner_skill_id text primary key,
                      payload text not null
                    );
                    create table breeding_recipes (
                      parent_a_pal_id text not null,
                      parent_a_gender text not null,
                      parent_b_pal_id text not null,
                      parent_b_gender text not null,
                      recipe_type text not null,
                      payload text not null,
                      primary key (
                        parent_a_pal_id,
                        parent_a_gender,
                        parent_b_pal_id,
                        parent_b_gender,
                        recipe_type
                      )
                    );
                    create table localizations (
                      locale text not null,
                      text_key text not null,
                      payload text not null,
                      primary key (locale, text_key)
                    );
                    create index breeding_parent_pair_idx
                      on breeding_recipes(parent_a_pal_id, parent_b_pal_id);
                    create index passive_rank_idx on passive_skills(passive_skill_id, rank);
                    create index pal_active_pal_idx on pal_active_skills(pal_id, active_skill_id);
                    """
                )
                connection.execute(
                    "insert into metadata values (?, ?, ?, ?)",
                    (
                        str(version_id),
                        catalog.content_hash,
                        catalog.schema_version,
                        canonical_json(catalog.manifest.model_dump(mode="json")),
                    ),
                )
                self._insert_records(connection, catalog)
                connection.commit()
            finally:
                connection.close()
            with temporary.open("rb") as cache_file:
                os.fsync(cache_file.fileno())
            destination = self.path_for(version_id)
            os.replace(temporary, destination)
            fsync_directory(destination.parent)
            return destination
        finally:
            temporary.unlink(missing_ok=True)

    def load(
        self,
        version_id: UUID,
        *,
        expected_content_hash: str,
        schema_version: str,
    ) -> LoadedGameCatalog | None:
        path = self.path_for(version_id)
        if not path.is_file():
            return None
        try:
            uri = f"file:{path.as_posix()}?mode=ro&immutable=1"
            connection = sqlite3.connect(uri, uri=True)
            try:
                metadata = connection.execute(
                    "select version_id, content_hash, schema_version, manifest_json from metadata"
                ).fetchone()
                if metadata is None or metadata[:3] != (
                    str(version_id),
                    expected_content_hash,
                    schema_version,
                ):
                    raise sqlite3.DatabaseError("catalog cache metadata mismatch")
                manifest = GameCatalogManifest.model_validate_json(metadata[3])
                values: dict[str, tuple[object, ...]] = {}
                for table, model, attribute in _RECORD_TABLES:
                    rows = connection.execute(
                        f"select payload from {table} order by rowid"
                    ).fetchall()
                    values[attribute] = tuple(model.model_validate_json(row[0]) for row in rows)
            finally:
                connection.close()
            return LoadedGameCatalog(
                manifest=manifest,
                pals=tuple(CatalogPal.model_validate(item) for item in values["pals"]),
                passive_skills=tuple(
                    CatalogPassiveSkill.model_validate(item) for item in values["passive_skills"]
                ),
                active_skills=tuple(
                    CatalogActiveSkill.model_validate(item) for item in values["active_skills"]
                ),
                pal_active_skills=tuple(
                    CatalogPalActiveSkill.model_validate(item)
                    for item in values["pal_active_skills"]
                ),
                partner_skills=tuple(
                    CatalogPartnerSkill.model_validate(item) for item in values["partner_skills"]
                ),
                breeding_recipes=tuple(
                    CatalogBreedingRecipe.model_validate(item)
                    for item in values["breeding_recipes"]
                ),
                localizations=tuple(
                    CatalogLocalization.model_validate(item) for item in values["localizations"]
                ),
            )
        except (OSError, sqlite3.DatabaseError, ValidationError, KeyError, TypeError):
            path.unlink(missing_ok=True)
            return None

    def discard(self, version_id: UUID) -> None:
        self.path_for(version_id).unlink(missing_ok=True)

    @staticmethod
    def _insert_records(connection: sqlite3.Connection, catalog: LoadedGameCatalog) -> None:
        connection.executemany(
            "insert into pals values (?, ?)",
            ((item.pal_id, canonical_json(item.model_dump(mode="json"))) for item in catalog.pals),
        )
        connection.executemany(
            "insert into passive_skills values (?, ?, ?)",
            (
                (item.passive_skill_id, item.rank, canonical_json(item.model_dump(mode="json")))
                for item in catalog.passive_skills
            ),
        )
        connection.executemany(
            "insert into active_skills values (?, ?)",
            (
                (item.active_skill_id, canonical_json(item.model_dump(mode="json")))
                for item in catalog.active_skills
            ),
        )
        connection.executemany(
            "insert into pal_active_skills values (?, ?, ?, ?)",
            (
                (
                    item.pal_id,
                    item.active_skill_id,
                    item.learn_level,
                    canonical_json(item.model_dump(mode="json")),
                )
                for item in catalog.pal_active_skills
            ),
        )
        connection.executemany(
            "insert into partner_skills values (?, ?)",
            (
                (item.partner_skill_id, canonical_json(item.model_dump(mode="json")))
                for item in catalog.partner_skills
            ),
        )
        connection.executemany(
            "insert into breeding_recipes values (?, ?, ?, ?, ?, ?)",
            (
                (
                    item.parent_a_pal_id,
                    item.parent_a_gender,
                    item.parent_b_pal_id,
                    item.parent_b_gender,
                    item.recipe_type,
                    canonical_json(item.model_dump(mode="json")),
                )
                for item in catalog.breeding_recipes
            ),
        )
        connection.executemany(
            "insert into localizations values (?, ?, ?)",
            (
                (item.locale, item.text_key, canonical_json(item.model_dump(mode="json")))
                for item in catalog.localizations
            ),
        )
