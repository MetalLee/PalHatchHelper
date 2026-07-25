import type { PalInventoryPage } from "@palhatch/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PalInventory } from "../features/pals/pal-inventory";
import { PalFilters } from "../features/pals/pal-filters";
import { PalPagination } from "../features/pals/pal-pagination";
import { parsePalListQuery } from "../features/pals/query";

const page: PalInventoryPage = {
  snapshot_id: "40000000-0000-4000-8000-000000000002",
  items: [
    {
      pal_instance_uid: "fixture-owned",
      pal_id: "test_parent_a",
      encyclopedia_no: 1,
      pal_display_name: "棉悠悠",
      catalog_entry_state: "resolved" as const,
      owner_filter_key: "a".repeat(64),
      owner_display_name: "Fixture Player A",
      gender: "male" as const,
      level: 20,
      passive_skill_ids: ["test_passive_a"],
      passive_display_names: ["认真"],
      unknown_passive_skill_ids: [],
      location_type: "player_storage" as const,
      location_name: "Fixture Storage A",
      location_id: null,
      location_slot_index: 64,
      location_access_scope: "player" as const,
      is_boss: true,
      ownership_scope: "player" as const,
      share_enabled: true,
      is_owned_by_requester: true,
    },
    {
      pal_instance_uid: "fixture-shared",
      pal_id: "test_parent_b",
      encyclopedia_no: 2,
      pal_display_name: "棉绒兽",
      catalog_entry_state: "resolved" as const,
      owner_filter_key: "b".repeat(64),
      owner_display_name: "Fixture Guild Alpha",
      gender: "female" as const,
      level: 21,
      passive_skill_ids: ["test_passive_b"],
      passive_display_names: ["工匠精神"],
      unknown_passive_skill_ids: [],
      location_type: "base" as const,
      location_name: "Fixture Base Alpha",
      location_id: "fixture-base-alpha",
      location_slot_index: 7,
      location_access_scope: "guild" as const,
      is_boss: false,
      ownership_scope: "guild" as const,
      share_enabled: true,
      is_owned_by_requester: false,
    },
    {
      pal_instance_uid: "fixture-dimensional-shared",
      pal_id: "test_parent_c",
      encyclopedia_no: 3,
      pal_display_name: "共享仓库帕鲁",
      catalog_entry_state: "resolved" as const,
      owner_filter_key: "b".repeat(64),
      owner_display_name: "Fixture Player B",
      gender: "female" as const,
      level: 22,
      passive_skill_ids: [],
      passive_display_names: [],
      unknown_passive_skill_ids: [],
      location_type: "dimensional_storage" as const,
      location_name: "Fixture Player B",
      location_id: "dimensional-storage:fixture-player-b",
      location_slot_index: 31,
      location_access_scope: "guild" as const,
      is_boss: false,
      ownership_scope: "player" as const,
      share_enabled: true,
      is_owned_by_requester: false,
    },
  ],
  total_count: 3,
  page_number: 1,
  total_pages: 1,
  filter_options: {
    owners: [
      { value: "a".repeat(64), label: "Fixture Player A" },
      { value: "b".repeat(64), label: "Fixture Player B" },
      { value: "c".repeat(64), label: "Fixture Player C" },
    ],
    genders: ["male", "female"],
    passives: [
      { value: "test_passive_a", label: "认真" },
      { value: "test_passive_b", label: "工匠精神" },
      { value: "test_passive_c", label: "稀有被动" },
    ],
    locations: [
      "player_storage",
      "base",
      "dimensional_storage",
      "viewing_cage",
    ],
  },
  catalog_state: "published" as const,
  game_data_version_id: "51000000-0000-4000-8000-000000000001",
};

