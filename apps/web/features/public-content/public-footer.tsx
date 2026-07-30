import Image from "next/image";

import { brand } from "@/config/brand";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

import type { PublicPageSlug } from "./page-config";

export type PublicFooterLink = Readonly<{
  slug: PublicPageSlug;
  label: string;
}>;

export function PublicFooter({
  locale,
  tagline,
  developer,
  disclaimer,
  exploreTitle,
  navigationLabel,
  links,
}: Readonly<{
  locale: AppLocale;
  tagline: string;
  developer: string;
  disclaimer: string;
  exploreTitle: string;
  navigationLabel: string;
  links: readonly PublicFooterLink[];
}>) {
  return (
    <footer className="border-t border-border/70 bg-foreground px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)] lg:items-end">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src={brand.logoPath}
              alt={brand.name}
              width={42}
              height={42}
            />
            <span className="text-xl font-bold">PalBeacon</span>
          </div>
          <p className="mt-3 font-semibold text-emerald-200">{tagline}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
            {disclaimer}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
            <a
              className="inline-flex min-h-11 items-center rounded-lg hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              href="mailto:ghsy950525@gmail.com"
            >
              {developer}
            </a>
            <span className="min-h-11 content-center text-white/60">
              © {new Date().getUTCFullYear()}
            </span>
          </div>
        </div>
        <nav aria-label={navigationLabel}>
          <p className="text-sm font-bold tracking-[0.12em] text-emerald-200 uppercase">
            {exploreTitle}
          </p>
          <ul className="mt-3 grid gap-x-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {links.map(({ slug, label }) => (
              <li key={slug}>
                <Link
                  href={`/${slug}`}
                  locale={locale}
                  className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-white/80 transition-colors hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 motion-reduce:transition-none"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
