import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import schema from "../schema/system-status.schema.json";
import readinessSchema from "../schema/readiness-status.schema.json";

describe("system-status contract", () => {
  it("accepts a complete UTC status and rejects missing fields", () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(
      validate({
        status: "ok",
        service: "web",
        version: "0.0.0",
        timestamp: "2026-07-13T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(validate({ status: "ok" })).toBe(false);
  });
});

describe("readiness-status contract", () => {
  it("accepts the ready and not-ready endpoint payloads", () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(readinessSchema);
    const baseStatus = {
      service: "agent",
      version: "0.0.0",
      timestamp: "2026-07-13T00:00:00.000Z",
    };

    expect(validate({ ...baseStatus, status: "ready", error_code: null })).toBe(
      true,
    );
    expect(
      validate({
        ...baseStatus,
        status: "not_ready",
        error_code: "configuration_invalid",
      }),
    ).toBe(true);
  });
});
