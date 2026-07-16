import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const schema = JSON.parse(
  readFileSync(
    new URL("../schema/phase7-execution-plans.schema.json", import.meta.url),
    "utf8",
  ),
) as { $defs: Record<string, unknown> };

describe("Phase 7 execution plan contracts", () => {
  it("defines every browser and Agent boundary from one schema", () => {
    expect(Object.keys(schema.$defs)).toEqual(
      expect.arrayContaining([
        "AdoptRouteRequest",
        "AdoptRouteResponse",
        "PlanSummary",
        "PlanDetail",
        "PlanVersionPin",
        "PlanStep",
        "PlanStepStatus",
        "PlanStatus",
        "OffspringCandidate",
        "CandidateMatchBreakdown",
        "UpdateStepStatusRequest",
        "StartBreedingRequest",
        "ContinueAttemptRequest",
        "SelectExistingPalRequest",
        "ConfirmOffspringRequest",
        "RejectCandidateRequest",
        "PausePlanRequest",
        "ResumePlanRequest",
        "SkipStepRequest",
        "RecalculatePlanRequest",
        "InvalidationReason",
        "PlanEventSummary",
        "OptimisticConcurrencyConflict",
      ]),
    );
  });

  it("rejects a browser attempt to choose an arbitrary step status", () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: schema.$defs,
      $ref: "#/$defs/StartBreedingRequest",
    });
    expect(
      validate({
        expected_concurrency_version: 2,
        idempotency_key: "fixture-start-1",
        status: "completed",
      }),
    ).toBe(false);
  });
});
