import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../app/page";

describe("home page", () => {
  it("identifies the running Phase 0 skeleton", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /PalHatch Helper/i }),
    ).toBeTruthy();
    expect(screen.getByText(/工程骨架已运行/)).toBeTruthy();
  });
});
