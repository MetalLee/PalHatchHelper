import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const schemaPath = resolve(
  import.meta.dirname,
  "../schema/phase8-admin.schema.json",
);

describe("Phase 8 admin contracts", () => {
  it("defines every browser and Agent admin boundary from one schema", () => {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      title?: string;
      $defs?: Record<string, unknown>;
    };
    const definitions = [schema.title, ...Object.keys(schema.$defs ?? {})];

    expect(definitions).toEqual(
      expect.arrayContaining([
        "AdminOverview",
        "AdminBindingCandidate",
        "AdminBindingEvent",
        "AdminSaveParserStatus",
        "AdminCatalogVersion",
        "AdminCatalogAction",
        "AdminJobSummary",
        "AdminJobAction",
        "RuntimeSettings",
        "RuntimeSettingsVersion",
        "AgentCommandStatus",
        "AdminAuditEvent",
        "AdminError",
      ]),
    );
  });
});
