import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../messages/zh.json";

const replace = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/plans/plan-42",
  useRouter: () => ({ replace }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=route"),
}));

import { LocaleSwitcher } from "../components/locale-switcher";

describe("LocaleSwitcher", () => {
  beforeEach(() => replace.mockClear());

  it("switches locale while preserving the dynamic pathname and query", () => {
    render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <LocaleSwitcher />
      </NextIntlClientProvider>,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "当前语言：中文" }), {
      key: "Enter",
      code: "Enter",
    });
    fireEvent.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(replace).toHaveBeenCalledWith("/plans/plan-42?tab=route", {
      locale: "en",
    });
  });
});
