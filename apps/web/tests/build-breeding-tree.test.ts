import type {
  BreedingRoute,
  BreedingRouteViewParent,
  BreedingRouteViewStep,
} from "@palhatch/contracts";
import { describe, expect, it } from "vitest";

import {
  buildBreedingTree,
  type BreedingTreePassiveFact,
} from "../features/breeder/lib/build-breeding-tree";

function inventoryParent(
  instanceUid: string,
  palId: string,
  gender: BreedingRouteViewParent["gender"],
  passiveSkillIds: string[] = [],
): BreedingRouteViewParent {
  return {
    source_type: "inventory",
    pal_id: palId,
    instance_uid: instanceUid,
    owner_display_name: "Fixture Player",
    gender,
    passive_skill_ids: passiveSkillIds,
    required_passive_ids: [],
    borrowed: false,
    produced_by_step_index: null,
    location_type: "player_storage",
    location_name: "Fixture Storage",
  };
}

function intermediateParent(
  producedByStepIndex: number,
  palId: string,
  gender: BreedingRouteViewParent["gender"] = null,
): BreedingRouteViewParent {
  return {
    source_type: "intermediate",
    pal_id: palId,
    instance_uid: null,
    owner_display_name: `步骤 ${producedByStepIndex + 1} 子代`,
    gender,
    passive_skill_ids: [],
    required_passive_ids: [],
    borrowed: false,
    produced_by_step_index: producedByStepIndex,
    location_type: null,
    location_name: null,
  };
}

function missingParent(
  palId: string,
  gender: "male" | "female",
  requiredPassiveIds: string[] = [],
): BreedingRouteViewParent {
  return {
    source_type: "missing",
    pal_id: palId,
    instance_uid: null,
    owner_display_name: "缺少：需补充库存",
    gender,
    passive_skill_ids: [],
    required_passive_ids:
      requiredPassiveIds as BreedingRouteViewParent["required_passive_ids"],
    borrowed: false,
    produced_by_step_index: null,
    location_type: null,
    location_name: null,
  };
}

function breedingStep(
  stepIndex: number,
  generation: number,
  parentA: BreedingRouteViewParent,
  parentB: BreedingRouteViewParent,
  childPalId: string,
  recipeType: BreedingRouteViewStep["recipe_type"] = "normal",
): BreedingRouteViewStep {
  return {
    step_index: stepIndex,
    generation,
    recipe_type: recipeType,
    parent_a: parentA,
    parent_b: parentB,
    child_pal_id: childPalId,
    child_required_gender: null,
    required_passive_ids: [],
  };
}

function routeWith(
  steps: BreedingRouteViewStep[],
  overrides: Partial<BreedingRoute> = {},
): BreedingRoute {
  return {
    route_id: "62000000-0000-4000-8000-000000000001",
    execution_plan_id: null,
    route_key: "1".repeat(64),
    rank: 1,
    optimization_mode: "balanced",
    total_score: 91,
    generation_count: Math.max(0, ...steps.map((step) => step.generation)),
    step_count: steps.length,
    estimated_attempts_min: 1,
    estimated_attempts_max: 3,
    difficulty: "low",
    borrowed_pal_count: 0,
    inventory_coverage: 1,
    inventory_passive_coverage: 1,
    inheritance_score: 1,
    feasibility_status: "ready",
    adoptable: true,
    missing_pal_count: 0,
    missing_passive_ids: [],
    missing_requirements: [],
    passive_sources: [],
    existing_target_instance_uid: null,
    score_breakdown: {
      scoring_profile_version: "balanced-v5",
      estimate_basis: "strategy_heuristic_no_verified_probability",
      raw_metrics: {
        generation_count: Math.max(0, ...steps.map((step) => step.generation)),
        step_count: steps.length,
        unique_starting_instance_count: 2,
        borrowed_pal_count: 0,
        inventory_coverage: 1,
        passive_carrier_count: 0,
        passive_concentration: 1,
        extra_passive_count: 0,
        intermediate_pal_count: Math.max(0, steps.length - 1),
        intermediate_passive_checkpoint_count: 0,
        required_gender_checkpoint_count: 0,
        estimated_attempts_min: 1,
        estimated_attempts_max: 3,
        difficulty: "low",
      },
      mode_scores:
        [] as unknown as BreedingRoute["score_breakdown"]["mode_scores"],
    },
    steps,
    ai_explanation: null,
    ai_labels: [],
    ...overrides,
  };
}

