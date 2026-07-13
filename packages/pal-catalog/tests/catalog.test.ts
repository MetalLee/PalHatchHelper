import { describe, expect, it } from "vitest";

import { fixtureCatalog } from "../src";

describe("catalog boundary", () => {
  it("ships only a clearly identified Phase 0 fixture", () => {
    expect(fixtureCatalog.version).toBe("phase0-fixture-v1");
    expect(fixtureCatalog.pals).toHaveLength(1);
    expect(fixtureCatalog.pals[0]?.id).toBe("fixture-pal");
  });
});
