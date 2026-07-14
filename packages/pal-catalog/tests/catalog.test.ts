import { describe, expect, it } from "vitest";

import { fixtureCatalog } from "../src";

describe("catalog boundary", () => {
  it("ships only clearly identified fictional data", () => {
    expect(fixtureCatalog.fixture_notice).toBe("FICTIONAL_TEST_DATA_ONLY");
    expect(fixtureCatalog.pals).toHaveLength(1);
    expect(fixtureCatalog.pals[0]?.pal_id).toBe("fixture-pal-a");
  });
});
