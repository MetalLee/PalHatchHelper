import random
from dataclasses import dataclass, field


@dataclass(slots=True)
class RetryPolicy:
    initial_delay_seconds: float = 1
    maximum_delay_seconds: float = 30
    multiplier: float = 2
    jitter_ratio: float = 0.2
    random_source: random.Random = field(default_factory=random.Random, repr=False)
    _failure_count: int = field(default=0, init=False, repr=False)

    def __post_init__(self) -> None:
        if self.initial_delay_seconds <= 0:
            raise ValueError("initial_delay_seconds must be positive")
        if self.maximum_delay_seconds < self.initial_delay_seconds:
            raise ValueError("maximum_delay_seconds must not be smaller than initial delay")
        if self.multiplier < 1:
            raise ValueError("multiplier must be at least one")
        if not 0 <= self.jitter_ratio <= 1:
            raise ValueError("jitter_ratio must be between zero and one")

    def next_delay(self) -> float:
        base_delay = min(
            self.maximum_delay_seconds,
            self.initial_delay_seconds * self.multiplier**self._failure_count,
        )
        self._failure_count += 1
        if self.jitter_ratio == 0:
            return base_delay
        jitter = base_delay * self.jitter_ratio
        return max(0, base_delay + self.random_source.uniform(-jitter, jitter))

    def reset(self) -> None:
        self._failure_count = 0
