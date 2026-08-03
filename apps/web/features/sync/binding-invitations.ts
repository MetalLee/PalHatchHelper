import { createHash, randomBytes } from "node:crypto";

export const bindingInvitationTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function createBindingInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashBindingInvitationToken(token: string): string {
  if (!bindingInvitationTokenPattern.test(token)) {
    throw new Error("BINDING_INVITATION_TOKEN_INVALID");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}
