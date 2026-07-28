"use client";

import { Languages } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppLocale, useCopy } from "@/i18n/client";
import { usePathname, useRouter } from "@/i18n/navigation";
import { appLocales, isAppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({
  compact = false,
  className,
}: Readonly<{ compact?: boolean; className?: string }>) {
  const locale = useAppLocale();
  const t = useCopy("LocaleSwitcher");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeLocale = (nextLocale: string): void => {
    if (!isAppLocale(nextLocale) || nextLocale === locale) return;
    const query = searchParams.toString();
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    const href = `${pathname}${query === "" ? "" : `?${query}`}${hash}`;
    startTransition(() => router.replace(href, { locale: nextLocale }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon" : "default"}
          className={cn("min-h-11 rounded-xl", !compact && "px-3", className)}
          aria-label={t("current", { language: t(locale) })}
          aria-busy={pending}
        >
          <Languages aria-hidden="true" className="size-4" />
          {compact ? null : <span>{t(locale)}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 rounded-xl">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
          {appLocales.map((candidate) => (
            <DropdownMenuRadioItem key={candidate} value={candidate}>
              {t(candidate)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
