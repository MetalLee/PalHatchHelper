import { describe, expect, it } from "vitest";

import { GET } from "../app/api/health/route";

describe("GET /api/health", () => {
  it("returns a versioned UTC system status", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("web");
    expect(body.version).toBe("0.0.0");
    expect(new Date(body.timestamp ?? "invalid").toISOString()).toBe(
      body.timestamp,
    );
  });
});
