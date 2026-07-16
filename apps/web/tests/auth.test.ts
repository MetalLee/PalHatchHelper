import type { Database } from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { authenticate } from "../features/auth/authenticate";
import { loadUserContext } from "../features/auth/server";
import {
  authUserErrorCode,
  databaseFailureCode,
  Phase5DataError,
  phase5HttpStatus,
} from "../features/phase5-errors";

type QueryResult = { data: unknown; error: { code: string } | null };

function userContextClient(
  failedTable?: "profiles" | "player_bindings" | "worlds",
): SupabaseClient<Database> {
  const results: Record<string, QueryResult> = {
    profiles: {
      data: { display_name: "Fixture Player", role: "player" },
      error: null,
    },
    player_bindings: {
      data: { player_id: "30000000-0000-4000-8000-000000000001" },
      error: null,
    },
    players: {
      data: {
        id: "30000000-0000-4000-8000-000000000001",
        nickname: "Fixture Player",
        guild_id: null,
        world_id: "10000000-0000-4000-8000-000000000001",
      },
      error: null,
    },
    worlds: {
      data: {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Fixture World",
      },
      error: null,
    },
  };
  if (failedTable !== undefined) {
    results[failedTable] = {
      data: null,
      error: { code: failedTable === "profiles" ? "42501" : "08006" },
    };
  }
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "00000000-0000-4000-8000-000000000002",
            email: "player@palhatch.fixture.invalid",
          },
        },
        error: null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => results[table],
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("authenticate", () => {
  it("accepts a successful Supabase password login", async () => {
    const result = await authenticate(
      {
        signInWithPassword: async () => ({ error: null }),
      },
      { email: "player-a@palhatch.fixture.invalid", password: "fixture-only" },
    );

    expect(result).toEqual({ ok: true });
  });

  it("returns a stable code for rejected credentials", async () => {
    const result = await authenticate(
      {
        signInWithPassword: async () => ({
          error: { code: "invalid_credentials" },
        }),
      },
      { email: "player-a@palhatch.fixture.invalid", password: "wrong" },
    );

    expect(result).toEqual({ ok: false, error_code: "INVALID_CREDENTIALS" });
  });

  it("maps failures by structured codes rather than misleading messages", () => {
    expect(databaseFailureCode({ code: "42501" })).toBe("FORBIDDEN");
    expect(
      databaseFailureCode({ code: "42501", message: "network wording" }),
    ).toBe("FORBIDDEN");
    expect(
      databaseFailureCode({
        code: "P0001",
        message: "contains PAL_NOT_OWNED but is not a structured code",
      }),
    ).toBe("DATA_UNAVAILABLE");
    expect(authUserErrorCode(null, { code: "upstream_timeout" })).toBe(
      "AUTH_UNAVAILABLE",
    );
    expect(phase5HttpStatus("AUTH_UNAVAILABLE")).toBe(503);
  });

  it.each([
    ["profiles", "FORBIDDEN"],
    ["player_bindings", "DATA_UNAVAILABLE"],
    ["worlds", "DATA_UNAVAILABLE"],
  ] as const)(
    "does not turn a %s query failure into an unbound identity",
    async (table, code) => {
      await expect(
        loadUserContext(userContextClient(table)),
      ).rejects.toMatchObject({ code } satisfies Partial<Phase5DataError>);
    },
  );

  it("retries one structured auth request timeout", async () => {
    const client = userContextClient();
    const successfulGetUser = client.auth.getUser.bind(client.auth);
    let attempts = 0;
    client.auth.getUser = (async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          data: { user: null },
          error: { code: "request_timeout", name: "AuthRetryableError" },
        };
      }
      return successfulGetUser();
    }) as typeof client.auth.getUser;

    await expect(loadUserContext(client)).resolves.toMatchObject({
      user_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(attempts).toBe(2);
  });
});
