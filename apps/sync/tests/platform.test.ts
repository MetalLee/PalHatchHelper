import { describe, expect, it } from "vitest";

import { runtimePlatform } from "../src/platform.js";

describe("platform support", () => {
  it("maps Linux and Windows x64 to stable API platform values", () => {
    expect(runtimePlatform("linux", "x64")).toBe("linux-x64");
    expect(runtimePlatform("win32", "x64")).toBe("win32-x64");
  });

  it.each([
    ["darwin", "x64"],
    ["linux", "arm64"],
    ["win32", "arm64"],
    ["linux", "ia32"],
    ["win32", "ia32"],
  ] as const)(
    "rejects unsupported %s %s runtimes",
    (platform, architecture) => {
      expect(() => runtimePlatform(platform, architecture)).toThrowError(
        /PLATFORM_UNSUPPORTED/,
      );
    },
  );
});
