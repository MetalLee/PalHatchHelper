import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: {
    signUp: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    verifyOtp: vi.fn(),
  },
}));

vi.mock("@/features/auth/password-login", () => ({
  isPasswordLoginEnabled: () => true,
}));

vi.mock("@/lib/supabase/config", () => ({
  getPublicAppUrl: () => "https://www.palbeacon.app",
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: authState }),
}));

import { GET as confirmEmail } from "@/app/api/auth/confirm/route";
import { POST as register } from "@/app/api/auth/register/route";

describe("registration routes", () => {
  beforeEach(() => {
    authState.signUp.mockReset().mockResolvedValue({
      data: { user: { id: "fixture-user" }, session: null },
      error: null,
    });
    authState.exchangeCodeForSession.mockReset().mockResolvedValue({
      data: { session: { access_token: "fixture" } },
      error: null,
    });
    authState.verifyOtp.mockReset().mockResolvedValue({
      data: { session: { access_token: "fixture" } },
      error: null,
    });
  });

  it("registers with a trusted localized confirmation redirect", async () => {
    const response = await register(
      new NextRequest("https://www.palbeacon.app/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: "Fixture Player",
          email: "player@example.com",
          password: "fixture-password",
          password_confirmation: "fixture-password",
          locale: "en",
          next: "/en/account?from=invite",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requires_email_confirmation: true,
    });
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(authState.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          data: { display_name: "Fixture Player" },
          emailRedirectTo:
            "https://www.palbeacon.app/api/auth/confirm?locale=en&next=%2Fen%2Faccount%3Ffrom%3Dinvite",
        },
      }),
    );
  });

  it("rejects malformed registration bodies before calling Supabase", async () => {
    const response = await register(
      new NextRequest("https://www.palbeacon.app/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "player@example.com", locale: "zh" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error_code: "INVALID_REGISTRATION",
    });
    expect(authState.signUp).not.toHaveBeenCalled();
  });

  it("exchanges a confirmation code and redirects only to a safe app path", async () => {
    const response = await confirmEmail(
      new NextRequest(
        "https://www.palbeacon.app/api/auth/confirm?code=fixture-code&locale=en&next=https%3A%2F%2Fevil.invalid",
      ),
    );

    expect(authState.exchangeCodeForSession).toHaveBeenCalledWith(
      "fixture-code",
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.palbeacon.app/en/overview",
    );
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("returns failed confirmations to the localized login page", async () => {
    authState.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null },
      error: { code: "otp_expired" },
    });
    const response = await confirmEmail(
      new NextRequest(
        "https://www.palbeacon.app/api/auth/confirm?code=expired&locale=zh",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://www.palbeacon.app/zh/login?error=EMAIL_CONFIRMATION_FAILED",
    );
  });
});
