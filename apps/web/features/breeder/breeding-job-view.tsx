"use client";

import type {
  AdoptRouteResponse,
  BreedingJobDetailRpcResult,
  BreedingJobDetailRpcSuccess,
  BreedingRoute,
} from "@palhatch/contracts";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { BreederFlowProgress } from "./components/breeder-flow-progress";
import { BreedingRouteTree } from "./components/breeding-route-tree";
import {
  BreedingSearchDiagnostics,
  NoBreedingRouteState,
  WaitingForBreedingResult,
} from "./components/breeding-job-result-state";
import { BreedingJobTargetSummary } from "./components/breeding-job-target-summary";
import { JobStagePanel } from "./components/job-stage-panel";
import { PinnedVersionDetails } from "./components/pinned-version-details";
import { RouteAdoptionPanel } from "./components/route-adoption-panel";
import { RouteComparisonGrid } from "./components/route-comparison-grid";
import { RouteScoreBreakdown } from "./components/route-score-breakdown";
import {
  RouteExplanation,
  RouteMissingRequirements,
  RoutePassiveSources,
} from "./components/route-supporting-details";
import { localizedName, localizedNames } from "./presentation";

const terminal = new Set(["completed", "failed", "cancelled"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePolledJob(value: unknown): BreedingJobDetailRpcResult {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    throw new Error("DATA_UNAVAILABLE");
  }
  if (value.ok === false) {
    if (!("error_code" in value) || typeof value.error_code !== "string") {
      throw new Error("DATA_UNAVAILABLE");
    }
    return value as BreedingJobDetailRpcResult;
  }
  if (
    value.ok !== true ||
    !("data" in value) ||
    typeof value.data !== "object" ||
    value.data === null ||
    !("job_id" in value.data) ||
    typeof value.data.job_id !== "string" ||
    !uuidPattern.test(value.data.job_id)
  ) {
    throw new Error("DATA_UNAVAILABLE");
  }
  return value as BreedingJobDetailRpcResult;
}

function parseAdoption(value: unknown): AdoptRouteResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    !("plan_id" in value) ||
    typeof value.plan_id !== "string" ||
    !uuidPattern.test(value.plan_id) ||
    !("reused" in value) ||
    typeof value.reused !== "boolean" ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    !("concurrency_version" in value) ||
    !Number.isInteger(value.concurrency_version) ||
    Number(value.concurrency_version) < 1
  ) {
    throw new Error("ROUTE_NOT_ADOPTABLE");
  }
  return value as AdoptRouteResponse;
}

