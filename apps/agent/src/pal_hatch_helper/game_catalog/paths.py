import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class CatalogPaths:
    data_dir: Path

    @property
    def root(self) -> Path:
        return self.data_dir / "game-catalog"

    @property
    def extraction_staging(self) -> Path:
        return self.root / "extraction" / "staging"

    @property
    def extraction_raw(self) -> Path:
        return self.root / "extraction" / "raw"

    @property
    def extraction_failed(self) -> Path:
        return self.root / "extraction" / "failed"

    @property
    def normalized(self) -> Path:
        return self.root / "normalized"

    @property
    def bundles(self) -> Path:
        return self.root / "bundles"

    @property
    def cache(self) -> Path:
        return self.root / "cache"

    @property
    def runtime(self) -> Path:
        return self.root / "runtime"

    def ensure(self) -> None:
        for directory in (
            self.extraction_staging,
            self.extraction_raw,
            self.extraction_failed,
            self.normalized,
            self.bundles,
            self.cache,
            self.runtime,
        ):
            directory.mkdir(parents=True, exist_ok=True)


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
