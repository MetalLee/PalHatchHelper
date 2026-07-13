from datetime import UTC, datetime, timedelta

from pal_hatch_helper.repositories.jobs import JobRepository


class StaleJobReaper:
    def __init__(
        self,
        *,
        repository: JobRepository,
        lease_timeout_seconds: float,
    ) -> None:
        self._repository = repository
        self._lease_timeout = timedelta(seconds=lease_timeout_seconds)

    async def reap(self) -> int:
        stale_before = datetime.now(UTC) - self._lease_timeout
        return await self._repository.release_stale(stale_before)