function twoGenerationSteps(): BreedingRouteViewStep[] {
  return [
    breedingStep(
      0,
      1,
      inventoryParent("inventory-a", "pal-a", "male"),
      inventoryParent("inventory-b", "pal-b", "female"),
      "pal-mid",
    ),
    breedingStep(
      1,
      2,
      intermediateParent(0, "pal-mid", "female"),
      inventoryParent("inventory-c", "pal-c", "male"),
      "pal-target",
    ),
  ];
}

describe("buildBreedingTree", () => {
  it("builds a single-generation route with two parents and the final target", () => {
    const model = buildBreedingTree(
      routeWith([
        breedingStep(
          0,
          1,
          inventoryParent("inventory-a", "pal-a", "male"),
          inventoryParent("inventory-b", "pal-b", "female"),
          "pal-target",
        ),
      ]),
    );

    expect(model.empty).toBe(false);
    expect(model.entities.map((entity) => entity.id)).toEqual([
      "inventory:inventory-a",
      "inventory:inventory-b",
      "step:0:child",
    ]);
    expect(model.edges).toHaveLength(2);
    expect(model.targetOccurrenceId).toBe("occurrence:step:0:child");
    expect(model.layers.map((layer) => layer.generation)).toEqual([0, 1]);
  });

  it("builds a stable multi-generation model", () => {
    const model = buildBreedingTree(routeWith(twoGenerationSteps()));

    expect(model.steps.map((step) => step.stepIndex)).toEqual([0, 1]);
    expect(model.layers.map((layer) => layer.generation)).toEqual([0, 1, 2]);
    expect(model.targetOccurrenceId).toBe("occurrence:step:1:child");
    expect(
      model.entities.find((entity) => entity.id === "step:0:child")?.kind,
    ).toBe("intermediate");
    expect(
      model.entities.find((entity) => entity.id === "step:1:child")?.isTarget,
    ).toBe(true);
  });

  it("connects an intermediate parent to the child occurrence that produced it", () => {
    const model = buildBreedingTree(routeWith(twoGenerationSteps()));
    const secondStep = model.steps[1];

    expect(secondStep?.parentAOccurrenceId).toBe("occurrence:step:0:child");
    expect(
      model.edges.some(
        (edge) =>
          edge.fromOccurrenceId === "occurrence:step:0:child" &&
          edge.toOccurrenceId === "occurrence:step:1:child",
      ),
    ).toBe(true);
  });

  it("reuses one inventory entity through stable per-step occurrences", () => {
    const steps = twoGenerationSteps();
    steps[1]!.parent_b = inventoryParent("inventory-a", "pal-a", "male");

    const model = buildBreedingTree(routeWith(steps));
    const inventoryEntities = model.entities.filter(
      (entity) => entity.id === "inventory:inventory-a",
    );
    const inventoryOccurrences = model.occurrences.filter(
      (occurrence) => occurrence.entityId === "inventory:inventory-a",
    );

    expect(inventoryEntities).toHaveLength(1);
    expect(inventoryOccurrences.map((occurrence) => occurrence.id)).toEqual([
      "occurrence:0:a:inventory:inventory-a",
      "occurrence:1:b:inventory:inventory-a",
    ]);
  });

  it("creates a missing requirement without inventing an inventory instance", () => {
    const route = routeWith(
      [
        breedingStep(
          0,
          1,
          inventoryParent("inventory-a", "pal-a", "male"),
          missingParent("pal-missing", "female", ["passive-required"]),
          "pal-target",
        ),
      ],
      {
        feasibility_status: "needs_inventory",
        adoptable: false,
        missing_pal_count: 1,
        inventory_coverage: 0.5,
      },
    );

    const model = buildBreedingTree(route);
    const missing = model.entities.find(
      (entity) => entity.id === "missing:0:b",
    );

    expect(missing).toMatchObject({
      kind: "missing",
      instanceUid: null,
      gender: "female",
      requiredPassiveIds: ["passive-required"],
    });
    expect(model.hasMissing).toBe(true);
  });

  it("preserves special-recipe facts on the child and its connections", () => {
    const model = buildBreedingTree(
      routeWith([
        breedingStep(
          0,
          1,
          inventoryParent("inventory-a", "pal-a", "male"),
          inventoryParent("inventory-b", "pal-b", "female"),
          "pal-special",
          "special",
        ),
      ]),
    );

    expect(model.steps[0]?.recipeType).toBe("special");
    expect(
      model.entities.find((entity) => entity.id === "step:0:child")?.recipeType,
    ).toBe("special");
    expect(model.edges.every((edge) => edge.recipeType === "special")).toBe(
      true,
    );
  });

  it("returns an explicit empty model when no route exists", () => {
    const model = buildBreedingTree(null);

    expect(model).toMatchObject({
      empty: true,
      emptyReason: "no_route",
      entities: [],
      occurrences: [],
      edges: [],
      steps: [],
      layers: [],
      targetOccurrenceId: null,
    });
  });

  it("renders an existing target as a real inventory entity without inventing steps", () => {
    const model = buildBreedingTree(
      routeWith([], {
        existing_target_instance_uid: "existing-target-instance",
      }),
      { targetPalId: "pal-target" },
    );

    expect(model.empty).toBe(false);
    expect(model.steps).toEqual([]);
    expect(model.targetOccurrenceId).toBe(
      "occurrence:existing-target:existing-target-instance",
    );
    expect(model.entities).toEqual([
      expect.objectContaining({
        id: "inventory:existing-target-instance",
        kind: "existing_target",
        palId: "pal-target",
        instanceUid: "existing-target-instance",
        isTarget: true,
      }),
    ]);
  });

  it.each([
    ["ready", false],
    ["needs_inventory", true],
  ] as const)(
    "keeps the %s feasibility classification",
    (feasibilityStatus, hasMissing) => {
      const model = buildBreedingTree(
        routeWith(twoGenerationSteps(), {
          feasibility_status: feasibilityStatus,
          adoptable: feasibilityStatus === "ready",
          missing_pal_count: hasMissing ? 1 : 0,
        }),
      );

      expect(model.feasibilityStatus).toBe(feasibilityStatus);
      expect(model.hasMissing).toBe(hasMissing);
    },
  );

  it("keeps negative and unknown passive ranks as catalog facts", () => {
    const passiveFacts = new Map<string, BreedingTreePassiveFact>([
      ["passive-negative", { rank: -1, isNegative: true }],
      ["passive-unknown", { rank: null, isNegative: null }],
    ]);
    const model = buildBreedingTree(
      routeWith([
        breedingStep(
          0,
          1,
          inventoryParent("inventory-a", "pal-a", "male", [
            "passive-negative",
            "passive-unknown",
          ]),
          inventoryParent("inventory-b", "pal-b", "female"),
          "pal-target",
        ),
      ]),
      { passiveFacts },
    );

    const passives = model.entities.find(
      (entity) => entity.id === "inventory:inventory-a",
    )?.passives;
    expect(passives).toEqual([
      {
        passiveId: "passive-negative",
        rank: -1,
        isNegative: true,
      },
      {
        passiveId: "passive-unknown",
        rank: null,
        isNegative: null,
      },
    ]);
  });

  it("sorts unordered steps by step_index before resolving references", () => {
    const [first, second] = twoGenerationSteps();
    if (first === undefined || second === undefined)
      throw new Error("fixture steps missing");

    const model = buildBreedingTree(routeWith([second, first]));

    expect(model.steps.map((step) => step.stepIndex)).toEqual([0, 1]);
    expect(model.targetOccurrenceId).toBe("occurrence:step:1:child");
    expect(model.steps[1]?.parentAOccurrenceId).toBe("occurrence:step:0:child");
  });
});
