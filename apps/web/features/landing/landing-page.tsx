import {
  ArrowDown,
  ArrowRight,
  ChartNoAxesCombined,
  ChevronRight,
  Cloud,
  Database,
  GitBranch,
  Leaf,
  LockKeyhole,
  MonitorSmartphone,
  PackageSearch,
  Server,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

import { PublicFooter } from "../public-content/public-footer";
import {
  publicPageProfiles,
  publicPageSlugs,
} from "../public-content/page-config";

import {
  buildLandingStructuredData,
  LandingStructuredData,
  type LandingFaqItem,
} from "./structured-data";
import { LandingHeader, type LandingHeaderLabels } from "./landing-header";
import { ProductCarousel } from "./product-carousel";

type LandingTranslator = (key: string) => string;

const sectionClassName =
  "mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24";

function SectionHeading({
  eyebrow,
  title,
  description,
}: Readonly<{ eyebrow: string; title: string; description?: string }>) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-7 text-muted-foreground [text-wrap:pretty] sm:text-lg sm:leading-8">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function CommandBlock({ children }: Readonly<{ children: string }>) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-emerald-200 shadow-inner">
      <code>{children}</code>
    </pre>
  );
}

function SystemFlowNode({
  Icon,
  title,
  description,
}: Readonly<{
  Icon: LucideIcon;
  title: string;
  description: string;
}>) {
  return (
    <div
      data-system-node
      className="flex min-w-0 items-center gap-3 rounded-2xl border border-glass-border bg-white/88 p-4 shadow-soft lg:flex-col lg:items-start"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <h4 className="font-bold text-foreground text-balance">{title}</h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground [text-wrap:pretty]">
          {description}
        </p>
      </div>
    </div>
  );
}

function SystemFlowConnector({ label }: Readonly<{ label: string }>) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 py-1 text-primary lg:px-1 lg:py-0">
      <ArrowDown aria-hidden="true" className="size-5 lg:hidden" />
      <ArrowRight aria-hidden="true" className="hidden size-5 lg:block" />
      <span className="max-w-28 text-center text-[0.68rem] font-bold leading-4 text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function SystemFlow({ t }: Readonly<{ t: LandingTranslator }>) {
  return (
    <figure
      data-system-flow
      className="mt-10 rounded-[2rem] border border-emerald-200/80 bg-gradient-to-br from-sky-50/88 via-white to-emerald-50/88 p-5 shadow-soft sm:p-7"
    >
      <figcaption className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
          {t("systemFlowEyebrow")}
        </p>
        <h3 className="mt-2 text-2xl font-bold text-foreground text-balance">
          {t("systemFlowTitle")}
        </h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground [text-wrap:pretty]">
          {t("systemFlowDescription")}
        </p>
      </figcaption>
      <div className="mt-7 grid items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        <SystemFlowNode
          Icon={Server}
          title={t("systemFlowServerTitle")}
          description={t("systemFlowServerBody")}
        />
        <SystemFlowConnector label={t("systemFlowLocal")} />
        <SystemFlowNode
          Icon={SquareTerminal}
          title={t("systemFlowClientTitle")}
          description={t("systemFlowClientBody")}
        />
        <SystemFlowConnector label={t("systemFlowOutbound")} />
        <SystemFlowNode
          Icon={Cloud}
          title={t("systemFlowCloudTitle")}
          description={t("systemFlowCloudBody")}
        />
        <SystemFlowConnector label={t("systemFlowAccess")} />
        <SystemFlowNode
          Icon={MonitorSmartphone}
          title={t("systemFlowBrowserTitle")}
          description={t("systemFlowBrowserBody")}
        />
      </div>
    </figure>
  );
}

