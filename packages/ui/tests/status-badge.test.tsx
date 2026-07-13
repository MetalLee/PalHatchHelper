import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "../src/status-badge";

describe("StatusBadge", () => {
  it("exposes status semantics without relying on color", () => {
    render(<StatusBadge status="operational">运行正常</StatusBadge>);

    const badge = screen.getByText("运行正常");
    expect(badge.getAttribute("data-status")).toBe("operational");
    expect(badge.getAttribute("role")).toBe("status");
  });
});
