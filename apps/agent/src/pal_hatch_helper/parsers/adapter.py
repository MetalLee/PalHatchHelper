from pathlib import Path, PurePosixPath
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict

from pal_hatch_helper.repositories.database import JSONValue


class CompatibilityResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    compatible: bool
    reason_code: str | None


class ParserResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    output_path: Path
    payload: dict[str, JSONValue]
    duration_seconds: float = 0


@runtime_checkable
class ParserAdapter(Protocol):
    name: str
    version: str

    def required_files(self) -> tuple[PurePosixPath, ...]: ...

    def detect_compatibility(self, snapshot_path: Path) -> CompatibilityResult: ...

    def parse(self, snapshot_path: Path, output_path: Path) -> ParserResult: ...
