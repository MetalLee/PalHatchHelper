"use client";

import {
  CircleDashed,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GitBranch,
  MapPin,
  Mars,
  Pause,
  Play,
  Search,
  Sparkles,
  Users,
  UserRound,
  Venus,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { getCopy } from "@/i18n/client";
import type { AppLocale } from "@/i18n/routing";
import { palPortraitPath } from "@/lib/pal-assets";
import { cn } from "@/lib/utils";

const AUTOPLAY_DELAY_MS = 6000;

type PreviewPassive = Readonly<{ name: string; rank: 1 | 3 | 4 }>;

const PREVIEW_PASSIVE_RANKS = {
  serious: 1,
  artisan: 3,
  lucky: 4,
  nimble: 1,
} as const;

function getPreviewPassives(locale: AppLocale) {
  const t = getCopy(locale, "Landing");
  return {
    serious: {
      name: t("carouselPlanPassiveOne"),
      rank: PREVIEW_PASSIVE_RANKS.serious,
    },
    artisan: {
      name: t("carouselPlanPassiveTwo"),
      rank: PREVIEW_PASSIVE_RANKS.artisan,
    },
    lucky: {
      name: t("carouselPlanPassiveThree"),
      rank: PREVIEW_PASSIVE_RANKS.lucky,
    },
    nimble: {
      name: t("carouselPlanPassiveFour"),
      rank: PREVIEW_PASSIVE_RANKS.nimble,
    },
  } as const;
}

export function ProductCarousel({ locale }: Readonly<{ locale: AppLocale }>) {
  const t = getCopy(locale, "Landing");
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const slides = [
    {
      label: t("carouselInventory"),
      content: <InventorySlide locale={locale} />,
    },
    { label: t("carouselRoute"), content: <RouteSlide locale={locale} /> },
    { label: t("carouselPlans"), content: <PlansSlide locale={locale} /> },
  ];

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReduceMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (paused || interacting || reduceMotion) return;
    const timer = window.setInterval(
      () => setActiveIndex((current) => (current + 1) % slides.length),
      AUTOPLAY_DELAY_MS,
    );
    return () => window.clearInterval(timer);
  }, [interacting, paused, reduceMotion, slides.length]);

  function showPrevious() {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  }

  function showNext() {
    setActiveIndex((current) => (current + 1) % slides.length);
  }

  return (
    <div
      className="relative mx-auto w-full min-w-0 max-w-xl"
      role="region"
      aria-roledescription="carousel"
      aria-label={t("carouselLabel")}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setInteracting(false);
        }
      }}
    >
      <div className="absolute -inset-6 -z-10 rounded-full bg-sky/20 blur-3xl" />
      <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/84 shadow-float backdrop-blur-xl">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/70 bg-white/72 p-2 sm:gap-2 sm:p-3">
          {slides.map((slide, index) => (
            <button
              key={slide.label}
              type="button"
              aria-current={activeIndex === index ? "true" : undefined}
              aria-label={t("carouselShowSlide", {
                slide: index + 1,
                label: slide.label,
              })}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "min-h-10 flex-1 rounded-xl px-2 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:px-3 sm:text-sm",
                activeIndex === index
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {slide.label}
            </button>
          ))}
        </div>

        <div className="grid bg-gradient-to-br from-sky-50/70 via-white to-emerald-50/65">
          {slides.map((slide, index) => (
            <div
              key={slide.label}
              data-carousel-slide
              data-active={activeIndex === index ? "true" : "false"}
              aria-hidden={activeIndex !== index}
              className={cn(
                "col-start-1 row-start-1 min-w-0 p-2.5 transition-[opacity,transform] duration-500 motion-reduce:transition-none min-[360px]:p-4 sm:p-5",
                activeIndex === index
                  ? "relative z-10 translate-x-0 opacity-100"
                  : "pointer-events-none translate-x-3 opacity-0",
              )}
            >
              {slide.content}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-white/78 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1" aria-hidden="true">
            {slides.map((slide, index) => (
              <span
                key={slide.label}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none",
                  activeIndex === index ? "w-6 bg-primary" : "w-1.5 bg-border",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-10 rounded-xl"
              aria-label={paused ? t("carouselPlay") : t("carouselPause")}
              onClick={() => setPaused((current) => !current)}
            >
              {paused ? (
                <Play aria-hidden="true" className="size-4" />
              ) : (
                <Pause aria-hidden="true" className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-10 rounded-xl"
              aria-label={t("carouselPrevious")}
              onClick={showPrevious}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-10 rounded-xl"
              aria-label={t("carouselNext")}
              onClick={showNext}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventorySlide({ locale }: Readonly<{ locale: AppLocale }>) {
  const t = getCopy(locale, "Landing");
  const pals = [
    {
      id: "sheepball",
      name: t("carouselPalOne"),
      owner: t("carouselOwnerYou"),
      location: t("carouselLocationBox"),
      passive: {
        name: t("carouselPassiveOne"),
        rank: PREVIEW_PASSIVE_RANKS.serious,
      },
      gender: "male" as const,
    },
    {
      id: "naughtycat",
      name: t("carouselPalTwo"),
      owner: t("carouselOwnerGuild"),
      location: t("carouselLocationBase"),
      passive: {
        name: t("carouselPassiveTwo"),
        rank: PREVIEW_PASSIVE_RANKS.artisan,
      },
      gender: "female" as const,
    },
    {
      id: "chickenpal",
      name: t("carouselPalThree"),
      owner: t("carouselOwnerGuild"),
      location: t("carouselLocationBox"),
      passive: {
        name: t("carouselPlanPassiveThree"),
        rank: PREVIEW_PASSIVE_RANKS.lucky,
      },
      gender: "female" as const,
    },
    {
      id: "cutefox",
      name: t("carouselPalFour"),
      owner: t("carouselOwnerYou"),
      location: t("carouselLocationBase"),
      passive: {
        name: t("carouselPassiveTwo"),
        rank: PREVIEW_PASSIVE_RANKS.artisan,
      },
      gender: "male" as const,
    },
  ];

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-white/88 px-3 text-sm text-muted-foreground shadow-sm">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{t("carouselInventorySearch")}</span>
          <span className="ml-auto shrink-0 rounded-lg bg-secondary px-2 py-1 text-xs font-bold text-secondary-foreground">
            {t("carouselInventoryCount")}
          </span>
        </div>
        <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-emerald-100 px-2.5 text-xs font-bold text-emerald-800 max-[420px]:sr-only">
          <Clock3 aria-hidden="true" className="size-3.5" />
          {t("carouselLatest")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {pals.map((pal) => (
          <article
            key={pal.id}
            data-inventory-card
            className="min-w-0 overflow-hidden rounded-2xl border border-glass-border bg-white/92 shadow-soft"
          >
            <div className="flex min-w-0 items-center gap-2 p-2 sm:gap-3 sm:p-3">
              <Image
                src={palPortraitPath(pal.id)}
                alt=""
                width={48}
                height={48}
                className="size-9 shrink-0 rounded-xl border border-white bg-white object-contain shadow-sm sm:size-12"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-sm font-bold text-foreground sm:text-base">
                    {pal.name}
                  </h3>
                  {pal.gender === "male" ? (
                    <Mars
                      aria-label={t("carouselMale")}
                      className="size-3.5 shrink-0 text-sky-600 max-[359px]:hidden sm:size-4"
                    />
                  ) : (
                    <Venus
                      aria-label={t("carouselFemale")}
                      className="size-3.5 shrink-0 text-rose-500 max-[359px]:hidden sm:size-4"
                    />
                  )}
                </div>
              </div>
            </div>
            <div
              data-inventory-details
              className="grid gap-1.5 bg-muted/15 px-2 py-2 text-[0.68rem] text-muted-foreground sm:px-3 sm:text-xs"
            >
              <p
                data-inventory-owner
                className="flex min-w-0 items-center gap-1.5"
              >
                <UserRound
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-primary"
                />
                <span className="truncate">{pal.owner}</span>
              </p>
              <p
                data-inventory-location
                className="flex min-w-0 items-center gap-1.5"
              >
                <MapPin
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-primary"
                />
                <span className="truncate">{pal.location}</span>
              </p>
            </div>
            <div
              data-inventory-passives
              className="border-t border-border/60 bg-muted/30 p-2 sm:px-3"
            >
              <PassiveBadge
                name={pal.passive.name}
                rank={pal.passive.rank}
                className="min-h-6 w-fit px-2 py-0.5 text-xs"
              />
            </div>
          </article>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-xs font-semibold text-emerald-900">
        <Users aria-hidden="true" className="size-4 shrink-0" />
        <span className="[text-wrap:pretty]">{t("carouselInventoryHint")}</span>
      </div>
    </div>
  );
}

function RouteSlide({ locale }: Readonly<{ locale: AppLocale }>) {
  const t = getCopy(locale, "Landing");
  const passives = getPreviewPassives(locale);
  return (
    <div className="grid gap-3">
      <div
        data-route-tree
        data-route-layout="generations"
        data-route-generations="2"
        data-route-passive-count="4"
        className="overflow-hidden rounded-2xl border border-border/70 bg-white/88 p-2 shadow-sm sm:p-3"
      >
        <div className="grid grid-cols-3 gap-[6.5%] px-[1%] pb-2 text-center text-[0.64rem] font-bold tracking-[0.08em] text-muted-foreground min-[460px]:text-xs">
          <span>{t("carouselInitialParents")}</span>
          <span>{t("carouselGenerationOne")}</span>
          <span>{t("carouselGenerationTwo")}</span>
        </div>
        <div className="relative h-[14.25rem] min-[460px]:h-[19.25rem]">
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 z-0 size-full overflow-visible text-emerald-600/65"
          >
            <defs>
              <marker
                id="landing-route-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor" />
              </marker>
            </defs>
            <path
              data-route-edge
              d="M29 24 H35"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              markerEnd="url(#landing-route-arrow)"
            />
            <path
              data-route-edge
              d="M29 76 C34 76 31 24 35 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              markerEnd="url(#landing-route-arrow)"
            />
            <path
              data-route-edge
              d="M64.5 24 H71"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              markerEnd="url(#landing-route-arrow)"
            />
            <path
              data-route-edge
              d="M64.5 76 C69 76 67 24 71 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              markerEnd="url(#landing-route-arrow)"
            />
          </svg>

          <div className="absolute left-0 top-0 z-10 w-[29%]">
            <RoutePreviewCard
              palId="sheepball"
              role={t("carouselMotherRole")}
              name={t("carouselTreeParentAName")}
              status={t("carouselInventoryReady")}
              gender="female"
              detail={t("carouselRouteOwner")}
              location={t("carouselRouteLocation")}
              passives={[passives.artisan, passives.serious]}
              tone="inventory"
              locale={locale}
            />
          </div>
          <div className="absolute bottom-0 left-0 z-10 w-[29%]">
            <RoutePreviewCard
              palId="naughtycat"
              role={t("carouselFatherRole")}
              name={t("carouselTreeParentBName")}
              status={t("carouselInventoryReady")}
              gender="male"
              detail={t("carouselOwnerGuild")}
              location={t("carouselRouteLocation")}
              passives={[passives.lucky, passives.nimble]}
              tone="inventory"
              locale={locale}
            />
          </div>
          <div className="absolute left-[35.5%] top-0 z-10 w-[29%]">
            <RoutePreviewCard
              palId="carbunclo"
              role={t("carouselIntermediateRole")}
              name={t("carouselTreeIntermediateName")}
              status={t("carouselIntermediateStatus")}
              gender="female"
              detail={t("carouselRouteProduced")}
              location={t("carouselRouteProducedLocation")}
              passives={[passives.artisan, passives.serious]}
              tone="intermediate"
              locale={locale}
            />
          </div>
          <div className="absolute bottom-0 left-[35.5%] z-10 w-[29%]">
            <RoutePreviewCard
              palId="cutefox"
              role={t("carouselFatherRole")}
              name={t("carouselTreeParentCName")}
              status={t("carouselInventoryReady")}
              gender="male"
              detail={t("carouselRouteOwner")}
              location={t("carouselRouteLocation")}
              passives={[passives.lucky, passives.nimble]}
              tone="inventory"
              locale={locale}
            />
          </div>
          <div
            data-route-target
            className="absolute right-0 top-0 z-10 w-[29%]"
          >
            <RoutePreviewCard
              palId="cutebutterfly"
              role={t("carouselFinalRole")}
              name={t("carouselTreeTargetName")}
              status={t("carouselTargetStatus")}
              gender="pending"
              detail={t("carouselRouteFinal")}
              location={t("carouselRouteFinalLocation")}
              passives={[
                passives.artisan,
                passives.serious,
                passives.lucky,
                passives.nimble,
              ]}
              tone="target"
              locale={locale}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border/60 rounded-xl bg-white/78 py-2 shadow-sm">
        <CompactMetric value="2" label={t("carouselGenerations")} />
        <CompactMetric value="4" label={t("carouselTargetPassives")} />
        <CompactMetric value="0" label={t("carouselMissing")} />
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground shadow-sm">
        <GitBranch aria-hidden="true" className="size-4 shrink-0" />
        <span className="[text-wrap:pretty]">{t("carouselRouteHint")}</span>
      </div>
    </div>
  );
}

function PlansSlide({ locale }: Readonly<{ locale: AppLocale }>) {
  const t = getCopy(locale, "Landing");
  const passives = getPreviewPassives(locale);
  const plans = [
    {
      id: "route-a",
      palId: "carbunclo",
      title: t("carouselPlanTargetOne"),
      status: t("carouselPlanReady"),
      saved: t("carouselPlanSaved"),
      statusClass: "bg-emerald-100 text-emerald-800",
      passives: [
        passives.serious,
        passives.artisan,
        passives.lucky,
        passives.nimble,
      ],
      generations: "3",
      steps: "4",
      missing: "0",
    },
    {
      id: "route-b",
      palId: "cutebutterfly",
      title: t("carouselPlanTargetTwo"),
      status: t("carouselPlanNeedsInventory"),
      saved: t("carouselPlanSavedEarlier"),
      statusClass: "bg-amber-100 text-amber-900",
      passives: [
        passives.artisan,
        passives.lucky,
        passives.serious,
        passives.nimble,
      ],
      generations: "2",
      steps: "3",
      missing: "1",
    },
  ] as const;
  return (
    <div className="grid gap-2.5">
      {plans.map((plan) => (
        <article
          key={plan.id}
          data-plan-card
          className="overflow-hidden rounded-2xl border border-glass-border bg-white/92 shadow-soft"
        >
          <div className="flex min-w-0 items-center gap-3 p-3">
            <Image
              src={palPortraitPath(plan.palId)}
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-2xl border border-white bg-white object-contain shadow-sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-1 text-[0.68rem] font-bold",
                    plan.statusClass,
                  )}
                >
                  {plan.status}
                </span>
                <span className="truncate text-[0.68rem] text-muted-foreground">
                  {plan.saved}
                </span>
              </div>
              <h3 className="mt-1.5 truncate text-base font-bold text-foreground">
                {plan.title}
              </h3>
            </div>
          </div>
          <div className="border-t border-border/60 px-3 py-2.5">
            <p className="sr-only">{t("carouselPlanPassives")}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {plan.passives.map((passive) => (
                <PassiveBadge
                  key={passive.name}
                  name={passive.name}
                  rank={passive.rank}
                  className="min-h-6 w-full justify-start px-2 py-0.5 text-[0.68rem]"
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60 bg-muted/35 py-2">
            <CompactMetric
              value={plan.generations}
              label={t("carouselGenerations")}
            />
            <CompactMetric value={plan.steps} label={t("carouselSteps")} />
            <CompactMetric value={plan.missing} label={t("carouselMissing")} />
          </div>
        </article>
      ))}
      <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 text-sm font-bold text-primary">
        <Sparkles aria-hidden="true" className="size-4" />
        {t("carouselPlanView")}
      </div>
    </div>
  );
}

function RoutePreviewCard({
  palId,
  role,
  name,
  status,
  gender,
  detail,
  location,
  passives,
  tone,
  locale,
}: Readonly<{
  palId: string;
  role: string;
  name: string;
  status: string;
  gender: "male" | "female" | "pending";
  detail: string;
  location: string;
  passives: readonly PreviewPassive[];
  tone: "inventory" | "intermediate" | "target";
  locale: AppLocale;
}>) {
  const t = getCopy(locale, "Landing");
  const toneClass = {
    inventory: "border-emerald-200 from-white to-emerald-50/55",
    intermediate: "border-sky-200 from-sky-50/85 to-white",
    target: "border-violet-200 from-violet-50/85 to-emerald-50/55",
  }[tone];
  const heightClass =
    tone === "target"
      ? "h-[7.5rem] min-[460px]:h-44"
      : "h-[6.75rem] min-[460px]:h-[9.25rem]";
  return (
    <article
      data-route-node
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-gradient-to-br p-1.5 shadow-sm min-[460px]:rounded-2xl min-[460px]:p-2",
        heightClass,
        toneClass,
      )}
    >
      <div className="flex min-w-0 items-center gap-1 min-[460px]:gap-2">
        <Image
          src={palPortraitPath(palId)}
          alt=""
          width={36}
          height={36}
          className="size-6 shrink-0 rounded-full border border-white bg-white object-contain shadow-sm max-[359px]:hidden min-[460px]:size-8"
        />
        <div className="min-w-0">
          <p className="truncate text-[0.55rem] font-bold text-primary max-[359px]:sr-only min-[460px]:text-[0.68rem]">
            {role}
          </p>
          <h3 className="truncate text-[0.6rem] font-bold text-foreground min-[360px]:text-[0.65rem] min-[460px]:text-sm">
            {name}
          </h3>
        </div>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
        <span
          className={cn(
            "truncate rounded-full border px-1.5 py-0.5 text-[0.5rem] font-bold min-[460px]:text-[0.62rem]",
            tone === "target"
              ? "border-violet-300 bg-violet-600 text-white"
              : tone === "intermediate"
                ? "border-sky-200 bg-sky-50 text-sky-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {status}
        </span>
        <span className="inline-flex items-center gap-0.5 text-[0.55rem] font-semibold text-muted-foreground min-[460px]:text-[0.62rem]">
          {gender === "male" ? (
            <Mars aria-hidden="true" className="size-3 text-sky-600" />
          ) : gender === "female" ? (
            <Venus aria-hidden="true" className="size-3 text-rose-500" />
          ) : (
            <CircleDashed
              aria-hidden="true"
              className="size-3 text-slate-400"
            />
          )}
          <span className="max-[459px]:sr-only">
            {gender === "male"
              ? t("carouselMale")
              : gender === "female"
                ? t("carouselFemale")
                : t("carouselGenderPending")}
          </span>
        </span>
      </div>
      <div className="mt-1.5 hidden grid-cols-1 gap-0.5 text-[0.6rem] text-muted-foreground min-[460px]:grid">
        <p className="flex min-w-0 items-center gap-1">
          <UserRound
            aria-hidden="true"
            className="size-3 shrink-0 text-primary"
          />
          <span className="truncate">{detail}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1">
          <MapPin aria-hidden="true" className="size-3 shrink-0 text-primary" />
          <span className="truncate">{location}</span>
        </p>
      </div>
      <div className="mt-1 border-t border-border/60 pt-1 min-[460px]:mt-1.5 min-[460px]:pt-1.5">
        <p className="sr-only">{t("carouselRoutePassives")}</p>
        <div className="grid grid-cols-2 gap-1">
          {passives.map((passive) => (
            <PassiveBadge
              key={passive.name}
              name={passive.name}
              rank={passive.rank}
              className="min-h-5 w-full justify-start px-1 py-0 text-[0.5rem] min-[460px]:text-[0.55rem]"
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function CompactMetric({
  value,
  label,
}: Readonly<{ value: string; label: string }>) {
  return (
    <div className="min-w-0 px-1.5 text-center">
      <span className="text-xs font-bold text-foreground">{value}</span>
      <span className="ml-1 truncate text-[0.62rem] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
