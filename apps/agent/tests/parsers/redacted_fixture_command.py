from __future__ import annotations

import json
import sys
from collections.abc import Sequence
from pathlib import Path


def _read_object(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ValueError(f"{path.name} must contain a JSON object")
    return value


def _required(value: dict[str, object], key: str) -> object:
    if key not in value:
        raise ValueError(f"missing required fixture field: {key}")
    return value[key]


def main(argv: Sequence[str] | None = None) -> int:
    arguments = tuple(sys.argv[1:] if argv is None else argv)
    if len(arguments) != 2:
        return 2
    snapshot_path = Path(arguments[0])
    output_path = Path(arguments[1])
    world = _read_object(snapshot_path / "World.sav")
    player = _read_object(snapshot_path / "Players" / "0001.sav")
    canonical = {
        "server": _required(world, "server"),
        "guilds": _required(world, "guilds"),
        "players": [_required(player, "player")],
        "pals": _required(player, "pals"),
    }
    output_path.write_text(
        json.dumps(canonical, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
