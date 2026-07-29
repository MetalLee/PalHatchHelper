import { describe, expect, it } from "vitest";

import { helpText, parseArguments } from "../src/cli-options.js";

describe("command-line interface", () => {
  it("does not advertise or accept the removed external decoder option", () => {
    const removedOption = ["--oo", "dle-lib"].join("");

    expect(helpText("0.1.0")).not.toContain(removedOption);
    expect(() => parseArguments([removedOption, "/legacy/runtime.so"])).toThrow(
      /ARGUMENTS_INVALID/,
    );
  });

  it("accepts the optional first-sync choice", () => {
    expect(parseArguments(["--sync-now", "yes"]).get("sync-now")).toBe("yes");
  });
});
