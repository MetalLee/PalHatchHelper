from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.save_sync.retention import SnapshotRecord, SnapshotRetention


def _directory(path: Path) -> Path:
    path.mkdir(parents=True)
    (path / "fixture").write_text("safe", encoding="utf-8")
    return path


def test_retention_keeps_three_successes_and_one_recent_failure(tmp_path: Path) -> None:
    root = tmp_path / "snapshots"
    now = datetime(2026, 7, 14, 12, tzinfo=UTC)
    successes = [
        SnapshotRecord(
            _directory(root / f"success-{index}"),
            "success",
            now - timedelta(hours=index),
        )
        for index in range(5)
    ]
    failures = [
        SnapshotRecord(_directory(root / "failure-recent"), "failed", now - timedelta(hours=1)),
        SnapshotRecord(_directory(root / "failure-second"), "failed", now - timedelta(hours=2)),
        SnapshotRecord(_directory(root / "failure-old"), "failed", now - timedelta(hours=25)),
    ]

    removed = SnapshotRetention(root).cleanup([*successes, *failures], now=now)

    assert {path.name for path in removed} == {
        "success-3",
        "success-4",
        "failure-second",
        "failure-old",
    }
    assert {path.name for path in root.iterdir()} == {
        "success-0",
        "success-1",
        "success-2",
        "failure-recent",
    }


def test_cleanup_cannot_cross_the_configured_snapshot_root(tmp_path: Path) -> None:
    root = tmp_path / "snapshots"
    root.mkdir()
    outside = _directory(tmp_path / "outside")
    record = SnapshotRecord(outside, "failed", datetime(2026, 7, 13, tzinfo=UTC))

    with pytest.raises(StructuredError) as caught:
        SnapshotRetention(root).cleanup([record], now=datetime(2026, 7, 14, tzinfo=UTC))

    assert caught.value.code is ErrorCode.SNAPSHOT_CLEANUP_UNSAFE
    assert (outside / "fixture").read_text(encoding="utf-8") == "safe"
