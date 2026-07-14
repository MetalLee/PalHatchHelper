"""ParserAdapter contracts and controlled subprocess adapters."""

from pal_hatch_helper.parsers.adapter import (
    CompatibilityResult,
    ParserAdapter,
    ParserResult,
)
from pal_hatch_helper.parsers.subprocess import SubprocessParserAdapter

__all__ = [
    "CompatibilityResult",
    "ParserAdapter",
    "ParserResult",
    "SubprocessParserAdapter",
]
