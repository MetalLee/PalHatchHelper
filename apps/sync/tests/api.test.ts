import { afterEach, describe, expect, it, vi } from "vitest";

import { DeviceAuthorizationError, sendHeartbeat } from "../src/api.js";

afterEach(() => vi.unstubAllGlobals());

describe("device API authorization", () => {
  it("turns a revoked-device 401 into a non-retryable authorization error", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('{"error":"SYNC_DEVICE_UNAUTHORIZED"}', { status: 401 }),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      sendHeartbeat("https://www.palbeacon.app", "pbs_secret", {
        status: "unchanged",
      }),
    ).rejects.toBeInstanceOf(DeviceAuthorizationError);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
