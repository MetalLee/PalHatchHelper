"use client";

import {
  ClipboardList,
  Database,
  Dna,
  House,
  PawPrint,
  type LucideIcon,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { getCopy, useCopy } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

type NavigationLabelKey =
  | "home"
  | "inventory"
  | "breeder"
  | "plans"
  | "dataStatus";

export interface NavigationItem {
  href: string;
  labelKey: NavigationLabelKey;
  icon: LucideIcon;
}

export const workspaceNavigationItems: readonly NavigationItem[] = [
  { href: "/overview", labelKey: "home", icon: House },
  { href: "/pals", labelKey: "inventory", icon: PawPrint },
  { href: "/breeder", labelKey: "breeder", icon: Dna },
  { href: "/plans", labelKey: "plans", icon: ClipboardList },
  { href: "/data-status", labelKey: "dataStatus", icon: Database },
];

const routeTitles = [
  { href: "/admin/bindings", labelKey: "bindings" },
  { href: "/admin/save-parser", labelKey: "saveParser" },
  { href: "/admin/breeding-data", labelKey: "gameData" },
  { href: "/admin/jobs", labelKey: "jobsAi" },
  { href: "/admin/settings", labelKey: "settings" },
  { href: "/admin", labelKey: "admin" },
  { href: "/account", labelKey: "account" },
  ...workspaceNavigationItems.map(({ href, labelKey }) => ({ href, labelKey })),
] as const;

export function isNavigationItemActive(
  activePath: string,
  href: string,
): boolean {
  return activePath === href || activePath.startsWith(`${href}/`);
}

export function currentPageTitle(
  activePath: string,
  locale: AppLocale = "zh",
): string {
  const t = getCopy(locale, "Navigation");
  const labelKey = routeTitles.find(({ href }) =>
    isNavigationItemActive(activePath, href),
  )?.labelKey;
  return labelKey === undefined ? t("workspace") : t(labelKey);
}

interface HighlightGeometry {
  left: number;
  width: number;
  visible: boolean;
}

function hideHighlight(
  setter: Dispatch<SetStateAction<HighlightGeometry>>,
): void {
  setter((current) => ({ ...current, visible: false }));
}

export function AppNavigation({
  activePath,
  className,
}: Readonly<{ activePath: string; className?: string }>) {
  const t = useCopy("Navigation");
  const activeHref = useMemo(
    () =>
      workspaceNavigationItems.find((item) =>
        isNavigationItemActive(activePath, item.href),
      )?.href ?? null,
    [activePath],
  );
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [focusedHref, setFocusedHref] = useState<string | null>(null);
  const hoverHref = hoveredHref ?? focusedHref;
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [activeHighlight, setActiveHighlight] = useState<HighlightGeometry>({
    left: 0,
    width: 0,
    visible: false,
  });
  const [hoverHighlight, setHoverHighlight] = useState<HighlightGeometry>({
    left: 0,
    width: 0,
    visible: false,
  });

  useLayoutEffect(() => {
    const nav = navRef.current;
    const target =
      activeHref === null ? null : linkRefs.current.get(activeHref);
    if (nav === null || target === null || target === undefined) {
      const frame = requestAnimationFrame(() =>
        hideHighlight(setActiveHighlight),
      );
      return () => cancelAnimationFrame(frame);
    }

    const measure = (): void => {
      setActiveHighlight({
        left: target.offsetLeft,
        width: target.offsetWidth,
        visible: true,
      });
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeHref]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const target = hoverHref === null ? null : linkRefs.current.get(hoverHref);
    if (nav === null || target === null || target === undefined) {
      const frame = requestAnimationFrame(() =>
        hideHighlight(setHoverHighlight),
      );
      return () => cancelAnimationFrame(frame);
    }

    const measure = (): void => {
      setHoverHighlight({
        left: target.offsetLeft,
        width: target.offsetWidth,
        visible: true,
      });
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    observer.observe(target);
    return () => observer.disconnect();
  }, [hoverHref]);

  return (
    <nav
      ref={navRef}
      aria-label={t("mainLabel")}
      data-active-href={activeHref ?? undefined}
      data-hovered-href={hoverHref ?? undefined}
      className={cn(
        "relative hidden min-w-0 items-center justify-center gap-1 lg:flex",
        className,
      )}
      onPointerLeave={() => setHoveredHref(null)}
    >
      <span
        aria-hidden="true"
        data-testid="navigation-active-highlight"
        className="pointer-events-none absolute inset-y-0 left-0 z-0 transition-[width,transform,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `${activeHighlight.width}px`,
          opacity: activeHighlight.visible ? 1 : 0,
          transform: `translateX(${activeHighlight.left}px)`,
        }}
      >
        <span className="block size-full rounded-xl bg-accent" />
      </span>

      <span
        aria-hidden="true"
        data-testid="navigation-hover-highlight"
        className="pointer-events-none absolute inset-y-0 left-0 z-0 transition-[width,transform,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `${hoverHighlight.width}px`,
          opacity: hoverHighlight.visible ? 1 : 0,
          transform: `translateX(${hoverHighlight.left}px)`,
        }}
      >
        <span
          key={hoverHref}
          className="nav-highlight-jelly block size-full rounded-xl bg-accent"
        />
      </span>

      {workspaceNavigationItems.map((item) => {
        const active = isNavigationItemActive(activePath, item.href);
        const hovered = hoverHref === item.href;
        const Icon = item.icon;
        return (
          <Link
            ref={(node) => {
              if (node === null) linkRefs.current.delete(item.href);
              else linkRefs.current.set(item.href, node);
            }}
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative z-10 inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-muted-foreground no-underline transition-colors duration-200",
              "hover:text-accent-foreground focus-visible:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
              (active || hovered) && "text-accent-foreground",
              active &&
                !activeHighlight.visible &&
                "bg-accent text-accent-foreground",
            )}
            onPointerEnter={() => setHoveredHref(item.href)}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) {
                setFocusedHref(item.href);
              }
            }}
            onBlur={() => setFocusedHref(null)}
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
