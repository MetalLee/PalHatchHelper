import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Tailwind source discovery", () => {
  it("includes utility classes from the shared UI package", () => {
    const globalStyles = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8",
    );

    expect(globalStyles).toContain('@source "../../../packages/ui/src";');
  });

  it("uses one full-height row of alternating triangles for passive badges", () => {
    const globalStyles = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8",
    );
    const patternStart = globalStyles.indexOf(".passive-badge::before");
    const patternEnd = globalStyles.indexOf(
      '.passive-badge[data-rank="negative"]',
      patternStart,
    );
    const passivePattern = globalStyles.slice(patternStart, patternEnd);

    expect(passivePattern).toContain("data:image/svg+xml");
    expect(passivePattern).toContain("M0%2028L36%2028L18%200Z");
    expect(passivePattern).toContain("M36%200L72%200L54%2028Z");
    expect(passivePattern).toContain("background-repeat: repeat-x, no-repeat;");
    expect(passivePattern).toContain("72px 100%");
    expect(passivePattern).not.toContain("conic-gradient");
  });
});
