import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "../app/login/login-form";
import LoginPage from "../app/login/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("login page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("identifies the secure breeding workspace without unsupported actions", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: /欢迎回到配种工作台/i }),
    ).toBeTruthy();
    expect(screen.getByText(/RLS\/RPC 授权/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /注册|游客|忘记密码/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /上传存档/ })).toBeNull();
  });

  it("keeps stable login errors and completes navigation after success", async () => {
    const navigate = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error_code: "INVALID_CREDENTIALS" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginForm onNavigate={navigate} />);
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "player@palhatch.fixture.invalid" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录工作台" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "邮箱或密码不正确。",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "登录工作台" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/overview"));
  });

  it("announces unavailable auth and exposes a pending state", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );

    render(<LoginForm onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "player@palhatch.fixture.invalid" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "fixture-password" },
    });
    const submit = screen.getByRole("button", { name: "登录工作台" });
    fireEvent.click(submit);

    await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(true));
    expect(submit.textContent).toContain("正在登录");

    resolveRequest?.({
      ok: false,
      json: async () => ({ error_code: "AUTH_UNAVAILABLE" }),
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "登录服务暂不可用，请稍后重试。",
    );
  });
});