describe("pal inventory", () => {
  it("supports all three inventory scopes and all Phase 5 filters", () => {
    const query = parsePalListQuery(
      new URLSearchParams({
        scope: "shared",
        query: "棉悠悠",
        owner: "b".repeat(64),
        gender: "female",
        passive: "test_passive_b",
        location: "base",
        shared: "true",
        page_size: "12",
        page: "3",
      }),
    );

    expect(query).toEqual({
      scope: "shared",
      query: "棉悠悠",
      owner: "b".repeat(64),
      gender: "female",
      passive: "test_passive_b",
      location: "base",
      shared: true,
      page_size: 12,
      page: 3,
      context: null,
    });
    expect(
      ["all", "mine", "shared"].map(
        (scope) => parsePalListQuery(new URLSearchParams({ scope })).scope,
      ),
    ).toEqual(["all", "mine", "shared"]);
  });

  it("uses full-pool valid filter options instead of only the current page", () => {
    const query = parsePalListQuery(new URLSearchParams());
    render(<PalFilters query={query} page={page} />);

    fireEvent.click(screen.getByRole("combobox", { name: "所有者" }));
    expect(
      screen.getByRole("option", { name: "Fixture Player C" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Fixture Player C" }));

    fireEvent.click(screen.getByRole("combobox", { name: "被动" }));
    expect(screen.getByRole("option", { name: /稀有被动/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /稀有被动/ }));

    fireEvent.click(screen.getByRole("combobox", { name: "位置" }));
    expect(screen.getByRole("option", { name: "观赏笼" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "次元仓库" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "未知" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "观赏笼" }));

    fireEvent.click(screen.getByRole("combobox", { name: "性别" }));
    const femaleOption = screen.getByRole("option", { name: "雌性" });
    expect(femaleOption.querySelector("svg")?.className.baseVal).toContain(
      "text-rose-400",
    );
  });

  it("provides previous, next, total pages and a bounded page jump", () => {
    const query = parsePalListQuery(
      new URLSearchParams({
        scope: "mine",
        query: "棉",
        page: "2",
        page_size: "12",
      }),
    );
    render(
      <PalPagination
        query={query}
        page={{ ...page, page_number: 2, total_pages: 4, total_count: 80 }}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "帕鲁列表分页" }),
    ).toBeTruthy();
    expect(screen.getByText("第 2 / 4 页")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "上一页" }).getAttribute("href"),
    ).toContain("page=1");
    expect(
      screen.getByRole("link", { name: "下一页" }).getAttribute("href"),
    ).toContain("page=3");
    expect(
      screen.getByRole("link", { name: "下一页" }).getAttribute("href"),
    ).toContain("page_size=12");
    expect(
      screen.getByRole("link", { name: "下一页" }).getAttribute("href"),
    ).toContain("context=");
    const jump = screen.getByRole("spinbutton", { name: "跳转页码" });
    expect(jump.getAttribute("min")).toBe("1");
    expect(jump.getAttribute("max")).toBe("4");
  });

  it("offers sharing controls only for the requester's own pals", () => {
    const onToggleShare = vi.fn();
    render(
      <PalInventory
        page={page}
        passiveRanks={{
          test_passive_a: 3,
          test_passive_b: 5,
        }}
        onToggleShare={onToggleShare}
      />,
    );

    expect(screen.getAllByRole("switch")).toHaveLength(1);
    fireEvent.click(screen.getByRole("switch", { name: /棉悠悠.*共享/i }));
    expect(onToggleShare).toHaveBeenCalledWith("fixture-owned", false);
    expect(screen.getByText("Fixture Guild Alpha")).toBeTruthy();
    expect(screen.getByText("公会所有")).toBeTruthy();
    expect(screen.getByText("棉绒兽")).toBeTruthy();
    expect(screen.getByText("#002")).toBeTruthy();
    expect(screen.getByText("终端")).toBeTruthy();
    expect(screen.getByText("第 3 页 · 第 5 格")).toBeTruthy();
    expect(screen.getByText("头目")).toBeTruthy();
    expect(screen.getByText("Fixture Base Alpha · 工作位 8")).toBeTruthy();
    expect(screen.getByText("次元仓库")).toBeTruthy();
    expect(screen.getByText("第 2 页 · 第 2 格")).toBeTruthy();
    expect(screen.queryByText("Fixture Storage A")).toBeNull();
    expect(screen.getByText("认真").dataset.rank).toBe("3");
    expect(screen.getByText("工匠精神").dataset.rank).toBe("5");
    expect(screen.queryByText(/Rank/)).toBeNull();
    expect(
      screen
        .getAllByText("雄性")
        .some((label) =>
          label.parentElement
            ?.querySelector("svg")
            ?.className.baseVal.includes("text-sky-500"),
        ),
    ).toBe(true);
    expect(
      screen
        .getAllByText("雌性")
        .some((label) =>
          label.parentElement
            ?.querySelector("svg")
            ?.className.baseVal.includes("text-rose-400"),
        ),
    ).toBe(true);

    const portrait = screen.getByRole("img", { name: "棉悠悠头像" });
    expect(decodeURIComponent(portrait.getAttribute("src") ?? "")).toContain(
      "/pal-assets/872e4a79af5b/pals/test_parent_a.webp",
    );
    fireEvent.error(portrait);
    expect(
      screen.getByRole("img", { name: "棉悠悠头像（暂无本地图标）" }),
    ).toBeTruthy();
  });

  it("makes missing catalog data and unknown IDs explicit", () => {
    render(
      <PalInventory
        page={{
          ...page,
          catalog_state: "not_configured",
          game_data_version_id: null,
          items: [
            {
              ...page.items[0]!,
              pal_id: "unknown_pal",
              encyclopedia_no: null,
              pal_display_name: "unknown_pal",
              catalog_entry_state: "not_configured",
              passive_skill_ids: ["unknown_passive"],
              passive_display_names: ["unknown_passive"],
              unknown_passive_skill_ids: ["unknown_passive"],
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "游戏目录尚未配置",
    );
    expect(screen.getByText("未解析目录项")).toBeTruthy();
    const unknownPassive = screen.getByText("未知被动 · unknown_passive");
    expect(unknownPassive.dataset.rank).toBe("unknown");
  });

  it("opens secondary filters in a mobile sheet", () => {
    const query = parsePalListQuery(new URLSearchParams());
    render(<PalFilters query={query} page={page} />);

    expect(screen.getByRole("link", { name: "全部" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "我的帕鲁" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "公会共享" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "筛选" }));
    const sheet = screen.getByRole("dialog", { name: "筛选库存" });
    expect(
      within(sheet).getByLabelText("名称、图鉴编号或稳定 ID"),
    ).toBeTruthy();
    expect(within(sheet).getByLabelText("所有者")).toBeTruthy();
    expect(
      within(sheet).getByRole("button", { name: "应用筛选" }),
    ).toBeTruthy();
  });

  it("shows a useful empty state without hiding catalog status", () => {
    render(
      <PalInventory
        page={{
          ...page,
          items: [],
          total_count: 0,
          catalog_state: "not_configured",
          game_data_version_id: null,
        }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "游戏目录尚未配置",
    );
    expect(
      screen.getByRole("heading", { name: "没有匹配的帕鲁" }),
    ).toBeTruthy();
  });
});
