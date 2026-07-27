import type { PalInventoryPage } from "@palhatch/contracts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PalInventory } from "../features/pals/pal-inventory";
import { PalFilters } from "../features/pals/pal-filters";
import { PalPagination } from "../features/pals/pal-pagination";
import { parsePalListQuery } from "../features/pals/query";

afterEach(() => vi.unstubAllGlobals());

const page: PalInventoryPage = {
  snapshot_id: "40000000-0000-4000-8000-000000000002",
  items: [
    {
      pal_instance_uid: "fixture-owned",
      pal_id: "test_parent_a",
      encyclopedia_no: 1,
      element_types: ["neutral"],
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
      element_types: ["leaf", "water"],
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
      element_types: ["dark"],
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
      {
        value: "test_passive_a",
        label: "认真",
        rank: 3,
        is_negative: false,
      },
      {
        value: "test_passive_b",
        label: "工匠精神",
        rank: 5,
        is_negative: false,
      },
      {
        value: "test_passive_c",
        label: "稀有被动",
        rank: 4,
        is_negative: false,
      },
      {
        value: "test_passive_d",
        label: "传说被动",
        rank: 2,
        is_negative: false,
      },
      {
        value: "test_passive_e",
        label: "负面被动",
        rank: -1,
        is_negative: true,
      },
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

const viewHrefs = {
  cards: "/pals?view=cards",
  table: "/pals?view=table",
} as const;

describe("pal inventory", () => {
  it("supports all three inventory scopes and all Phase 5 filters", () => {
    const params = new URLSearchParams({
      scope: "shared",
      query: "棉悠悠",
      owner: "b".repeat(64),
      gender: "female",
      location: "base",
      shared: "true",
      page_size: "12",
      page: "3",
      view: "table",
    });
    params.append("passive", "test_passive_b");
    params.append("passive", "test_passive_c");
    params.append("passive", "test_passive_b");
    const query = parsePalListQuery(params);

    expect(query).toEqual({
      scope: "shared",
      query: "棉悠悠",
      owner: "b".repeat(64),
      gender: "female",
      passives: ["test_passive_b", "test_passive_c"],
      location: "base",
      shared: true,
      page_size: 12,
      page: 3,
      context: null,
      view: "table",
    });
    expect(
      ["all", "mine", "shared"].map(
        (scope) => parsePalListQuery(new URLSearchParams({ scope })).scope,
      ),
    ).toEqual(["all", "mine", "shared"]);
  });

  it("uses full-pool valid filter options instead of only the current page", () => {
    const query = parsePalListQuery(new URLSearchParams());
    render(<PalFilters query={query} page={page} viewHrefs={viewHrefs} />);

    fireEvent.click(screen.getByRole("button", { name: /更多筛选/ }));
    fireEvent.click(screen.getByRole("combobox", { name: "所有者" }));
    expect(
      screen.getByRole("option", { name: "Fixture Player C" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Fixture Player C" }));

    fireEvent.click(screen.getByRole("combobox", { name: "被动" }));
    const rarePassive = screen.getByRole("option", { name: /稀有被动/ });
    expect(rarePassive.querySelector("[data-rank='4']")).toBeTruthy();
    fireEvent.click(rarePassive);
    expect(
      screen
        .getByRole("combobox", { name: "被动" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: /工匠精神/ }));
    expect(
      Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="passive"]'),
        (input) => input.value,
      ),
    ).toEqual(["test_passive_b", "test_passive_c"]);

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

  it("does not match passive filters by internal IDs", () => {
    const query = parsePalListQuery(new URLSearchParams());
    render(<PalFilters query={query} page={page} viewHrefs={viewHrefs} />);

    fireEvent.click(screen.getByRole("combobox", { name: "被动" }));
    fireEvent.change(screen.getByPlaceholderText(/搜索被动/), {
      target: { value: "test_passive_c" },
    });

    expect(screen.queryByRole("option", { name: /稀有被动/ })).toBeNull();
    expect(screen.getByText("没有匹配的被动")).toBeTruthy();
  });

  it("limits passive multi-selection to four and supports toggling and clearing", () => {
    const query = parsePalListQuery(new URLSearchParams());
    render(<PalFilters query={query} page={page} viewHrefs={viewHrefs} />);

    fireEvent.click(screen.getByRole("combobox", { name: "被动" }));
    for (const name of ["认真", "工匠精神", "稀有被动", "传说被动"]) {
      fireEvent.click(screen.getByRole("option", { name: new RegExp(name) }));
    }

    expect(screen.getByText("已选择 4 / 4")).toBeTruthy();
    expect(
      screen
        .getByRole("option", { name: /负面被动/ })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(document.querySelectorAll('input[name="passive"]')).toHaveLength(4);

    fireEvent.click(screen.getByRole("option", { name: /认真/ }));
    expect(document.querySelectorAll('input[name="passive"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "清空被动筛选" }));
    expect(document.querySelectorAll('input[name="passive"]')).toHaveLength(0);
    expect(
      screen.getByRole("combobox", { name: "被动" }).textContent,
    ).toContain("全部被动");
  });

  it("provides standard numbered pagination with ellipses", () => {
    const params = new URLSearchParams({
      scope: "mine",
      query: "棉",
      page: "2",
      page_size: "12",
      view: "table",
    });
    params.append("passive", "test_passive_a");
    params.append("passive", "test_passive_b");
    const query = parsePalListQuery(params);
    render(
      <PalPagination
        query={query}
        page={{ ...page, page_number: 6, total_pages: 12, total_count: 140 }}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "帕鲁列表分页" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "第 6 页" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "上一页" }).getAttribute("href"),
    ).toContain("page=5");
    expect(
      screen.getByRole("link", { name: "下一页" }).getAttribute("href"),
    ).toContain("page=7");
    expect(
      screen.getByRole("link", { name: "下一页" }).getAttribute("href"),
    ).toContain("page_size=12");
    expect(
      screen.getByRole("link", { name: "下一页" }).getAttribute("href"),
    ).toContain("context=");
    expect(
      screen.getByRole("link", { name: "下一页" }).getAttribute("href"),
    ).toContain("view=table");
    const nextParams = new URL(
      screen.getByRole("link", { name: "下一页" }).getAttribute("href")!,
      "https://palbeacon.invalid",
    ).searchParams;
    expect(nextParams.getAll("passive")).toEqual([
      "test_passive_a",
      "test_passive_b",
    ]);
    expect(
      within(screen.getByTestId("pal-pagination-inline")).getAllByText(
        "更多页面",
      ),
    ).toHaveLength(2);
    expect(screen.queryByRole("spinbutton", { name: "跳转页码" })).toBeNull();
  });

  it("floats pagination only while inventory is visible before inline handoff", () => {
    let callback: IntersectionObserverCallback | undefined;
    const observed: Element[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class IntersectionObserverMock {
        constructor(nextCallback: IntersectionObserverCallback) {
          callback = nextCallback;
        }
        observe(element: Element) {
          observed.push(element);
        }
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
        readonly root = null;
        readonly rootMargin = "0px";
        readonly thresholds = [0];
      },
    );

    const query = parsePalListQuery(new URLSearchParams());
    render(
      <>
        <div id="pal-inventory-results" />
        <PalPagination
          query={query}
          page={{ ...page, page_number: 2, total_pages: 4, total_count: 80 }}
        />
      </>,
    );

    const inventory = document.querySelector("#pal-inventory-results");
    const inline = screen.getByTestId("pal-pagination-inline");
    const floating = screen.getByTestId("pal-pagination-floating");
    expect(inventory).not.toBeNull();
    expect(observed).toContain(inventory);
    expect(observed).toContain(inline);
    expect(floating.dataset.visible).toBe("false");

    act(() => {
      callback?.(
        [
          {
            target: inventory!,
            isIntersecting: true,
            intersectionRatio: 0.5,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(floating.dataset.visible).toBe("true");

    act(() => {
      callback?.(
        [
          {
            target: inline,
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(floating.dataset.visible).toBe("false");
  });

  it("rebinds floating pagination when the inventory view replaces its result node", () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class IntersectionObserverMock {
        observe(element: Element) {
          observed.push(element);
        }
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
        readonly root = null;
        readonly rootMargin = "0px";
        readonly thresholds = [0];
      },
    );

    const cardsQuery = parsePalListQuery(
      new URLSearchParams({ view: "cards" }),
    );
    const tableQuery = parsePalListQuery(
      new URLSearchParams({ view: "table" }),
    );
    const paged = { ...page, page_number: 2, total_pages: 4, total_count: 80 };
    const { rerender } = render(
      <>
        <div key="cards" id="pal-inventory-results" data-view="cards" />
        <PalPagination query={cardsQuery} page={paged} />
      </>,
    );
    const cardsInventory = document.querySelector(
      '#pal-inventory-results[data-view="cards"]',
    );

    rerender(
      <>
        <div key="table" id="pal-inventory-results" data-view="table" />
        <PalPagination query={tableQuery} page={paged} />
      </>,
    );
    const tableInventory = document.querySelector(
      '#pal-inventory-results[data-view="table"]',
    );

    expect(cardsInventory).not.toBeNull();
    expect(tableInventory).not.toBeNull();
    expect(tableInventory).not.toBe(cardsInventory);
    expect(observed).toContain(cardsInventory);
    expect(observed).toContain(tableInventory);
  });

  it("renders compact cards with icon-only gender and elements", () => {
    const onToggleShare = vi.fn();
    render(
      <PalInventory
        page={page}
        view="cards"
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
    expect(screen.queryByText("雄性")).toBeNull();
    expect(screen.queryByText("雌性")).toBeNull();
    expect(screen.getByLabelText("雄性")).toBeTruthy();
    expect(screen.getAllByLabelText("雌性")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "一般属性" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "草属性" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "水属性" })).toBeTruthy();
    expect(screen.queryByText("test_parent_a", { exact: true })).toBeNull();

    const portrait = screen.getByRole("img", { name: "棉悠悠头像" });
    expect(portrait.getAttribute("width")).toBe("56");
    expect(decodeURIComponent(portrait.getAttribute("src") ?? "")).toContain(
      "/pal-assets/872e4a79af5b/pals/test_parent_a.webp",
    );
    fireEvent.error(portrait);
    expect(
      screen.getByRole("img", { name: "棉悠悠头像（暂无本地图标）" }),
    ).toBeTruthy();
  });

  it("switches to a table that keeps portraits and sharing controls", () => {
    render(
      <PalInventory
        page={page}
        view="table"
        passiveRanks={{ test_passive_a: 3, test_passive_b: 5 }}
        onToggleShare={vi.fn()}
      />,
    );

    const table = screen.getByRole("table", { name: "帕鲁库存表格" });
    expect(table).toBeTruthy();
    expect(within(table).getByRole("img", { name: "棉悠悠头像" })).toBeTruthy();
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("keeps internal catalog IDs out of fallback presentation", () => {
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
        view="cards"
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("名称暂不可用")).toBeTruthy();
    expect(screen.getByText("目录信息暂不可用")).toBeTruthy();
    const unknownPassive = screen.getByText("未知被动");
    expect(unknownPassive.dataset.rank).toBe("unknown");
    expect(document.body.textContent).not.toContain("unknown_pal");
    expect(document.body.textContent).not.toContain("unknown_passive");
  });

  it("keeps secondary filters tidy until more filters is requested", () => {
    const query = parsePalListQuery(new URLSearchParams());
    render(<PalFilters query={query} page={page} viewHrefs={viewHrefs} />);

    expect(screen.getByRole("link", { name: "全部" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "我的帕鲁" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "公会共享" })).toBeTruthy();
    expect(screen.getByLabelText("名称或图鉴编号")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "被动" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "应用筛选" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "清除" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "卡片视图" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("link", { name: "表格视图" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "所有者" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "性别" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "位置" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "共享状态" })).toBeNull();

    const moreFilters = screen.getByRole("button", { name: /更多筛选/ });
    expect(moreFilters.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(moreFilters);

    expect(moreFilters.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("combobox", { name: "所有者" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "性别" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "位置" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "共享状态" })).toBeTruthy();
  });

  it("shows a useful empty state without duplicating global status", () => {
    render(
      <PalInventory
        page={{
          ...page,
          items: [],
          total_count: 0,
          catalog_state: "not_configured",
          game_data_version_id: null,
        }}
        view="cards"
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "没有匹配的帕鲁" }),
    ).toBeTruthy();
  });
});
