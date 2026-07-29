import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizedSecret(value: string): string {
  const trimmed = value.trim();
  return /^[a-z2-9 -]{8,12}$/i.test(trimmed)
    ? trimmed.toUpperCase().replaceAll(/[ -]/g, "")
    : trimmed;
}

export function hashSyncSecret(value: string): string {
  return createHash("sha256")
    .update(normalizedSecret(value), "utf8")
    .digest("hex");
}

export function createPairingCode(
  randomBytes: (size: number) => Buffer = nodeRandomBytes,
): string {
  const entropy = randomBytes(8);
  if (entropy.byteLength < 8) throw new Error("PAIRING_CODE_ENTROPY_REQUIRED");
  const characters = [...entropy].map(
    (value) => PAIRING_ALPHABET[value % PAIRING_ALPHABET.length],
  );
  return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}

export function createDeviceToken(
  randomBytes: (size: number) => Buffer = nodeRandomBytes,
): { value: string; hash: string; prefix: string } {
  const entropy = randomBytes(32);
  if (entropy.byteLength < 32) throw new Error("DEVICE_TOKEN_ENTROPY_REQUIRED");
  const value = `pbs_${entropy.toString("base64url")}`;
  return { value, hash: hashSyncSecret(value), prefix: value.slice(0, 12) };
}

export function readBearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? null;
}
