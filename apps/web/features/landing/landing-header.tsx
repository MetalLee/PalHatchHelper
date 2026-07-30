"use client";

import { ArrowRight, ChevronRight, Languages, Menu } from "lucide-react";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";

import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { GitHubLink } from "@/components/github-link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { AppLocaleProvider, getCopy } from "@/i18n/client";
import type { AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const GLASS_FULL_PX = 160;

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function LandingLocaleSwitcher({
  locale,
  compact = false,
}: Readonly<{ locale: AppLocale; compact?: boolean }>) {
  const t = getCopy(locale, "LocaleSwitcher");
  return (
    <Suspense
      fallback={
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon" : "default"}
          className={cn("min-h-11 rounded-xl", !compact && "px-3")}
          aria-label={t("current", { language: t(locale) })}
          aria-busy="true"
          disabled
        >
          <Languages aria-hidden="true" className="size-4" />
          {compact ? null : <span>{t(locale)}</span>}
        </Button>
      }
    >
      <LocaleSwitcher compact={compact} />
    </Suspense>
  );
}

export type LandingHeaderLabels = Readonly<{
  navLabel: string;
  mobileNavLabel: string;
  mobileMenu: string;
  navWorkflow: string;
  navFeatures: string;
  navSafety: string;
  navFaq: string;
  navConsole: string;
}>;

export function LandingHeader({
  locale,
  labels,
  sectionHrefPrefix = "",
}: Readonly<{
  locale: AppLocale;
  labels: LandingHeaderLabels;
  sectionHrefPrefix?: string;
}>) {
  return (
    <AppLocaleProvider locale={locale}>
      <LandingHeaderContent
        locale={locale}
        labels={labels}
        sectionHrefPrefix={sectionHrefPrefix}
      />
    </AppLocaleProvider>
  );
}

function LandingHeaderContent({
  locale,
  labels,
  sectionHrefPrefix,
}: Readonly<{
  locale: AppLocale;
  labels: LandingHeaderLabels;
  sectionHrefPrefix: string;
}>) {
  const [scrollTop, setScrollTop] = useState(0);
  const rawProgress = Math.min(scrollTop / GLASS_FULL_PX, 1);
  const progress = smoothstep(rawProgress);
  const hasGlass = progress > 0;
  const blur = progress * 22;
  const saturation = 100 + progress * 18;
  const links = [
    [`${sectionHrefPrefix}#workflow`, labels.navWorkflow],
    [`${sectionHrefPrefix}#features`, labels.navFeatures],
    [`${sectionHrefPrefix}#safety`, labels.navSafety],
    [`${sectionHrefPrefix}#faq`, labels.navFaq],
  ] as const;

  useEffect(() => {
    let frame: number | null = null;
    const updateScrollTop = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        setScrollTop(Math.max(window.scrollY, 0));
        frame = null;
      });
    };

    updateScrollTop();
    window.addEventListener("scroll", updateScrollTop, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateScrollTop);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      data-landing-header
      data-glass={hasGlass ? "true" : "false"}
      data-scroll-progress={progress.toFixed(3)}
      className="fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-150 ease-out motion-reduce:transition-none"
      style={{
        backgroundColor: `rgba(255, 255, 255, ${(progress * 0.86).toFixed(3)})`,
        borderColor: `rgba(255, 255, 255, ${(progress * 0.64).toFixed(3)})`,
        boxShadow: `0 8px 30px rgba(35, 79, 63, ${(progress * 0.09).toFixed(3)})`,
        backdropFilter: `blur(${blur.toFixed(3).replace(/\.000$/, "")}px) saturate(${saturation.toFixed(3).replace(/\.000$/, "")}%)`,
        WebkitBackdropFilter: `blur(${blur.toFixed(3).replace(/\.000$/, "")}px) saturate(${saturation.toFixed(3).replace(/\.000$/, "")}%)`,
      }}
    >
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <a
          href={`/${locale}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl pr-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src={brand.logoPath}
            alt={brand.name}
            width={38}
            height={38}
            priority
          />
          <BrandWordmark className="text-lg" />
        </a>

        <nav
          aria-label={labels.navLabel}
          className="ml-auto hidden items-center gap-1 lg:flex"
        >
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground motion-reduce:transition-none"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-1 lg:flex">
          <GitHubLink className="min-h-11" />
          <LandingLocaleSwitcher locale={locale} />
          <Button asChild className="ml-1 rounded-xl">
            <a href={`/${locale}/login`}>{labels.navConsole}</a>
          </Button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:hidden">
          <GitHubLink className="min-h-11" />
          <LandingLocaleSwitcher locale={locale} compact />
          <details className="relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-transparent bg-transparent px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
              <Menu aria-hidden="true" className="size-4" />
              <span className="max-[359px]:sr-only">{labels.mobileMenu}</span>
            </summary>
            <nav
              aria-label={labels.mobileNavLabel}
              className="absolute right-0 top-12 grid w-64 gap-1 rounded-2xl border border-glass-border bg-white/96 p-2 shadow-float backdrop-blur-xl"
            >
              {links.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-semibold hover:bg-accent"
                >
                  {label}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </a>
              ))}
              <a
                href={`/${locale}/login`}
                className="flex min-h-11 items-center justify-between rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
              >
                {labels.navConsole}
                <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
