import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "@/app/[locale]/register/register-form";
import {
  registerPasswordAccount,
  type PasswordRegistrationClient,
} from "@/features/auth/register";

function registrationClient(
  result: Awaited<ReturnType<PasswordRegistrationClient["signUp"]>>,
) {
  return {
    signUp: vi.fn(async () => result),
  } satisfies PasswordRegistrationClient;
}

const validInput = {
  displayName: "  Fixture Player  ",
  email: "  player@example.com  ",
  password: "fixture-password",
  passwordConfirmation: "fixture-password",
  emailRedirectTo: "https://example.invalid/api/auth/confirm?locale=zh",
};

describe("password registration", () => {
  it("creates a player account with normalized profile metadata", async () => {
    const client = registrationClient({
      data: { user: { id: "fixture-user" }, session: { access_token: "set" } },
      error: null,
    });

    await expect(registerPasswordAccount(client, validInput)).resolves.toEqual({
      ok: true,
      requires_email_confirmation: false,
    });
    expect(client.signUp).toHaveBeenCalledWith({
      email: "player@example.com",
      password: "fixture-password",
      options: {
        data: { display_name: "Fixture Player" },
        emailRedirectTo: "https://example.invalid/api/auth/confirm?locale=zh",
      },
    });
  });

  it("validates the complete payload before calling Supabase", async () => {
    const client = registrationClient({
      data: { user: null, session: null },
      error: null,
    });

    await expect(
      registerPasswordAccount(client, {
        ...validInput,
        passwordConfirmation: "different-password",
      }),
    ).resolves.toEqual({ ok: false, error_code: "PASSWORD_MISMATCH" });
    expect(client.signUp).not.toHaveBeenCalled();
  });

  it("maps Supabase failures by stable codes without exposing error text", async () => {
    const emailUnavailable = registrationClient({
      data: { user: null, session: null },
      error: { code: "user_already_exists", message: "sensitive wording" },
    });
    const unavailable = registrationClient({
      data: { user: null, session: null },
      error: { code: "upstream_timeout", message: "network wording" },
    });

    await expect(
      registerPasswordAccount(emailUnavailable, validInput),
    ).resolves.toEqual({ ok: false, error_code: "EMAIL_UNAVAILABLE" });
    await expect(
      registerPasswordAccount(unavailable, validInput),
    ).resolves.toEqual({ ok: false, error_code: "REGISTRATION_UNAVAILABLE" });
  });
});

describe("registration form", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits accessible account fields and explains email confirmation", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            requires_email_confirmation: true,
          }),
        };
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RegisterForm next="/zh/account/binding-invitations/fixture-token" />,
    );
    fireEvent.change(screen.getByLabelText("显示名称"), {
      target: { value: "Fixture Player" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "player@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "fixture-password" },
    });
    fireEvent.change(screen.getByLabelText("确认密码", { selector: "input" }), {
      target: { value: "fixture-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    expect(
      await screen.findByText("确认邮件已发送，请前往邮箱完成注册。"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      display_name: "Fixture Player",
      email: "player@example.com",
      password: "fixture-password",
      password_confirmation: "fixture-password",
      locale: "zh",
      next: "/zh/account/binding-invitations/fixture-token",
    });
    expect(
      screen.getByRole("link", { name: "返回登录" }).getAttribute("href"),
    ).toBe("/login?next=%2Fzh%2Faccount%2Fbinding-invitations%2Ffixture-token");
  });

  it("places a password mismatch error by the confirmation field", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText("显示名称"), {
      target: { value: "Fixture Player" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "player@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "fixture-password" },
    });
    fireEvent.change(screen.getByLabelText("确认密码", { selector: "input" }), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    const error = await screen.findByText("两次输入的密码不一致。");
    expect(error.getAttribute("id")).toBe(
      "register-password-confirmation-error",
    );
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
