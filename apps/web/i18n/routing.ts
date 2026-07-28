import { defineRouting } from "next-intl/routing";

export const appLocales = ["zh", "en"] as const;

export type AppLocale = (typeof appLocales)[number];
export type CatalogLocale = "zh-CN" | "en-US";

export const routing = defineRouting({
  locales: appLocales,
  defaultLocale: "zh",
  localePrefix: "always",
});

export function isAppLocale(
  value: string | null | undefined,
): value is AppLocale {
  return value === "zh" || value === "en";
}

export function catalogLocaleFor(locale: AppLocale): CatalogLocale {
  return locale === "zh" ? "zh-CN" : "en-US";
}

export function isCatalogLocale(value: string | null): value is CatalogLocale {
  return value === "zh-CN" || value === "en-US";
}

export function stripLocalePrefix(pathname: string): string {
  for (const locale of appLocales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
  }
  return pathname;
}
