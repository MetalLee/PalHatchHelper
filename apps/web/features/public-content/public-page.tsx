import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Home,
  Network,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

import {
  LandingHeader,
  type LandingHeaderLabels,
} from "../landing/landing-header";
import { PublicFooter } from "./public-footer";
import {
  publicPageProfiles,
  publicPageSlugs,
  type PublicPageSlug,
} from "./page-config";
import {
  buildPublicPageStructuredData,
  PublicPageStructuredData,
  type PublicFaqItem,
} from "./structured-data";

type PublicTranslator = (key: string) => string;

const contentClassName =
  "mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8 lg:py-20";

function commandBlock(command: string) {
  return (
    <pre
      key={command}
      className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-emerald-200 shadow-inner"
    >
      <code>{command}</code>
    </pre>
  );
}

function RoutePrinciple({ t }: Readonly<{ t: PublicTranslator }>) {
  const nodes = ["parents", "intermediate", "target"] as const;
  return (
    <figure className="mt-7 rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 shadow-soft sm:p-7">
      <figcaption className="font-bold text-foreground">
        {t("passiveRouteDiagramTitle")}
      </figcaption>
      <div className="mt-5 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {nodes.map((node, index) => (
          <div key={node} className="contents">
            <div className="rounded-2xl border border-glass-border bg-white/88 p-4 text-center shadow-soft">
              <Network
                aria-hidden="true"
                className="mx-auto size-5 text-primary"
              />
              <p className="mt-2 text-sm font-bold">
                {t(
                  `passiveRouteDiagram${node[0]!.toUpperCase()}${node.slice(1)}`,
                )}
              </p>
            </div>
            {index < nodes.length - 1 ? (
              <ArrowRight
                aria-hidden="true"
                className="mx-auto size-5 rotate-90 text-primary sm:rotate-0"
              />
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {t("passiveRouteDiagramCaption")}
      </p>
    </figure>
  );
}

export async function PublicContentPage({
  locale,
  slug,
  translate,
  landingTranslate,
}: Readonly<{
  locale: AppLocale;
  slug: PublicPageSlug;
  translate?: PublicTranslator;
  landingTranslate?: PublicTranslator;
}>) {
  const t =
    translate ??
    ((await getTranslations({
      locale,
      namespace: "PublicContent",
    })) as PublicTranslator);
  const landingT =
    landingTranslate ??
    ((await getTranslations({
      locale,
      namespace: "Landing",
    })) as PublicTranslator);
  const profile = publicPageProfiles[slug];
  const prefix = profile.messageKey;
  const title = t(`${prefix}Title`);
  const description = t(`${prefix}MetadataDescription`);
  const headerLabels: LandingHeaderLabels = {
    navLabel: landingT("navLabel"),
    mobileNavLabel: landingT("mobileNavLabel"),
    mobileMenu: landingT("mobileMenu"),
    navWorkflow: landingT("navWorkflow"),
    navFeatures: landingT("navFeatures"),
    navSafety: landingT("navSafety"),
    navFaq: landingT("navFaq"),
    navConsole: landingT("navConsole"),
  };
  const faqItems: PublicFaqItem[] = profile.faqKeys.map((key) => ({
    question: t(`${prefix}Faq${key[0]!.toUpperCase()}${key.slice(1)}Question`),
    answer: t(`${prefix}Faq${key[0]!.toUpperCase()}${key.slice(1)}Answer`),
  }));
  const footerLinks = publicPageSlugs.map((pageSlug) => ({
    slug: pageSlug,
    label: t(`${publicPageProfiles[pageSlug].messageKey}CardTitle`),
  }));
  const structuredData = buildPublicPageStructuredData({
    locale,
    slug,
    title,
    description,
    homeLabel: t("homeLabel"),
    faqItems,
  });
  const Icon = profile.Icon;

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-xl bg-white px-4 py-3 font-semibold text-foreground shadow-float focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("skip")}
      </a>
      <LandingHeader
        locale={locale}
        labels={headerLabels}
        sectionHrefPrefix={`/${locale}/`}
      />
      <main id="main-content">
        <section className="relative isolate overflow-hidden border-b border-white/70 pt-24">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-20 bg-[image:var(--forest-scenery-sky)]"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-32 -left-16 -z-10 h-72 w-[56%] rounded-[50%] bg-leaf/16"
          />
          <div className="mx-auto w-full max-w-5xl px-4 pb-14 pt-5 sm:px-6 sm:pb-18 lg:px-8 lg:pb-20">
            <nav aria-label={t("breadcrumbLabel")}>
              <ol className="flex min-h-11 flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
                <li>
                  <Link
                    href="/"
                    locale={locale}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Home aria-hidden="true" className="size-4" />
                    {t("homeLabel")}
                  </Link>
                </li>
                <li aria-hidden="true">
                  <ChevronRight className="size-4" />
                </li>
                <li aria-current="page" className="text-foreground">
                  {title}
                </li>
              </ol>
            </nav>
            <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">
                  {t(`${prefix}Eyebrow`)}
                </p>
                <h1 className="mt-3 text-4xl font-bold tracking-[-0.045em] text-foreground text-balance sm:text-5xl lg:text-6xl lg:leading-[1.08]">
                  {title}
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground [text-wrap:pretty] sm:text-lg sm:leading-8">
                  {t(`${prefix}Intro`)}
                </p>
                <Button
                  asChild
                  size="lg"
                  className="mt-7 rounded-xl shadow-[0_14px_34px_rgb(40_122_84_/_0.22)]"
                >
                  <Link href={profile.ctaHref} locale={locale}>
                    {t(`${prefix}Cta`)}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
              </div>
              <div className="hidden rounded-[2rem] border border-emerald-200/80 bg-white/72 p-7 text-primary shadow-soft backdrop-blur lg:grid lg:place-items-center">
                <Icon
                  aria-hidden="true"
                  className="size-20"
                  strokeWidth={1.4}
                />
              </div>
            </div>
          </div>
        </section>

        <div className={contentClassName}>
          <div className="grid gap-5">
            {profile.sections.map((section, index) => {
              const sectionPrefix = `${prefix}${section.key[0]!.toUpperCase()}${section.key.slice(1)}`;
              return (
                <section
                  key={section.key}
                  className="scroll-mt-24 rounded-[2rem] border border-glass-border bg-white/82 p-5 shadow-soft sm:p-7"
                >
                  <div className="flex items-start gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-2xl font-bold tracking-[-0.025em] text-foreground text-balance">
                        {t(`${sectionPrefix}Title`)}
                      </h2>
                      <p className="mt-3 text-base leading-7 text-muted-foreground [text-wrap:pretty]">
                        {t(`${sectionPrefix}Body`)}
                      </p>
                    </div>
                  </div>
                  {"commands" in section ? (
                    <div className="mt-5 grid gap-2">
                      {section.commands.map(commandBlock)}
                    </div>
                  ) : null}
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {section.points.map((point) => (
                      <li
                        key={point}
                        className="flex gap-3 rounded-2xl bg-secondary/55 p-4 text-sm leading-6 text-secondary-foreground"
                      >
                        <CheckCircle2
                          aria-hidden="true"
                          className="mt-0.5 size-5 shrink-0 text-primary"
                        />
                        <span>
                          {t(
                            `${sectionPrefix}Point${point[0]!.toUpperCase()}${point.slice(1)}`,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {slug === "passive-breeding-route" && index === 0 ? (
                    <RoutePrinciple t={t} />
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>

        <section className="border-y border-white/70 bg-white/42">
          <div className={contentClassName}>
            <p className="text-center text-xs font-bold tracking-[0.18em] text-primary uppercase">
              {t("faqEyebrow")}
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold tracking-[-0.035em] text-foreground text-balance sm:text-4xl">
              {t(`${prefix}FaqTitle`)}
            </h2>
            <div className="mx-auto mt-9 grid max-w-4xl gap-3">
              {faqItems.map(({ question, answer }, index) => (
                <details
                  key={question}
                  open={index === 0}
                  className="group rounded-2xl border border-glass-border bg-white/84 px-5 py-1 shadow-soft"
                >
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-bold text-foreground">
                    <span className="text-balance">{question}</span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 text-primary transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    />
                  </summary>
                  <p className="border-t border-border/70 pb-5 pt-4 text-sm leading-7 text-muted-foreground [text-wrap:pretty]">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={contentClassName}>
          <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">
            {t("relatedEyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-foreground text-balance">
            {t("relatedTitle")}
          </h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {profile.related.map((related) => {
              const isHome = related === "home";
              const relatedProfile = isHome
                ? undefined
                : publicPageProfiles[related];
              return (
                <Link
                  key={related}
                  href={isHome ? "/" : `/${related}`}
                  locale={locale}
                  className="group flex min-h-32 flex-col justify-between rounded-3xl border border-glass-border bg-white/82 p-5 shadow-soft transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <span className="font-bold text-foreground">
                    {isHome
                      ? t("homeCardTitle")
                      : t(`${relatedProfile!.messageKey}CardTitle`)}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    {t("relatedRead")}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-12 rounded-[2rem] bg-gradient-to-br from-primary to-emerald-700 p-6 text-white shadow-float sm:p-9">
            <p className="text-xs font-bold tracking-[0.16em] text-emerald-100 uppercase">
              {t("ctaEyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-bold text-balance">
              {t(`${prefix}CtaTitle`)}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">
              {t(`${prefix}CtaBody`)}
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="mt-6 rounded-xl"
            >
              <Link href={profile.ctaHref} locale={locale}>
                {t(`${prefix}Cta`)}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <PublicFooter
        locale={locale}
        tagline={landingT("footerTagline")}
        developer={landingT("footerDeveloper")}
        disclaimer={landingT("footerDisclaimer")}
        exploreTitle={t("footerExplore")}
        navigationLabel={t("footerNavigationLabel")}
        links={footerLinks}
      />
      <PublicPageStructuredData values={structuredData} />
    </div>
  );
}
