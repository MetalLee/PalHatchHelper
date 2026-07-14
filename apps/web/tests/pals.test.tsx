import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PalInventory } from "../features/pals/pal-inventory";
import {
  decodeCursorValue,
  encodeCursor,
  parsePalListQuery,
} from "../features/pals/query";

const page = {
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
      owner_display_name: "Fixture Player B",
      gender: "female" as const,
      level: 21,
      passive_skill_ids: ["test_passive_b"],
      passive_display_names: ["工匠精神"],
      unknown_passive_skill_ids: [],
      location_type: "base" as const,
      location_name: "Fixture Base Alpha",
      share_enabled: true,
      is_owned_by_requester: false,
    },
  ],
  total_count: 2,
  next_cursor: null,
  catalog_state: "published" as const,
  game_data_version_id: "51000000-0000-4000-8000-000000000001",
};

describe("pal inventory", () => {
  it("supports all three inventory scopes and all Phase 5 filters", () => {
    const cursor = encodeCursor({
      snapshot_id: "40000000-0000-4000-8000-000000000002",
      game_data_version_id: "51000000-0000-4000-8000-000000000001",
      pal_id: "test_parent_b",
      pal_instance_uid: "fixture-shared",
    });
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
        cursor,
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
      cursor,
    });
    expect(decodeCursorValue(query.cursor)).toEqual({
      snapshot_id: "40000000-0000-4000-8000-000000000002",
      game_data_version_id: "51000000-0000-4000-8000-000000000001",
      pal_id: "test_parent_b",
      pal_instance_uid: "fixture-shared",
    });
    expect(cursor).not.toContain("test_parent_b|");
    expect(
      ["all", "mine", "shared"].map(
        (scope) => parsePalListQuery(new URLSearchParams({ scope })).scope,
      ),
    ).toEqual(["all", "mine", "shared"]);
  });

  it("offers sharing controls only for the requester's own pals", () => {
    const onToggleShare = vi.fn();
    render(<PalInventory page={page} onToggleShare={onToggleShare} />);

    expect(screen.getAllByRole("switch")).toHaveLength(1);
    fireEvent.click(screen.getByRole("switch", { name: /棉悠悠.*共享/i }));
    expect(onToggleShare).toHaveBeenCalledWith("fixture-owned", false);
    expect(screen.getByText("Fixture Player B")).toBeTruthy();
    expect(screen.getByText("棉绒兽")).toBeTruthy();
    expect(screen.getByText("#002")).toBeTruthy();
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
    expect(screen.getByText("未知被动：unknown_passive")).toBeTruthy();
  });
});
