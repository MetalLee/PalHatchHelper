export function isPasswordLoginEnabled(): boolean {
  return (
    process.env.ENABLE_PASSWORD_LOGIN === "true" ||
    (process.env.NODE_ENV === "test" &&
      process.env.ENABLE_PASSWORD_LOGIN !== "false")
  );
}
