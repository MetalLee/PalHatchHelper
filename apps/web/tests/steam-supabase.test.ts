import type { Database } from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SteamAccountStageError } from "@/features/auth/steam-account";
import { createSteamAccountDependencies } from "@/features/auth/steam-supabase";

function client(value: unknown): SupabaseClient<Database> {
  return value as SupabaseClient<Database>;
}

describe("Steam Supabase Admin adapter", () => {
  it("generates and verifies a one-time magic-link token, then can delete only the supplied Auth user", async () => {
    const generateLink = vi.fn(async () => ({
      data: { properties: { hashed_token: "fixture-token-hash" } },
      error: null,
    }));
    const deleteUser = vi.fn(async () => ({ data: {}, error: null }));
    const verifyOtp = vi.fn(async () => ({ data: {}, error: null }));
    const dependencies = createSteamAccountDependencies(
      client({ auth: { admin: { generateLink, deleteUser } } }),
      client({ auth: { verifyOtp } }),
    );

    await expect(
      dependencies.createMagicLinkToken(
        "steam+76561198000000000@auth.palbeacon.invalid",
      ),
    ).resolves.toBe("fixture-token-hash");
    await expect(
      dependencies.verifyMagicLinkToken("fixture-token-hash"),
    ).resolves.toBeUndefined();
    await expect(
      dependencies.deleteAuthUser("00000000-0000-4000-8000-000000000099"),
    ).resolves.toBeUndefined();

    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "steam+76561198000000000@auth.palbeacon.invalid",
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "fixture-token-hash",
      type: "email",
    });
    expect(deleteUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000099",
    );
  });

  it("retains only safe database metadata for a profile permission failure", async () => {
    const sensitiveError = {
      code: "42501",
      status: 403,
      message: "permission denied with sensitive detail",
      headers: { authorization: "service-role-secret" },
    };
    const upsert = vi.fn(async () => ({ error: sensitiveError }));
    const dependencies = createSteamAccountDependencies(
      client({
        auth: { admin: {} },
        from: vi.fn(() => ({ upsert })),
      }),
      client({ auth: {} }),
    );

    await expect(
      dependencies.ensureProfile(
        "00000000-0000-4000-8000-000000000099",
        "Fixture Player",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SteamAccountStageError>>({
        code: "STEAM_ACCOUNT_UNAVAILABLE",
        stage: "ensure_profile",
        databaseCode: "42501",
        httpStatus: 403,
      }),
    );
  });
});
