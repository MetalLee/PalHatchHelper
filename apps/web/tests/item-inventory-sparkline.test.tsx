import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ItemInventorySparkline } from "@/features/items/item-inventory-sparkline";

describe("ItemInventorySparkline", () => {
  it("renders the shared 13-point one-hour axis and preserves offline gaps", () => {
    render(
      <ItemInventorySparkline
        label="Nail inventory over the last hour"
        points={[4, 4, null, null, 4, 5, 5, 5, 4, 4, 4, 4, 4]}
      />,
    );

    const chart = screen.getByRole("img", {
      name: "Nail inventory over the last hour",
    });
    expect(chart.getAttribute("data-point-count")).toBe("13");
    expect(chart.querySelectorAll("polyline")).toHaveLength(2);
  });
});
