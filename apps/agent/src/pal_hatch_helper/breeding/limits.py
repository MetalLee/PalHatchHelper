from collections.abc import Callable
from dataclasses import dataclass, field

from pal_hatch_helper.generated import BreedingSearchLimit


@dataclass(eq=False, slots=True)
class SearchStopped(Exception):
    limit: BreedingSearchLimit


@dataclass(slots=True)
class SearchBudget:
    max_expanded_nodes: int
    timeout_ms: int
    clock: Callable[[], float]
    expanded_species_nodes: int = 0
    expanded_assignment_nodes: int = 0
    _started_at: float = field(init=False)
    _hit_limits: set[BreedingSearchLimit] = field(default_factory=set, init=False)

    def __post_init__(self) -> None:
        self._started_at = self.clock()

    @property
    def expanded_nodes(self) -> int:
        return self.expanded_species_nodes + self.expanded_assignment_nodes

    @property
    def hit_limits(self) -> tuple[BreedingSearchLimit, ...]:
        return tuple(sorted(self._hit_limits, key=lambda item: item.value))

    def consume_species(self) -> None:
        self._consume("species")

    def consume_assignment(self) -> None:
        self._consume("assignment")

    def mark_limit(self, limit: BreedingSearchLimit) -> None:
        self._hit_limits.add(limit)

    def check_time(self) -> None:
        if (self.clock() - self._started_at) * 1000 >= self.timeout_ms:
            self._stop(BreedingSearchLimit.TIMEOUT)

    def _consume(self, kind: str) -> None:
        self.check_time()
        if self.expanded_nodes >= self.max_expanded_nodes:
            self._stop(BreedingSearchLimit.MAX_EXPANDED_NODES)
        if kind == "species":
            self.expanded_species_nodes += 1
        else:
            self.expanded_assignment_nodes += 1

    def _stop(self, limit: BreedingSearchLimit) -> None:
        self._hit_limits.add(limit)
        raise SearchStopped(limit)
