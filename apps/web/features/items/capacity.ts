import type { GuildItemInventoryResponse } from "@palhatch/contracts";
import { ItemCapacityCalculator } from "@palhatch/pal-catalog";

const MAX_PAGE_ITEMS = 300;

export function calculateGuildItemCapacities(
  inventory: GuildItemInventoryResponse,
): GuildItemInventoryResponse {
  if (inventory.status === "unavailable") return inventory;
  const quantities = Object.fromEntries(
    inventory.inventory_quantities.map(({ item_id, quantity }) => [
      item_id,
      quantity,
    ]),
  );
  const calculator = new ItemCapacityCalculator(inventory.capacity_recipes);
  return {
    ...inventory,
    items: inventory.items
      .slice(0, MAX_PAGE_ITEMS)
      .map((item) => ({
        ...item,
        capacity: calculator.calculate(item.item_id, quantities),
      }))
      .filter(
        (item) =>
          item.quantity > 0 || (item.capacity?.craftable_additional ?? 0) > 0,
      ),
  };
}