export async function LandingPage({
  locale,
  translate,
  publicTranslate,
}: Readonly<{
  locale: AppLocale;
  translate?: LandingTranslator;
  publicTranslate?: LandingTranslator;
}>) {
  const t =
    translate ??
    ((await getTranslations({
      locale,
      namespace: "Landing",
    })) as LandingTranslator);
  const publicT =
    publicTranslate ??
    ((await getTranslations({
      locale,
      namespace: "PublicContent",
    })) as LandingTranslator);
  const headerLabels: LandingHeaderLabels = {
    navLabel: t("navLabel"),
    mobileNavLabel: t("mobileNavLabel"),
    mobileMenu: t("mobileMenu"),
    navWorkflow: t("navWorkflow"),
    navFeatures: t("navFeatures"),
    navSafety: t("navSafety"),
    navFaq: t("navFaq"),
    navConsole: t("navConsole"),
  };
  const faqItems: LandingFaqItem[] = Array.from({ length: 10 }, (_, index) => {
    const number = [
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
    ][index]!;
    return {
      question: t(`faq${number}Question`),
      answer: t(`faq${number}Answer`),
    };
  });
  const structuredData = buildLandingStructuredData({
    locale,
    alternateName: t("websiteAlternateName"),
    softwareDescription: t("softwareDescription"),
    softwareRequirements: t("softwareRequirements"),
    faqItems,
  });
  const workflowSteps = [
    [t("workflowStepOneTitle"), t("workflowStepOneBody")],
    [t("workflowStepTwoTitle"), t("workflowStepTwoBody")],
    [t("workflowStepThreeTitle"), t("workflowStepThreeBody")],
    [t("workflowStepFourTitle"), t("workflowStepFourBody")],
  ] as const;
  const features = [
    [PackageSearch, t("inventoryTitle"), t("inventoryBody")],
    [ChartNoAxesCombined, t("itemInventoryTitle"), t("itemInventoryBody")],
    [GitBranch, t("breedingTitle"), t("breedingBody")],
    [Sparkles, t("plansTitle"), t("plansBody")],
  ] as const;
  const safety = [
    [ShieldCheck, t("safetyReadOnlyTitle"), t("safetyReadOnlyBody")],
    [Database, t("safetyUploadTitle"), t("safetyUploadBody")],
    [LockKeyhole, t("safetyCredentialTitle"), t("safetyCredentialBody")],
    [Leaf, t("safetyBoundaryTitle"), t("safetyBoundaryBody")],
  ] as const;

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-xl bg-white px-4 py-3 font-semibold text-foreground shadow-float focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("skip")}
      </a>
      <LandingHeader locale={locale} labels={headerLabels} />
      <main id="main-content">
        <section className="relative isolate overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-20 bg-[image:var(--forest-scenery-sky)]"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-32 -left-20 -z-10 h-80 w-[55%] rounded-[50%] bg-leaf/18"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-40 -right-24 -z-10 h-96 w-[62%] rounded-[50%] bg-primary/14"
          />
          <div className="mx-auto grid min-h-dvh w-full max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.86fr_1.14fr] lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">
                {t("heroEyebrow")}
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-[-0.045em] text-foreground text-balance sm:text-5xl lg:text-6xl lg:leading-[1.08]">
                {locale === "zh" ? (
                  <>
                    <span className="block">幻兽帕鲁</span>
                    <span className="block">服务器控制台</span>
                  </>
                ) : (
                  t("heroTitle")
                )}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground [text-wrap:pretty] sm:text-lg sm:leading-8">
                {t("heroDescription")}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  asChild
                  size="lg"
                  className="rounded-xl shadow-[0_14px_34px_rgb(40_122_84_/_0.22)]"
                >
                  <Link href="/login" locale={locale}>
                    {t("heroPrimary")}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-xl bg-white/72"
                >
                  <Link href="/overview" locale={locale}>
                    {t("heroConsole")}
                  </Link>
                </Button>
              </div>
            </div>
            <ProductCarousel locale={locale} />
          </div>
        </section>

        <section id="explore" className="border-b border-white/70 bg-white/40">
          <div className={sectionClassName}>
            <SectionHeading
              eyebrow={publicT("exploreEyebrow")}
              title={publicT("exploreTitle")}
              description={publicT("exploreDescription")}
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {publicPageSlugs.map((slug) => {
                const profile = publicPageProfiles[slug];
                const Icon = profile.Icon;
                return (
                  <Link
                    key={slug}
                    href={`/${slug}`}
                    locale={locale}
                    className="group flex min-h-56 flex-col rounded-3xl border border-glass-border bg-white/84 p-5 shadow-soft transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
                  >
                    <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <h2 className="mt-5 text-lg font-bold text-foreground text-balance">
                      {publicT(`${profile.messageKey}CardTitle`)}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground [text-wrap:pretty]">
                      {publicT(`${profile.messageKey}CardDescription`)}
                    </p>
                    <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-primary">
                      {publicT("relatedRead")}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section id="workflow" className={sectionClassName}>
          <SectionHeading
            eyebrow={t("workflowEyebrow")}
            title={t("workflowTitle")}
            description={t("workflowDescription")}
          />
          <ol className="mt-12 grid gap-4 lg:grid-cols-2">
            {workflowSteps.map(([title, body], index) => (
              <li
                key={title}
                className="rounded-3xl border border-glass-border bg-white/78 p-5 shadow-soft backdrop-blur sm:p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="text-lg font-bold text-balance">{title}</h3>
                </div>
                {index === 1 ? (
                  <div className="mt-4">
                    <CommandBlock>npm install -g palbeacon-cli</CommandBlock>
                  </div>
                ) : null}
                {index === 2 ? (
                  <div className="mt-4 grid gap-2">
                    <CommandBlock>palbeacon init</CommandBlock>
                    <CommandBlock>palbeacon run</CommandBlock>
                  </div>
                ) : null}
                <p className="mt-4 text-sm leading-7 text-muted-foreground [text-wrap:pretty]">
                  {body}
                </p>
                {index === 1 ? (
                  <div
                    className="mt-4 flex flex-wrap gap-2"
                    aria-label={t("workflowRequirement")}
                  >
                    {[t("workflowLinux"), t("workflowNode")].map((value) => (
                      <span
                        key={value}
                        className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground"
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section id="features" className="border-y border-white/70 bg-white/40">
          <div className={sectionClassName}>
            <SectionHeading
              eyebrow={t("featuresEyebrow")}
              title={t("featuresTitle")}
              description={t("featuresDescription")}
            />
            <SystemFlow t={t} />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {features.map(([Icon, title, body]) => (
                <article
                  key={title}
                  className="rounded-3xl border border-glass-border bg-white/82 p-6 shadow-soft"
                >
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-balance">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground [text-wrap:pretty]">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="safety" className={sectionClassName}>
          <SectionHeading
            eyebrow={t("safetyEyebrow")}
            title={t("safetyTitle")}
            description={t("safetyDescription")}
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            {safety.map(([Icon, title, body]) => (
              <article
                key={title}
                className="flex gap-4 rounded-3xl border border-glass-border bg-white/78 p-5 shadow-soft sm:p-6"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-balance">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground [text-wrap:pretty]">
                    {body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="border-t border-white/70 bg-white/42">
          <div className={sectionClassName}>
            <SectionHeading eyebrow={t("faqEyebrow")} title={t("faqTitle")} />
            <div className="mx-auto mt-12 grid max-w-4xl gap-3">
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
      </main>

      <PublicFooter
        locale={locale}
        tagline={t("footerTagline")}
        developer={t("footerDeveloper")}
        disclaimer={t("footerDisclaimer")}
        exploreTitle={publicT("footerExplore")}
        navigationLabel={publicT("footerNavigationLabel")}
        links={publicPageSlugs.map((slug) => ({
          slug,
          label: publicT(`${publicPageProfiles[slug].messageKey}CardTitle`),
        }))}
      />
      <LandingStructuredData values={structuredData} />
    </div>
  );
}
