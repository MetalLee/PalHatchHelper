import type { Database } from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  loadBreederFormContext,
  loadBreedingJob,
} from "../features/breeder/server";
import { listPals } from "../features/pals/server";
import type { PalListQuery } from "../features/pals/query";
import { loadPlans } from "../features/plans/server";

const query: PalListQuery = {
  scope: "all",
  query: "",
  owner: "",
  gender: "",
  passives: [],
  location: "",
  shared: null,
  page_size: 24,
  page: 1,
  context: null,
  view: "cards",
};

describe("locale-aware data access", () => {
  it("passes en-US to every game-content RPC", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: null, error: { code: "08006" } };
      },
    } as unknown as SupabaseClient<Database>;

    await Promise.allSettled([
      listPals(query, client, "en-US"),
      loadBreederFormContext(client, "en-US"),
      loadBreedingJob("60000000-0000-4000-8000-000000000001", client, "en-US"),
      loadPlans({}, client, "en-US"),
    ]);

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "list_available_pals_page_v4",
          args: expect.objectContaining({ p_locale: "en-US" }),
        }),
        expect.objectContaining({
          name: "get_breeder_form_context_v2",
          args: expect.objectContaining({ p_locale: "en-US" }),
        }),
        expect.objectContaining({
          name: "get_breeding_job_detail_v2",
          args: expect.objectContaining({ p_locale: "en-US" }),
        }),
        expect.objectContaining({
          name: "list_saved_breeding_plans_v2",
          args: expect.objectContaining({ p_locale: "en-US" }),
        }),
      ]),
    );
  });
});
