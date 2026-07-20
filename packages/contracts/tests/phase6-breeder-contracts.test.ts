import { describe, expect, it } from "vitest";

import { parseBreedingJobDetailRpcResult } from "../src/phase6-validation";

const legacyComponents = [
  "route_length",
  "inventory_coverage",
  "passive_concentration",
  "borrowing",
  "intermediate_cost",
  "attempt_cost",
  "stability",
].map((component) => ({
  component,
  raw_value: 1,
  normalized_score: 80,
  weight: 1 / 7,
  weighted_score: 80 / 7,
}));

const legacyRoute = {
  route_id: "62000000-0000-4000-8000-000000000001",
  execution_plan_id: null,
  route_key: "7".repeat(64),
  rank: 1,
  optimization_mode: "balanced",
  total_score: 80,
  generation_count: 1,
  step_count: 1,
  estimated_attempts_min: 1,
  estimated_attempts_max: 3,
  difficulty: "low",
  borrowed_pal_count: 0,
  inventory_coverage: 1,
  inheritance_score: 1,
  feasibility_status: "ready",
  adoptable: true,
  missing_pal_count: 0,
  missing_requirements: [],
  existing_target_instance_uid: null,
  score_breakdown: {
    scoring_profile_version: "balanced-v2",
    estimate_basis: "strategy_heuristic_no_verified_probability",
    raw_metrics: {
      generation_count: 1,
      step_count: 1,
      unique_starting_instance_count: 2,
      borrowed_pal_count: 0,
      inventory_coverage: 1,
      passive_carrier_count: 1,
      passive_concentration: 1,
      extra_passive_count: 0,
      intermediate_pal_count: 0,
      intermediate_passive_checkpoint_count: 0,
      required_gender_checkpoint_count: 0,
      estimated_attempts_min: 1,
      estimated_attempts_max: 3,
      difficulty: "low",
    },
    mode_scores: [
      "balanced",
      "fastest",
      "highest_success",
      "least_borrowing",
    ].map((optimization_mode) => ({
      optimization_mode,
      scoring_profile_version: `${optimization_mode}-v2`,
      total_score: 80,
      components: legacyComponents,
    })),
  },
  steps: [
    {
      step_index: 0,
      generation: 1,
      recipe_type: "normal",
      parent_a: {
        source_type: "inventory",
        pal_id: "test_parent_a",
        instance_uid: "fixture-parent-a",
        owner_display_name: "Fixture Player A",
        gender: "male",
        passive_skill_ids: ["test_passive_a"],
        required_passive_ids: ["test_passive_a"],
        borrowed: false,
        produced_by_step_index: null,
        location_type: "base",
        location_name: "Fixture Base",
      },
      parent_b: {
        source_type: "inventory",
        pal_id: "test_parent_b",
        instance_uid: "fixture-parent-b",
        owner_display_name: "Fixture Player B",
        gender: "female",
        passive_skill_ids: [],
        required_passive_ids: [],
        borrowed: false,
        produced_by_step_index: null,
        location_type: "base",
        location_name: "Fixture Base",
      },
      child_pal_id: "test_child_pal",
      child_required_gender: null,
      required_passive_ids: ["test_passive_a"],
    },
  ],
  ai_explanation: "历史模板解释",
  ai_labels: [],
};

describe("Phase 6 historical route compatibility", () => {
  it("accepts a projected v2 route without rewriting its scoring facts", () => {
    const result = {
      ok: true,
      data: {
        job_id: "60000000-0000-4000-8000-000000000001",
        status: "completed",
        target_pal_id: "test_child_pal",
        desired_passive_ids: ["test_passive_a"],
        optimization_mode: "balanced",
        allow_guild_shared: true,
        max_generations: 5,
        inventory_snapshot_id: "40000000-0000-4000-8000-000000000002",
        game_data_version_id: "51000000-0000-4000-8000-000000000001",
        game_data_content_hash: "c".repeat(64),
        algorithm_version: "phase4b-deterministic-v1",
        scoring_profile_version: "balanced-v2",
        attempt_count: 1,
        error_code: null,
        created_at: "2026-07-16T06:00:00Z",
        completed_at: "2026-07-16T06:00:05Z",
        plan: {
          plan_id: "61000000-0000-4000-8000-000000000001",
          result_digest: "d".repeat(64),
          route_count: 1,
          explanation_codes: [],
          diagnostics: { search_complete: true },
          ai: {
            provider: "template",
            model: null,
            explanation: "历史模板解释",
            degraded: true,
          },
          routes: [legacyRoute],
        },
      },
    };

    expect(parseBreedingJobDetailRpcResult(result)).toEqual(result);
  });
});
