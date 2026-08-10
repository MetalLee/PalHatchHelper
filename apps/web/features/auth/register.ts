export const REGISTRATION_PASSWORD_MIN_LENGTH = 8;
export const REGISTRATION_PASSWORD_MAX_LENGTH = 128;

export type RegistrationErrorCode =
  | "INVALID_DISPLAY_NAME"
  | "INVALID_EMAIL"
  | "WEAK_PASSWORD"
  | "PASSWORD_MISMATCH"
  | "EMAIL_UNAVAILABLE"
  | "REGISTRATION_UNAVAILABLE";

export type RegistrationResult =
  | { ok: true; requires_email_confirmation: boolean }
  | { ok: false; error_code: RegistrationErrorCode };

type RegistrationResponse = {
  data: {
    user: { id: string } | null;
    session: unknown | null;
  };
  error: { code?: string; message?: string } | null;
};

export interface PasswordRegistrationClient {
  signUp(credentials: {
    email: string;
    password: string;
    options: {
      data: { display_name: string };
      emailRedirectTo: string;
    };
  }): Promise<RegistrationResponse>;
}

export type PasswordRegistrationInput = {
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  emailRedirectTo: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerPasswordAccount(
  client: PasswordRegistrationClient,
  input: PasswordRegistrationInput,
): Promise<RegistrationResult> {
  const displayName = input.displayName.trim();
  const email = input.email.trim();

  if (displayName.length < 1 || displayName.length > 80) {
    return { ok: false, error_code: "INVALID_DISPLAY_NAME" };
  }
  if (email.length > 254 || !emailPattern.test(email)) {
    return { ok: false, error_code: "INVALID_EMAIL" };
  }
  if (
    input.password.length < REGISTRATION_PASSWORD_MIN_LENGTH ||
    input.password.length > REGISTRATION_PASSWORD_MAX_LENGTH
  ) {
    return { ok: false, error_code: "WEAK_PASSWORD" };
  }
  if (input.password !== input.passwordConfirmation) {
    return { ok: false, error_code: "PASSWORD_MISMATCH" };
  }

  const { data, error } = await client.signUp({
    email,
    password: input.password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: input.emailRedirectTo,
    },
  });
  if (error !== null) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { ok: false, error_code: "EMAIL_UNAVAILABLE" };
    }
    if (error.code === "weak_password") {
      return { ok: false, error_code: "WEAK_PASSWORD" };
    }
    return { ok: false, error_code: "REGISTRATION_UNAVAILABLE" };
  }
  if (data.user === null) {
    return { ok: false, error_code: "REGISTRATION_UNAVAILABLE" };
  }
  return {
    ok: true,
    requires_email_confirmation: data.session === null,
  };
}
