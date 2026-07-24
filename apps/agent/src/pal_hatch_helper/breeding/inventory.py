from collections import Counter
from dataclasses import dataclass

from pal_hatch_helper.generated import (
    BreedingEngineInventoryPal,
    BreedingEngineRequest,
    BreedingInventoryExclusionReason,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


@dataclass(frozen=True, slots=True)
class InventorySelection:
    eligible: tuple[BreedingEngineInventoryPal, ...]
    exclusions: tuple[tuple[BreedingInventoryExclusionReason, int], ...]


def select_eligible_inventory(request: BreedingEngineRequest) -> InventorySelection:
    eligible: list[BreedingEngineInventoryPal] = []
    exclusions: Counter[BreedingInventoryExclusionReason] = Counter()
    seen_uids: set[str] = set()
    for instance in sorted(request.inventory, key=lambda item: item.instance_uid):
        if instance.instance_uid in seen_uids:
            raise StructuredError(
                code=ErrorCode.BREEDING_INVENTORY_INSTANCE_CONFLICT,
                summary="The fixed inventory contains a duplicate Pal instance UID.",
                retryable=False,
            )
        seen_uids.add(instance.instance_uid)
        reason = _exclusion_reason(request, instance)
        if reason is None:
            eligible.append(instance)
        else:
            exclusions[reason] += 1
    return InventorySelection(
        eligible=tuple(eligible),
        exclusions=tuple(sorted(exclusions.items(), key=lambda item: item[0].value)),
    )


def _exclusion_reason(
    request: BreedingEngineRequest,
    instance: BreedingEngineInventoryPal,
) -> BreedingInventoryExclusionReason | None:
    if not instance.present_in_snapshot:
        return BreedingInventoryExclusionReason.DISAPPEARED
    if not instance.breeding_enabled:
        return BreedingInventoryExclusionReason.DISABLED
    if not instance.owner_resolved or not instance.guild_resolved:
        return BreedingInventoryExclusionReason.UNRESOLVED
    if instance.ownership_scope == "unresolved" or instance.guild_id is None:
        return BreedingInventoryExclusionReason.UNRESOLVED
    if instance.ownership_scope == "player" and instance.owner_player_id is None:
        return BreedingInventoryExclusionReason.UNRESOLVED
    if instance.ownership_scope == "guild" and instance.owner_player_id is not None:
        return BreedingInventoryExclusionReason.UNRESOLVED
    if instance.plan_locked and not request.allow_locked_reuse:
        return BreedingInventoryExclusionReason.LOCKED
    if (
        instance.ownership_scope == "player"
        and instance.owner_player_id == request.requester_player_id
    ):
        return None
    if not request.allow_shared_inventory:
        return BreedingInventoryExclusionReason.SHARED_INVENTORY_DISABLED
    if request.requester_guild_id is None or instance.guild_id != request.requester_guild_id:
        return BreedingInventoryExclusionReason.DIFFERENT_GUILD
    if not instance.share_enabled:
        return BreedingInventoryExclusionReason.SHARE_DISABLED
    return None
