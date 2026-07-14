export interface PasswordAuthClient {
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ error: { code?: string } | null }>;
}

export type AuthenticationResult =
  | { ok: true }
  | { ok: false; error_code: "INVALID_CREDENTIALS" | "AUTH_UNAVAILABLE" };

export async function authenticate(
  client: PasswordAuthClient,
  credentials: { email: string; password: string },
): Promise<AuthenticationResult> {
  const { error } = await client.signInWithPassword(credentials);
  if (error === null) return { ok: true };

  return {
    ok: false,
    error_code:
      error.code === "invalid_credentials"
        ? "INVALID_CREDENTIALS"
        : "AUTH_UNAVAILABLE",
  };
}
