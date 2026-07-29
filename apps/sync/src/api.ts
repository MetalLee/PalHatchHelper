import type {
  InventoryPublishPayload,
  SyncHeartbeatRequest,
  SyncPairRequest,
  SyncPairResponse,
} from "@palhatch/contracts";

const MAX_RESPONSE_BYTES = 1024 * 1024;

export class DeviceAuthorizationError extends Error {
  constructor() {
    super("DEVICE_AUTHORIZATION_FAILED");
  }
}

export async function pairDevice(
  baseUrl: string,
  request: SyncPairRequest,
): Promise<SyncPairResponse> {
  return requestJson<SyncPairResponse>(baseUrl, "/api/sync/pair", request);
}

export async function uploadSnapshot(
  baseUrl: string,
  token: string,
  snapshot: InventoryPublishPayload,
): Promise<void> {
  await requestJson(baseUrl, "/api/sync/snapshots", snapshot, token);
}

export async function sendHeartbeat(
  baseUrl: string,
  token: string,
  heartbeat: SyncHeartbeatRequest,
): Promise<void> {
  await requestJson(baseUrl, "/api/sync/heartbeat", heartbeat, token);
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const url = new URL(path, `${baseUrl.replace(/\/+$/, "")}/`);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 401) throw new DeviceAuthorizationError();
      if (response.status >= 500 && attempt < 2) {
        await backoff(attempt);
        continue;
      }
      const text = await readLimitedResponse(response);
      if (!response.ok) {
        const code = safeErrorCode(text) ?? `HTTP_${response.status}`;
        throw new Error(code);
      }
      return (text.length === 0 ? undefined : JSON.parse(text)) as T;
    } catch (error) {
      if (error instanceof DeviceAuthorizationError) throw error;
      lastError = error;
      if (attempt < 2 && isRetryable(error)) {
        await backoff(attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function readLimitedResponse(response: Response): Promise<string> {
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES)
    throw new Error("API_RESPONSE_TOO_LARGE");
  return text;
}

function safeErrorCode(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const code = record.error_code ?? record.error;
    return typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code)
      ? code
      : undefined;
  } catch {
    return undefined;
  }
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

async function backoff(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
}
