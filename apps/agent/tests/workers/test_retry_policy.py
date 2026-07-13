from pal_hatch_helper.workers.retry import RetryPolicy


def test_exponential_backoff_is_bounded_and_resets() -> None:
    policy = RetryPolicy(
        initial_delay_seconds=1,
        maximum_delay_seconds=4,
        multiplier=2,
        jitter_ratio=0,
    )

    assert [policy.next_delay() for _ in range(5)] == [1, 2, 4, 4, 4]

    policy.reset()

    assert policy.next_delay() == 1
