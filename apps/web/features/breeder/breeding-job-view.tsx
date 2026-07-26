"use client";

import type {
  BreedingJobDetailRpcResult,
  BreedingJobDetailRpcSuccess,
  BreedingRoute,
  SavePlanResponse,
} from "@palhatch/contracts";
import { AlertTriangle } from "lucide-react";
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
import { RouteSavePanel } from "./components/route-save-panel";
import { RouteComparisonGrid } from "./components/route-comparison-grid";
import { RouteScoreBreakdown } from "./components/route-score-breakdown";
import { RouteMissingRequirements } from "./components/route-supporting-details";
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

function parseSavedPlan(value: unknown): SavePlanResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    !("route_id" in value) ||
    typeof value.route_id !== "string" ||
    !uuidPattern.test(value.route_id) ||
    !("reused" in value) ||
    typeof value.reused !== "boolean" ||
    !("saved_at" in value) ||
    typeof value.saved_at !== "string" ||
    Number.isNaN(Date.parse(value.saved_at))
  ) {
    throw new Error("DATA_UNAVAILABLE");
  }
  return value as SavePlanResponse;
}

export function BreedingJobView({
  initialResult,
  poll = true,
}: Readonly<{ initialResult: BreedingJobDetailRpcSuccess; poll?: boolean }>) {
  const [result, setResult] = useState(initialResult);
  const [selectedKey, setSelectedKey] = useState(
    initialResult.data.plan?.routes.find(
      (route) => route.feasibility_status === "ready",
    )?.route_key ??
      initialResult.data.plan?.routes[0]?.route_key ??
      null,
  );
  const [pollPaused, setPollPaused] = useState(false);
  const [busyRouteId, setBusyRouteId] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [savedRouteIds, setSavedRouteIds] = useState(
    () =>
      new Set(
        initialResult.data.plan?.routes
          .filter((route) => route.saved_plan_at !== null)
          .map((route) => route.route_id) ?? [],
      ),
  );

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

  async function saveSelectedRoute(route: BreedingRoute): Promise<void> {
    setBusyRouteId(route.route_id);
    setPlanError(null);
    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          route_id: route.route_id,
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
            : "DATA_UNAVAILABLE";
        throw new Error(code);
      }
      const saved = parseSavedPlan(payload);
      setSavedRouteIds((current) => new Set(current).add(saved.route_id));
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "DATA_UNAVAILABLE");
    } finally {
      setBusyRouteId(null);
    }
  }

  async function removeSelectedRoute(route: BreedingRoute): Promise<void> {
    setBusyRouteId(route.route_id);
    setPlanError(null);
    try {
      const response = await fetch(`/api/plans/${route.route_id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const code =
          typeof payload === "object" &&
          payload !== null &&
          "error_code" in payload &&
          typeof payload.error_code === "string"
            ? payload.error_code
            : "DATA_UNAVAILABLE";
        throw new Error(code);
      }
      setSavedRouteIds((current) => {
        const next = new Set(current);
        next.delete(route.route_id);
        return next;
      });
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "DATA_UNAVAILABLE");
    } finally {
      setBusyRouteId(null);
    }
  }

  return (
    <div className="grid min-w-0 max-w-full gap-4 overflow-x-clip">
      <BreederFlowProgress activeStep={activeStep} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]">
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
            explanationCodes={plan.explanation_codes}
          />
          <RouteComparisonGrid
            routes={plan.routes}
            selectedRouteKey={selected?.route_key ?? null}
            onSelect={setSelectedKey}
          />

          {selected === undefined ? null : (
            <section className="grid min-w-0 gap-4" aria-label="路线详情">
              <BreedingRouteTree
                route={selected}
                targetPalId={result.data.target_pal_id}
                palNames={palNames}
                passiveNames={passiveNames}
                passiveFacts={passiveFacts}
                compactPreview
                eyebrow={null}
                title="配种路径"
                description={null}
              />
              <RouteMissingRequirements
                route={selected}
                palNames={palNames}
                passiveNames={passiveNames}
              />
              <RouteSavePanel
                route={selected}
                jobStatus={result.data.status}
                saved={savedRouteIds.has(selected.route_id)}
                busy={busyRouteId === selected.route_id}
                error={planError}
                onSave={() => void saveSelectedRoute(selected)}
                onRemove={() => void removeSelectedRoute(selected)}
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
