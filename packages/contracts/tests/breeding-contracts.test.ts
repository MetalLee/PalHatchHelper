import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import breedingJobSchema from "../schema/breeding-job.schema.json";
import palListItemSchema from "../schema/pal-list-item.schema.json";

function validator(schema: object) {
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

describe("breeding job contract", () => {
  const validJob = {
    job_id: "11111111-1111-4111-8111-111111111111",
    requester_user_id: "22222222-2222-4222-8222-222222222222",
    world_id: "77777777-7777-4777-8777-777777777777",
    player_id: "33333333-3333-4333-8333-333333333333",
    guild_id: "44444444-4444-4444-8444-444444444444",
    target_pal_id: "test_target_pal",
    desired_passive_ids: ["test_passive_a", "test_passive_b"],
    optimization_mode: "balanced",
    inventory_snapshot_id: "55555555-5555-4555-8555-555555555555",
    game_data_version_id: "66666666-6666-4666-8666-666666666666",
    breeding_data_version_id: "66666666-6666-4666-8666-666666666666",
    algorithm_version: "phase1-contract-v1",
    scoring_profile_version: "balanced-v1",
    status: "pending",
    attempt_count: 0,
    error_code: null,
    created_at: "2026-07-13T00:00:00.000Z",
    completed_at: null,
  };

  it("accepts the fixed job representation", () => {
    expect(validator(breedingJobSchema)(validJob)).toBe(true);
  });

  it("rejects more than four desired passives", () => {
    expect(
      validator(breedingJobSchema)({
        ...validJob,
        desired_passive_ids: ["a", "b", "c", "d", "e"],
      }),
    ).toBe(false);
  });

  it("rejects an unknown optimization mode", () => {
    expect(
      validator(breedingJobSchema)({
        ...validJob,
        optimization_mode: "fewest_eggs",
      }),
    ).toBe(false);
  });

  it("rejects timestamps without a timezone", () => {
    expect(
      validator(breedingJobSchema)({
        ...validJob,
        created_at: "2026-07-13T00:00:00",
      }),
    ).toBe(false);
  });

  it("rejects unstable error code formats", () => {
    expect(
      validator(breedingJobSchema)({
        ...validJob,
        error_code: "unstable-error-code",
      }),
    ).toBe(false);
  });
});

describe("pal list item contract", () => {
  it("accepts a safe shared item without raw metadata", () => {
    const validate = validator(palListItemSchema);

    expect(
      validate({
        snapshot_id: "55555555-5555-4555-8555-555555555555",
        pal_instance_uid: "fixture-pal-shared-001",
        pal_id: "test_shared_pal",
        owner_player_id: "33333333-3333-4333-8333-333333333333",
        owner_display_name: "Fixture Player",
        guild_id: "44444444-4444-4444-8444-444444444444",
        gender: "female",
        level: 20,
        passive_skill_ids: ["test_passive_a"],
        location_type: "base",
        location_name: "Fixture Base",
        share_enabled: true,
        is_owned_by_requester: false,
      }),
    ).toBe(true);
  });

  it("rejects fields outside the safe list projection", () => {
    const validate = validator(palListItemSchema);

    expect(
      validate({
        snapshot_id: "55555555-5555-4555-8555-555555555555",
        pal_instance_uid: "fixture-pal-shared-001",
        pal_id: "test_shared_pal",
        owner_player_id: "33333333-3333-4333-8333-333333333333",
        owner_display_name: "Fixture Player",
        guild_id: "44444444-4444-4444-8444-444444444444",
        gender: "female",
        level: 20,
        passive_skill_ids: ["test_passive_a"],
        location_type: "base",
        location_name: "Fixture Base",
        share_enabled: true,
        is_owned_by_requester: false,
        raw_metadata: { source_path: "/forbidden" },
      }),
    ).toBe(false);
  });
});
