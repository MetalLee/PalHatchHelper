import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LoginPage from "../app/login/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("login page", () => {
  it("identifies the Phase 5 inventory workspace", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: /回到你的帕鲁工作台/i }),
    ).toBeTruthy();
    expect(screen.getByText(/RLS\/RPC 授权/)).toBeTruthy();
  });
});
