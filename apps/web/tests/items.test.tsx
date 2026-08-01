import type { GuildItemInventoryItem } from "@palhatch/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ItemInventoryFilters } from "@/features/items/item-inventory-filters";
import { ItemInventoryList } from "@/features/items/item-inventory-list";
import { ItemInventoryPagination } from "@/features/items/item-inventory-pagination";
import {
  parseItemInventoryQuery,
  prepareItemInventoryPage,
} from "@/features/items/query";

function inventoryItem(
  itemId: string,
  name: string,
  quantity: number,
): GuildItemInventoryItem {
  return {
    item_id: itemId,
    name,
    type_a: "material",
    type_b: "material",
    quantity,
    guild_chest_quantity: 2,
    bases: [{ base_id: "raw-base-guid", name: null, quantity: 6 }],
    recipes: [
      {
        recipe_id: "recipe-internal-id",
        product_count: 2,
        craft_kind: "handcraft",
        ingredients: [
          {
            slot: 0,
            item_id: "wood-internal-id",
            name: "木材",
            count: 3,
          },
        ],
      },
    ],
    capacity: {
      on_hand: quantity,
      craftable_additional: 8,
      obtainable_total: quantity + 8,
      selected_recipe_id: "recipe-internal-id",
      status: "ready",
      recipe_plan: [],
      limiting_materials: [],
    },
    trend_1h: [1, 1, null, 2, 2, 3, 3, 4, 4, 5, 5, 6, quantity],
  };
}

describe("item inventory", () => {
  it("uses themed positive and destructive colors for period changes", () => {
    const increased = inventoryItem("item-increased", "增加物品", 12);
    increased.trend_1h = [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      8,
      12,
    ];
    const decreased = inventoryItem("item-decreased", "减少物品", 7);
    decreased.trend_1h = [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      10,
      7,
    ];

    render(
      <ItemInventoryList
        items={[increased, decreased]}
        baseLabels={{ "raw-base-guid": "基地A" }}
        catalogLocale="zh-CN"
      />,
    );

    expect(screen.getByText("+4").className).toContain("text-primary");
    expect(screen.getByText("-3").className).toContain("text-destructive");
  });

  it("defaults to 50 rows and sorts the current guild total descending", () => {
    const query = parseItemInventoryQuery(new URLSearchParams());
    const prepared = prepareItemInventoryPage(
      [
        inventoryItem("item-low", "低库存", 4),
        inventoryItem("item-high", "高库存", 40),
        inventoryItem("item-mid", "中库存", 12),
      ],
      query,
      "zh-CN",
    );

    expect(query).toEqual({ query: "", type: "all", page: 1, pageSize: 50 });
    expect(prepared.items.map((item) => item.item_id)).toEqual([
      "item-high",
      "item-mid",
      "item-low",
    ]);
    expect(prepared.totalCount).toBe(3);
    expect(prepared.totalPages).toBe(1);
  });

  it("accepts only the 50, 100 and 200 page sizes and clamps the page", () => {
    expect(
      parseItemInventoryQuery(
        new URLSearchParams({ page: "3", page_size: "100" }),
      ),
    ).toMatchObject({ page: 3, pageSize: 100 });
    expect(
      parseItemInventoryQuery(
        new URLSearchParams({ page: "99", page_size: "75" }),
      ).pageSize,
    ).toBe(50);

    const prepared = prepareItemInventoryPage(
      Array.from({ length: 51 }, (_, index) =>
        inventoryItem(`item-${index}`, `物品 ${index}`, index),
      ),
      { query: "", type: "all", page: 99, pageSize: 50 },
      "zh-CN",
    );
    expect(prepared.pageNumber).toBe(2);
    expect(prepared.items).toHaveLength(1);
  });

  it("uses player-facing base aliases and keeps recipe details collapsed", () => {
    render(
      <ItemInventoryList
        items={[inventoryItem("item-nail", "钉子", 10)]}
        baseLabels={{ "raw-base-guid": "基地A" }}
        catalogLocale="zh-CN"
      />,
    );

    expect(screen.getAllByText("基地A")).not.toHaveLength(0);
    expect(screen.queryByText("raw-base-guid")).toBeNull();
    expect(screen.queryByText("item-nail")).toBeNull();
    expect(screen.queryByText("木材")).toBeNull();
    expect(screen.getAllByText("可产出数量")).not.toHaveLength(0);
    expect(screen.getByRole("img", { name: /钉子.*一小时/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /钉子/ }));

    expect(screen.getByText("木材")).toBeTruthy();
    expect(
      decodeURIComponent(
        screen.getByTestId("item-icon").getAttribute("src") ?? "",
      ),
    ).toContain("/pal-assets/items/item-nail.webp");
    expect(
      decodeURIComponent(
        screen.getByTestId("recipe-icon").getAttribute("src") ?? "",
      ),
    ).toContain("/pal-assets/items/item-nail.webp");
    expect(
      decodeURIComponent(
        screen.getByTestId("recipe-ingredient-icon").getAttribute("src") ?? "",
      ),
    ).toContain("/pal-assets/items/wood-internal-id.webp");
    expect(screen.queryByTestId("item-icon-placeholder")).toBeNull();
    expect(screen.queryByTestId("recipe-icon-placeholder")).toBeNull();
    expect(screen.queryByText("recipe-internal-id")).toBeNull();
    expect(screen.queryByText("wood-internal-id")).toBeNull();
  });

  it("uses equally tall shadcn controls without visible field labels", () => {
    render(
      <ItemInventoryFilters
        query={{ query: "", type: "all", page: 1, pageSize: 50 }}
      />,
    );

    const search = screen.getByRole("searchbox", { name: "搜索" });
    const type = screen.getByRole("combobox", { name: "类型" });
    const pageSize = screen.getByRole("combobox", { name: "每页数量" });
    const apply = screen.getByRole("button", { name: "应用" });
    expect(search.className).toContain("h-11");
    expect(type.className).toContain("h-11");
    expect(pageSize.className).toContain("h-11");
    expect(apply.className).toContain("h-11");
    expect(document.querySelector("label:not(.sr-only)")).toBeNull();

    fireEvent.click(pageSize);
    expect(screen.getByRole("option", { name: "每页 50 项" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "每页 100 项" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "每页 200 项" })).toBeTruthy();
  });

  it("preserves filters and page size in the Pal inventory pagination style", () => {
    render(
      <>
        <div id="item-inventory-results" />
        <ItemInventoryPagination
          query={{ query: "蛋", type: "food", page: 2, pageSize: 100 }}
          pageNumber={2}
          totalPages={4}
        />
      </>,
    );

    const inline = within(screen.getByTestId("item-pagination-inline"));
    const next = inline.getByRole("link", { name: "下一页" });
    const href = next.getAttribute("href") ?? "";
    expect(href).toContain("query=%E8%9B%8B");
    expect(href).toContain("type=food");
    expect(href).toContain("page_size=100");
    expect(href).toContain("page=3");
    expect(
      inline
        .getByRole("link", { name: "第 2 / 4 页" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});