export function BreedingJobView({
  initialResult,
  poll = true,
}: Readonly<{ initialResult: BreedingJobDetailRpcSuccess; poll?: boolean }>) {
  const router = useRouter();
  const [result, setResult] = useState(initialResult);
  const [selectedKey, setSelectedKey] = useState(
    initialResult.data.plan?.routes.find(
      (route) => route.feasibility_status === "ready",
    )?.route_key ??
      initialResult.data.plan?.routes[0]?.route_key ??
      null,
  );
  const [pollPaused, setPollPaused] = useState(false);
  const [adoptingRouteId, setAdoptingRouteId] = useState<string | null>(null);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);

  useEffect(() => {
    if (!poll || terminal.has(result.data.status)) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > 60) {
        window.clearInterval(timer);
        setPollPaused(true);
        return;
      }
      void fetch(`/api/breeder/jobs/${result.data.job_id}`, {
        cache: "no-store",
      })
        .then((response) => response.json())
        .then((payload: unknown) => {
          const next = parsePolledJob(payload);
          if (next.ok) {
            setResult(next);
            setSelectedKey((current) =>
              next.data.plan?.routes.some(
                (route) => route.route_key === current,
              )
                ? current
                : (next.data.plan?.routes.find(
                    (route) => route.feasibility_status === "ready",
                  )?.route_key ??
                  next.data.plan?.routes[0]?.route_key ??
                  null),
            );
            if (terminal.has(next.data.status)) window.clearInterval(timer);
          }
        })
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [poll, result.data.job_id, result.data.status]);

  const plan = result.data.plan;
  const selected = useMemo(
    () =>
      plan?.routes.find((route) => route.route_key === selectedKey) ??
      plan?.routes[0],
    [plan, selectedKey],
  );
  const palNames = useMemo(
    () =>
      new Map(
        result.data.localization.pals.map((pal) => [
          pal.pal_id,
          pal.display_name,
        ]),
      ),
    [result.data.localization.pals],
  );
  const passiveNames = useMemo(
    () =>
      new Map(
        result.data.localization.passive_skills.map((passive) => [
          passive.passive_skill_id,
          passive.display_name,
        ]),
      ),
    [result.data.localization.passive_skills],
  );
  const passiveFacts = useMemo(
    () =>
      new Map(
        result.data.localization.passive_skills.map((passive) => [
          passive.passive_skill_id,
          {
            rank: passive.rank,
            isNegative: passive.is_negative,
          },
        ]),
      ),
    [result.data.localization.passive_skills],
  );
  const hardSearchLimit =
    plan?.explanation_codes.includes("SEARCH_LIMIT_REACHED") === true ||
    plan?.explanation_codes.includes("SEARCH_TIMEOUT") === true ||
    plan?.diagnostics.search_complete === false;
  const heuristicSearchPruned =
    !hardSearchLimit &&
    plan?.explanation_codes.includes("SEARCH_PRUNED") === true;
  const activeStep = plan !== null && plan.routes.length > 0 ? 3 : 2;
  const targetName = localizedName(palNames, result.data.target_pal_id, "Pal");

  async function adoptSelectedRoute(route: BreedingRoute): Promise<void> {
    setAdoptingRouteId(route.route_id);
    setAdoptionError(null);
    try {
      const response = await fetch("/api/plans/adopt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          route_id: route.route_id,
          idempotency_key: `adopt:${route.route_id}`,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const code =
          typeof payload === "object" &&
          payload !== null &&
          "error_code" in payload &&
          typeof payload.error_code === "string"
            ? payload.error_code
            : "ROUTE_NOT_ADOPTABLE";
        throw new Error(code);
      }
      const adopted = parseAdoption(payload);
      router.push(`/plans/${adopted.plan_id}`);
    } catch (error) {
      setAdoptionError(
        error instanceof Error ? error.message : "ROUTE_NOT_ADOPTABLE",
      );
    } finally {
      setAdoptingRouteId(null);
    }
  }

  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip">
      <BreederFlowProgress activeStep={activeStep} />

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]">
        <BreedingJobTargetSummary
          jobId={result.data.job_id}
          targetPalId={result.data.target_pal_id}
          targetName={targetName}
          desiredPassiveIds={result.data.desired_passive_ids}
          passiveNames={passiveNames}
          passiveFacts={passiveFacts}
          optimizationMode={result.data.optimization_mode}
          allowGuildShared={result.data.allow_guild_shared}
          maxGenerations={result.data.max_generations}
        />
        <JobStagePanel
          status={result.data.status}
          attemptCount={result.data.attempt_count}
          errorCode={result.data.error_code}
          pollPaused={pollPaused}
          aiDegraded={plan?.ai.degraded === true}
        />
      </div>

      {plan?.missing_passive_ids.length ? (
        <Alert className="rounded-3xl border-amber-200 bg-amber-50/94 text-amber-950">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>库存缺少以下目标被动来源：</AlertTitle>
          <AlertDescription className="text-amber-900">
            {localizedNames(
              passiveNames,
              plan.missing_passive_ids,
              "被动",
            ).join("、")}
          </AlertDescription>
        </Alert>
      ) : null}

      {plan === null ? (
        <WaitingForBreedingResult status={result.data.status} />
      ) : plan.routes.length === 0 ? (
        <NoBreedingRouteState
          hardSearchLimit={hardSearchLimit}
          heuristicSearchPruned={heuristicSearchPruned}
          explanationCodes={plan.explanation_codes}
        />
      ) : (
        <>
          <BreedingSearchDiagnostics
            hardSearchLimit={hardSearchLimit}
            heuristicSearchPruned={heuristicSearchPruned}
            explanationCodes={plan.explanation_codes}
          />
          <RouteComparisonGrid
            routes={plan.routes}
            selectedRouteKey={selected?.route_key ?? null}
            aiDegraded={plan.ai.degraded}
            palNames={palNames}
            passiveNames={passiveNames}
            onSelect={setSelectedKey}
          />

          {selected === undefined ? null : (
            <section className="grid min-w-0 gap-5" aria-label="路线详情">
              <RouteExplanation
                route={selected}
                planExplanation={plan.ai.explanation}
                degraded={plan.ai.degraded}
              />
              <RouteMissingRequirements
                route={selected}
                palNames={palNames}
                passiveNames={passiveNames}
              />
              <RoutePassiveSources
                route={selected}
                historical={
                  result.data.algorithm_version !==
                  "inventory-trait-aware-deterministic-v4"
                }
                palNames={palNames}
                passiveNames={passiveNames}
              />
              <BreedingRouteTree
                route={selected}
                targetPalId={result.data.target_pal_id}
                palNames={palNames}
                passiveNames={passiveNames}
                passiveFacts={passiveFacts}
              />
              <RouteAdoptionPanel
                route={selected}
                jobStatus={result.data.status}
                adopting={adoptingRouteId !== null}
                adoptionError={adoptionError}
                onAdopt={() => void adoptSelectedRoute(selected)}
              />
              <RouteScoreBreakdown route={selected} />
            </section>
          )}
        </>
      )}

      <PinnedVersionDetails
        inventorySnapshotId={result.data.inventory_snapshot_id}
        gameDataVersionId={result.data.game_data_version_id}
        gameDataContentHash={result.data.game_data_content_hash}
        algorithmVersion={result.data.algorithm_version}
        scoringProfileVersion={result.data.scoring_profile_version}
        optimizationMode={result.data.optimization_mode}
      />
    </div>
  );
}
