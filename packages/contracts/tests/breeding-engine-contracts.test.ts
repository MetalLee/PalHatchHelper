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
});
