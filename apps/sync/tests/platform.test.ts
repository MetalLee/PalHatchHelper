import { describe, expect, it } from "vitest";

import { assertSupportedPlatform } from "../src/platform.js";

describe("platform support", () => {
  it("supports only Linux x64", () => {
    expect(() => assertSupportedPlatform("linux", "x64")).not.toThrow();
    expect(() => assertSupportedPlatform("win32", "x64")).toThrowError(
      /PLATFORM_UNSUPPORTED/,
    );
    expect(() => assertSupportedPlatform("darwin", "arm64")).toThrowError(
      /PLATFORM_UNSUPPORTED/,
    );
  });
});
