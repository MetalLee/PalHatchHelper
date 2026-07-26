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

describe("Phase 7 saved plan contracts", () => {
  it("defines route-save boundaries without execution progress models", () => {
    expect(Object.keys(schema.$defs)).toEqual(
      expect.arrayContaining([
        "SavePlanRequest",
        "SavePlanResponse",
        "RemovePlanResponse",
        "PlanSummary",
        "PlanListPage",
        "PlanListRpcResult",
        "PlanDetailReference",
        "PlanDetailRpcResult",
      ]),
    );
    expect(Object.keys(schema.$defs)).not.toEqual(
      expect.arrayContaining([
        "PlanStep",
        "OffspringCandidate",
        "UpdateStepStatusRequest",
        "ConfirmOffspringRequest",
      ]),
    );
  });

  it("accepts one route id and rejects execution-state fields", () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: schema.$defs,
      $ref: "#/$defs/SavePlanRequest",
    });
    expect(validate({ route_id: "62000000-0000-4000-8000-000000000001" })).toBe(
      true,
    );
    expect(
      validate({
        route_id: "62000000-0000-4000-8000-000000000001",
        status: "breeding",
      }),
    ).toBe(false);
  });
});
