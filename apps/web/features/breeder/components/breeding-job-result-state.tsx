"use client";

import type { BreederJobStatus } from "@palhatch/contracts";
import { GitBranch, SearchX, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCopy } from "@/i18n/client";

export function WaitingForBreedingResult({
  status,
}: Readonly<{ status: BreederJobStatus }>) {
  const t = useCopy("Breeder");
  return (
    <section className="rounded-3xl border border-dashed border-border bg-white/68 p-7 text-center">
      <GitBranch aria-hidden="true" className="mx-auto size-9 text-primary" />
      <h2 className="mt-3 text-xl font-bold text-foreground">
        {status === "failed" || status === "cancelled"
          ? t("waitingNoRoute")
          : t("waitingComparison")}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {t("pollingDescription")}
      </p>
    </section>
  );
}

export function NoBreedingRouteState({
  hardSearchLimit,
  heuristicSearchPruned,
  explanationCodes,
}: Readonly<{
  hardSearchLimit: boolean;
  heuristicSearchPruned: boolean;
  explanationCodes: readonly string[];
}>) {
  const t = useCopy("Breeder");
  const title = hardSearchLimit
    ? t("searchLimitTitle")
    : heuristicSearchPruned
      ? t("searchPrunedTitle")
      : t("noLegalRouteTitle");
  const description = hardSearchLimit
    ? t("searchLimitDescription")
    : heuristicSearchPruned
      ? t("searchPrunedDescription")
      : t("noLegalRouteDescription");

  return (
    <section
      className="rounded-3xl border border-dashed border-border bg-white/72 p-7 text-center"
      role="status"
    >
      <SearchX
        aria-hidden="true"
        className="mx-auto size-9 text-muted-foreground"
      />
      <h2 className="mt-3 text-xl font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <ExplanationCodes codes={explanationCodes} />
    </section>
  );
}

export function BreedingSearchDiagnostics({
  hardSearchLimit,
  explanationCodes,
}: Readonly<{
  hardSearchLimit: boolean;
  explanationCodes: readonly string[];
}>) {
  const t = useCopy("Breeder");
  if (!hardSearchLimit) return null;
  return (
    <Alert
      role="status"
      className="rounded-3xl border-amber-200 bg-amber-50/94 text-amber-950"
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{t("budgetCandidatesTitle")}</AlertTitle>
      <AlertDescription className="text-amber-900">
        {t("budgetCandidatesDescription")}
        <ExplanationCodes codes={explanationCodes} />
      </AlertDescription>
    </Alert>
  );
}

function ExplanationCodes({ codes }: Readonly<{ codes: readonly string[] }>) {
  if (codes.length === 0) return null;
  return (
    <span className="mt-3 flex flex-wrap justify-center gap-2">
      {codes.map((code) => (
        <span
          key={code}
          className="rounded-full border border-current/20 bg-white/60 px-2.5 py-1 font-mono text-[0.68rem]"
        >
          {code}
        </span>
      ))}
    </span>
  );
}
