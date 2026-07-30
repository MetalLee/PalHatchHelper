import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "../app/[locale]/login/login-form";
import LoginPage from "../app/[locale]/login/page";

const loginMessages = vi.hoisted(() => ({
  Brand: {
    productName: "帕鲁配种协作工作台",
    tagline: "让每一次培育，都有清晰方向",
    description:
      "集中查看服务器数据状态、帕鲁库存与配种计划，让每一次同步和培育都有迹可循。",
    secureWorld: "安全连接你的帕鲁世界",
  },
  Login: {
    welcome: "欢迎回来",
    subtitle: "登录你的 PalBeacon 账号",
    learnAbout: "了解 PalBeacon",
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props} />
  ),
  usePathname: () => "/login",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ namespace }: { namespace: keyof typeof loginMessages }) =>
    (key: keyof (typeof loginMessages)[typeof namespace]) =>
      loginMessages[namespace][key],
}));

describe("login page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("identifies the secure PalBeacon console without unsupported actions", async () => {
    render(await LoginPage({ params: Promise.resolve({ locale: "zh" }) }));

    const headings = screen.getAllByRole("heading");
    expect(headings[0]?.tagName).toBe("H1");
    expect(headings.filter((heading) => heading.tagName === "H1")).toHaveLength(
      1,
    );
    expect(screen.getAllByLabelText("PalBeacon").length).toBeGreaterThan(0);
    expect(screen.queryByText("帕鲁配种协作工作台")).toBeNull();
    expect(
      screen
        .getByRole("link", {
          name: "在 GitHub 上查看 PalHatchHelper",
        })
        .getAttribute("href"),
    ).toBe("https://github.com/MetalLee/PalHatchHelper");
    expect(screen.getByRole("heading", { name: "欢迎回来" })).toBeTruthy();
    expect(screen.getByText("登录你的 PalBeacon 账号")).toBeTruthy();
    expect(screen.queryByText("欢迎回到服务器控制台")).toBeNull();
    const englishTagline = screen.getByText("Keep your world visible.");
    const brandPanel = englishTagline.closest("section");
    expect(brandPanel).not.toBeNull();
    expect(brandPanel?.className).not.toContain("rounded-[2rem]");
    expect(brandPanel?.className).not.toContain("bg-white/28");
    expect(brandPanel?.className).not.toContain("backdrop-blur");
    expect(brandPanel?.textContent).toContain("让每一次培育，都有清晰方向");
    expect(brandPanel?.textContent).toContain("安全连接你的帕鲁世界");
    expect(
      screen.getByRole("link", { name: "了解 PalBeacon" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.getByText("忘记密码？").getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.getByText("注册账号").getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.queryByText("管理员备用登录")).toBeNull();
    expect(
      screen.queryByText(
        "仅使用 Steam 官方 OpenID，不读取云存档，也不会索取密码或 Steam Guard。",
      ),
    ).toBeNull();

    const email = screen.getByLabelText("邮箱");
    const steamLogin = screen.getByRole("link", { name: "使用 Steam 登录" });
    const registration = screen.getByText("注册账号").closest("p");
    expect(
      email.compareDocumentPosition(steamLogin) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      steamLogin.compareDocumentPosition(registration!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const steamIcon = steamLogin.querySelector<HTMLImageElement>(
      'img[src="/brand/steam-icon.svg"]',
    );
    expect(steamIcon).not.toBeNull();
    expect(steamIcon?.getAttribute("width")).toBe("20");
    expect(steamIcon?.getAttribute("height")).toBe("20");
    expect(screen.queryByText(/RLS.*RPC 授权/)).toBeNull();
    expect(screen.queryByText("仅使用当前系统已提供的账号登录。")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /注册|游客|忘记密码/ }),
    ).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "邮箱或密码不正确。",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/zh/overview"));
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
    const submit = screen.getByRole("button", { name: "登录" });
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
