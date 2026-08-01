import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ItemInventorySparkline } from "@/features/items/item-inventory-sparkline";

describe("ItemInventorySparkline", () => {
  it("backfills the leading one-hour window with the earliest quantity", () => {
    render(
      <ItemInventorySparkline
        label="Wheat inventory over the last hour"
        points={[
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
        ]}
      />,
    );

    const chart = screen.getByRole("img", {
      name: "Wheat inventory over the last hour",
    });
    const line = chart.querySelector("polyline");
    const coordinates = line?.getAttribute("points")?.split(" ") ?? [];
    const earliestY = coordinates[11]?.split(",")[1];
    expect(coordinates).toHaveLength(13);
    expect(
      coordinates
        .slice(0, 12)
        .every((coordinate) => coordinate.split(",")[1] === earliestY),
    ).toBe(true);
    expect(coordinates[12]?.split(",")[1]).not.toBe(earliestY);
  });

  it("keeps one continuous line across offline gaps", () => {
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
    expect(chart.querySelectorAll("polyline")).toHaveLength(1);
    expect(
      chart.querySelector("polyline")?.getAttribute("points")?.split(" "),
    ).toHaveLength(11);
  });

  it("scales the vertical axis from zero for absolute guild totals", () => {
    render(
      <ItemInventorySparkline
        label="Lettuce inventory over the last hour"
        points={[
          100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000,
          100_000, 100_000, 100_000, 100_000, 100_000, 100_300,
        ]}
      />,
    );

    const chart = screen.getByRole("img", {
      name: "Lettuce inventory over the last hour",
    });
    const coordinates =
      chart.querySelector("polyline")?.getAttribute("points")?.split(" ") ?? [];
    const firstY = Number(coordinates[0]?.split(",")[1]);
    const lastY = Number(coordinates.at(-1)?.split(",")[1]);
    expect(Math.abs(firstY - lastY)).toBeLessThan(0.1);
  });

  it("shows the exact guild total when hovering a sampling period", () => {
    render(
      <ItemInventorySparkline
        label="Lettuce inventory over the last hour"
        points={[
          100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000,
          100_000, 100_000, 100_000, 100_000, 100_000, 100_300,
        ]}
        locale="en-US"
      />,
    );

    const chart = screen.getByRole("img", {
      name: "Lettuce inventory over the last hour",
    });
    const finalPeriod = chart.querySelector('[data-chart-point="12"]');
    expect(finalPeriod).not.toBeNull();

    fireEvent.mouseEnter(finalPeriod!);
    expect(screen.getByRole("tooltip").textContent).toContain("100,300");

    fireEvent.mouseLeave(finalPeriod!);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
