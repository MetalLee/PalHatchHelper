import { cleanup } from "@testing-library/react";
import {
  createElement,
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import { afterEach, vi } from "vitest";

type TestLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, unknown> };
  prefetch?: boolean;
  children?: ReactNode;
};

vi.mock("@/i18n/navigation", () => ({
  Link: forwardRef<HTMLAnchorElement, TestLinkProps>(function TestLink(
    { href, prefetch, ...props },
    ref,
  ) {
    void prefetch;
    return createElement("a", {
      ...props,
      ref,
      href: typeof href === "string" ? href : (href.pathname ?? "/"),
    });
  }),
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    `/${locale}${href}`,
  redirect: vi.fn(),
  usePathname: () => "/overview",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

if (Element.prototype.scrollIntoView === undefined) {
  Element.prototype.scrollIntoView = () => undefined;
}

if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
