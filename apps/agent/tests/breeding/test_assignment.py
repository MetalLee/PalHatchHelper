from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine

from .factories import (
    GUILD_ID,
    OTHER_GUILD_ID,
    OTHER_PLAYER_ID,
    inventory_pal,
    recipe,
    request,
    search,
)


def test_distributed_passives_are_carried_through_the_required_intermediate() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("a-m", "pal-a", "male", passives=("p1",)),
                inventory_pal("b-f", "pal-b", "female", passives=("p2",)),
                inventory_pal("c-m", "pal-c", "male", passives=("p3", "p4")),
            ),
            desired_passive_ids=("p1", "p2", "p3", "p4"),
        ),
        (
            recipe("pal-a", "pal-b", "pal-mid"),
            recipe("pal-c", "pal-mid", "pal-target"),
        ),
    )

    assert result.routes
    steps = result.routes[0].steps
    assert steps[0].child_pal_id == "pal-mid"
    assert set(steps[0].required_passive_ids) == {"p1", "p2"}
    assert steps[0].child_required_gender == "female"
    assert set(steps[1].required_passive_ids) == {"p1", "p2", "p3", "p4"}


def test_extra_non_target_passives_increase_the_strategy_cost() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("a-exact", "pal-a", "male", passives=("wanted-a",)),
                inventory_pal(
                    "a-noisy",
                    "pal-a",
                    "male",
                    passives=("wanted-a", "junk-a", "junk-b"),
                ),
                inventory_pal("b-f", "pal-b", "female", passives=("wanted-b",)),
            ),
            desired_passive_ids=("wanted-a", "wanted-b"),
        ),
        (recipe("pal-a", "pal-b", "pal-target"),),
    )

    by_parent = {
        next(
            source.instance_uid
            for source in (route.steps[0].parent_a, route.steps[0].parent_b)
            if source.pal_id == "pal-a"
        ): route
        for route in result.routes
    }
    exact = by_parent["a-exact"]
    noisy = by_parent["a-noisy"]
    assert exact.estimated_attempts_max < noisy.estimated_attempts_max
    assert (
        exact.score_breakdown.raw_metrics.extra_passive_count
        < noisy.score_breakdown.raw_metrics.extra_passive_count
    )


def test_inventory_filtering_keeps_owned_and_enabled_guild_shared_instances_only() -> None:
    inventory = (
        inventory_pal("own-m", "pal-own", "male", share_enabled=False),
        inventory_pal(
            "shared-good-f",
            "pal-shared",
            "female",
            owner_player_id=OTHER_PLAYER_ID,
        ),
        inventory_pal(
            "shared-off-f",
            "pal-shared",
            "female",
            owner_player_id=OTHER_PLAYER_ID,
            share_enabled=False,
        ),
        inventory_pal(
            "other-guild-f",
            "pal-shared",
            "female",
            owner_player_id=OTHER_PLAYER_ID,
            guild_id=OTHER_GUILD_ID,
        ),
        inventory_pal(
            "unresolved-f",
            "pal-shared",
            "female",
            owner_player_id=OTHER_PLAYER_ID,
            owner_resolved=False,
        ),
        inventory_pal(
            "disappeared-f",
            "pal-shared",
            "female",
            owner_player_id=OTHER_PLAYER_ID,
            present_in_snapshot=False,
        ),
        inventory_pal(
            "disabled-f",
            "pal-shared",
            "female",
            owner_player_id=OTHER_PLAYER_ID,
            breeding_enabled=False,
        ),
        inventory_pal(
            "locked-f",
            "pal-shared",
            "female",
            owner_player_id=OTHER_PLAYER_ID,
            plan_locked=True,
        ),
    )
    engine = DeterministicBreedingEngine()
    result = search(
        engine,
        request("pal-target", inventory),
        (recipe("pal-own", "pal-shared", "pal-target"),),
    )

    assert result.routes
    assigned_uids = {
        result.routes[0].steps[0].parent_a.instance_uid,
        result.routes[0].steps[0].parent_b.instance_uid,
    }
    assert assigned_uids == {"own-m", "shared-good-f"}
    assert result.routes[0].borrowed_pal_count == 1
    exclusions = {item.reason.value: item.count for item in result.diagnostics.exclusions}
    assert exclusions == {
        "different_guild": 1,
        "disabled": 1,
        "disappeared": 1,
        "locked": 1,
        "share_disabled": 1,
        "unresolved": 1,
    }

    shared_disabled = search(
        engine,
        request("pal-target", inventory, allow_shared_inventory=False),
        (recipe("pal-own", "pal-shared", "pal-target"),),
    )
    assert not shared_disabled.routes
    assert "NO_LEGAL_ROUTE" in shared_disabled.explanation_codes


def test_same_species_pair_uses_distinct_opposite_gender_instances() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("same-m", "pal-same", "male"),
                inventory_pal("same-f", "pal-same", "female"),
            ),
        ),
        (recipe("pal-same", "pal-same", "pal-target"),),
    )

    assert len(result.routes) == 1
    assert "FEWER_THAN_THREE_LEGAL_ROUTES" in result.explanation_codes
    step = result.routes[0].steps[0]
    assert {step.parent_a.instance_uid, step.parent_b.instance_uid} == {"same-m", "same-f"}
    assert {step.parent_a.gender, step.parent_b.gender} == {"male", "female"}


def test_same_species_candidates_equal_unique_unordered_instance_pairs() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("same-m-1", "pal-same", "male"),
                inventory_pal("same-m-2", "pal-same", "male"),
                inventory_pal("same-f-1", "pal-same", "female"),
                inventory_pal("same-f-2", "pal-same", "female"),
            ),
        ),
        (recipe("pal-same", "pal-same", "pal-target"),),
    )

    assert len(result.routes) == 4
    assert len({route.route_key for route in result.routes}) == 4


def test_requester_inventory_does_not_require_a_share_flag() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("own-m", "pal-a", "male", share_enabled=False, guild_id=GUILD_ID),
                inventory_pal("own-f", "pal-b", "female", share_enabled=False, guild_id=GUILD_ID),
            ),
        ),
        (recipe("pal-a", "pal-b", "pal-target"),),
    )

    assert result.routes
    assert result.routes[0].borrowed_pal_count == 0
