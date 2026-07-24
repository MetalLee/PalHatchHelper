import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import breedingEngineSchema from "../schema/breeding-engine.schema.json";

function validRequest() {
  return {
    target_pal_id: "pal-target",
    desired_passive_ids: ["passive-a", "passive-b"],
    world_id: "10000000-0000-4000-8000-000000000099",
    inventory_snapshot_id: "10000000-0000-4000-8000-000000000001",
    game_data_version_id: "20000000-0000-4000-8000-000000000001",
    game_data_content_hash:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    algorithm_version: "phase4b-deterministic-v1",
    scoring_profile_version: "balanced-v2",
    optimization_mode: "balanced",
    requester_player_id: "30000000-0000-4000-8000-000000000001",
    requester_guild_id: "40000000-0000-4000-8000-000000000001",
    allow_shared_inventory: true,
    allow_locked_reuse: false,
    inventory: [
      {
        instance_uid: "fixture-a",
        pal_id: "pal-a",
        owner_player_id: "30000000-0000-4000-8000-000000000001",
        guild_id: "40000000-0000-4000-8000-000000000001",
        gender: "male",
        passive_skill_ids: ["passive-a"],
        location_type: "base",
        location_name: "Fixture Base",
        ownership_scope: "player",
        share_enabled: false,
        owner_resolved: true,
        guild_resolved: true,
        present_in_snapshot: true,
        breeding_enabled: true,
        plan_locked: false,
      },
    ],
    limits: {
      max_generations: 5,
      max_expanded_nodes: 50000,
      timeout_ms: 10000,
      max_species_routes_per_pal: 256,
      max_assignment_states_per_mask: 32,
      max_candidate_routes: 256,
      max_results: 24,
    },
  };
}

function validator() {
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  return ajv.compile(breedingEngineSchema);
}

function validRoute() {
  const componentNames = [
    "route_length",
    "inventory_coverage",
    "passive_concentration",
    "borrowing",
    "intermediate_cost",
    "attempt_cost",
    "stability",
    "acquisition_cost",
  ];
  const components = componentNames.map((component) => ({
    component,
    raw_value: 1,
    normalized_score: 80,
    weight: 0.125,
    weighted_score: 10,
  }));
  return {
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
    inventory_passive_coverage: 1,
    inheritance_score: 1,
    feasibility_status: "ready",
    adoptable: true,
    missing_pal_count: 0,
    missing_passive_ids: [] as string[],
    missing_requirements: [],
    passive_sources: [
      {
        passive_id: "passive-a",
        source_instance_uid: "fixture-a",
        source_pal_id: "pal-a",
        first_required_step_index: 0,
      },
    ],
    existing_target_instance_uid: null,
    score_breakdown: {
      scoring_profile_version: "balanced-v5",
      estimate_basis: "strategy_heuristic_no_verified_probability",
      raw_metrics: {
        generation_count: 1,
        step_count: 1,
        unique_starting_instance_count: 2,
        starting_requirement_count: 2,
        missing_pal_count: 0,
        missing_passive_requirement_count: 0,
        missing_passive_count: 0,
        borrowed_pal_count: 0,
        inventory_coverage: 1,
        inventory_passive_coverage: 1,
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
        scoring_profile_version: `${optimization_mode}-v4`,
        total_score: 80,
        components,
      })),
    },
    steps: [],
  };
}

function routeValidator() {
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  ajv.addSchema(breedingEngineSchema);
  return ajv.compile({
    $ref: `${breedingEngineSchema.$id}#/$defs/BreedingRouteCandidate`,
  });
}

describe("breeding engine contract", () => {
  it("accepts a fixed deterministic request", () => {
    expect(validator()(validRequest())).toBe(true);
  });

  it("rejects more than four or duplicate desired passives", () => {
    expect(
      validator()({
        ...validRequest(),
        desired_passive_ids: ["a", "b", "c", "d", "e"],
      }),
    ).toBe(false);
    expect(
      validator()({
        ...validRequest(),
        desired_passive_ids: ["same", "same"],
      }),
    ).toBe(false);
  });

  it("rejects AI legality and score overrides", () => {
    expect(
      validator()({
        ...validRequest(),
        ai_score_override: 100,
      }),
    ).toBe(false);
  });

  it("requires every passive source to identify a real inventory instance", () => {
    const route = validRoute();
    expect(routeValidator()(route)).toBe(true);
    route.passive_sources[0]!.source_instance_uid = "";
    expect(routeValidator()(route)).toBe(false);
  });

  it("rejects ready routes that still have missing passive sources", () => {
    const route = validRoute();
    route.missing_passive_ids = ["passive-b"];
    route.inventory_passive_coverage = 0.5;
    expect(routeValidator()(route)).toBe(false);
  });
});
