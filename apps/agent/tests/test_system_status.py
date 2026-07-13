import json
from datetime import UTC, datetime
from pathlib import Path

from jsonschema import Draft202012Validator

from pal_hatch_helper.models.system_status import (
    ReadinessStatus,
    ServiceStatus,
    SystemStatus,
)


def test_system_status_matches_shared_json_schema() -> None:
    status = SystemStatus(
        status=ServiceStatus.OK,
        service="agent",
        version="0.0.0",
        timestamp=datetime.now(UTC),
    )
    schema_path = (
        Path(__file__).parents[3]
        / "packages"
        / "contracts"
        / "schema"
        / "system-status.schema.json"
    )
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    Draft202012Validator(schema).validate(status.model_dump(mode="json"))
    assert status.timestamp.tzinfo is UTC


def test_readiness_status_matches_shared_json_schema() -> None:
    status = ReadinessStatus(
        status=ServiceStatus.NOT_READY,
        service="agent",
        version="0.0.0",
        timestamp=datetime.now(UTC),
        error_code="configuration_invalid",
    )
    schema_path = (
        Path(__file__).parents[3]
        / "packages"
        / "contracts"
        / "schema"
        / "readiness-status.schema.json"
    )
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    Draft202012Validator(schema).validate(status.model_dump(mode="json"))
