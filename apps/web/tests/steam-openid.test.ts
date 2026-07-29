import { describe, expect, it, vi } from "vitest";

import {
  buildSteamAuthorizationUrl,
  createSteamState,
  SteamAuthError,
  validateSteamState,
  verifySteamAssertion,
} from "@/features/auth/steam-openid";

describe("Steam OpenID", () => {
  it("creates a high-entropy state and the exact OpenID 2.0 redirect", () => {
    const state = createSteamState({
      next: "/zh/account",
      intent: "link",
      now: new Date("2026-07-29T00:00:00.000Z"),
      randomBytes: () => Buffer.alloc(32, 7),
    });
    const redirect = buildSteamAuthorizationUrl({
      publicUrl: "https://www.palbeacon.app",
      state: state.state,
    });

    expect(state.state).toHaveLength(64);
    expect(state.cookieValue).not.toContain("/zh/account");
    expect(redirect.origin + redirect.pathname).toBe(
      "https://steamcommunity.com/openid/login",
    );
    expect(redirect.searchParams.get("openid.ns")).toBe(
      "http://specs.openid.net/auth/2.0",
    );
    expect(redirect.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(redirect.searchParams.get("openid.realm")).toBe(
      "https://www.palbeacon.app",
    );
    expect(redirect.searchParams.get("openid.return_to")).toBe(
      `https://www.palbeacon.app/api/auth/steam/callback?state=${state.state}`,
    );
  });

  it.each([
    [null, "fixture", "STEAM_STATE_MISSING"],
    ["invalid", "fixture", "STEAM_STATE_INVALID"],
  ] as const)(
    "rejects missing or malformed state",
    (cookie, callback, code) => {
      expect(() =>
        validateSteamState({
          cookieValue: cookie,
          callbackState: callback,
          now: new Date("2026-07-29T00:00:01.000Z"),
        }),
      ).toThrowError(expect.objectContaining({ code }));
    },
  );

  it("rejects mismatched, expired and replayed state", () => {
    const state = createSteamState({
      next: "https://evil.invalid/steal",
      intent: "login",
      now: new Date("2026-07-29T00:00:00.000Z"),
      randomBytes: () => Buffer.alloc(32, 9),
    });

    expect(() =>
      validateSteamState({
        cookieValue: state.cookieValue,
        callbackState: "wrong",
        now: new Date("2026-07-29T00:00:01.000Z"),
      }),
    ).toThrowError(expect.objectContaining({ code: "STEAM_STATE_INVALID" }));
    expect(() =>
      validateSteamState({
        cookieValue: state.cookieValue,
        callbackState: state.state,
        now: new Date("2026-07-29T00:10:01.000Z"),
      }),
    ).toThrowError(expect.objectContaining({ code: "STEAM_STATE_EXPIRED" }));
    expect(() =>
      validateSteamState({
        cookieValue: null,
        callbackState: state.state,
        now: new Date("2026-07-29T00:00:01.000Z"),
      }),
    ).toThrowError(expect.objectContaining({ code: "STEAM_STATE_MISSING" }));
  });

  it("posts the OpenID assertion back to Steam and accepts only a valid SteamID64", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("POST");
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("openid.mode")).toBe("check_authentication");
        return new Response(
          "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n",
        );
      },
    );
    const params = new URLSearchParams({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "id_res",
      "openid.claimed_id":
        "http://steamcommunity.com/openid/id/76561198000000000",
      "openid.identity":
        "http://steamcommunity.com/openid/id/76561198000000000",
    });

    await expect(verifySteamAssertion(params, fetcher)).resolves.toBe(
      "76561198000000000",
    );
  });

  it("rejects Steam is_valid:false and malformed claimed identities", async () => {
    const invalidFetcher = vi.fn(async () => new Response("is_valid:false\n"));
    const invalid = new URLSearchParams({
      "openid.claimed_id":
        "https://steamcommunity.com/openid/id/76561198000000000",
    });
    await expect(verifySteamAssertion(invalid, invalidFetcher)).rejects.toEqual(
      expect.objectContaining<Partial<SteamAuthError>>({
        code: "STEAM_ASSERTION_INVALID",
      }),
    );

    const malformed = new URLSearchParams({
      "openid.claimed_id": "https://evil.invalid/id/76561198000000000",
    });
    await expect(
      verifySteamAssertion(
        malformed,
        async () => new Response("is_valid:true\n"),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SteamAuthError>>({
        code: "STEAM_ID_INVALID",
      }),
    );
  });
});
