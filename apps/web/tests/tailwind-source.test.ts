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
});
