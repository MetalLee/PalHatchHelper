from pal_hatch_helper.models.errors import ErrorCode, StructuredError


class InventoryDropGuard:
    def ensure_publishable(self, *, previous_count: int, new_count: int) -> None:
        if new_count * 2 < previous_count and previous_count - new_count > 50:
            raise StructuredError(
                code=ErrorCode.INVENTORY_DROP_REVIEW_REQUIRED,
                summary="Inventory dropped below the automatic publication safety threshold.",
                retryable=False,
            )
