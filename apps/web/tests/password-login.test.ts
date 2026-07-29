import { afterEach, describe, expect, it } from "vitest";

import { isPasswordLoginEnabled } from "@/features/auth/password-login";

const original = process.env.ENABLE_PASSWORD_LOGIN;
afterEach(() => {
  if (original === undefined) delete process.env.ENABLE_PASSWORD_LOGIN;
  else process.env.ENABLE_PASSWORD_LOGIN = original;
});

describe("password login feature switch", () => {
  it("honors explicit enabled and disabled values", () => {
    process.env.ENABLE_PASSWORD_LOGIN = "true";
    expect(isPasswordLoginEnabled()).toBe(true);
    process.env.ENABLE_PASSWORD_LOGIN = "false";
    expect(isPasswordLoginEnabled()).toBe(false);
  });
});
