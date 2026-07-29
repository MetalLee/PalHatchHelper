import { describe, expect, it } from "vitest";

import {
  helpText,
  parseArguments,
  parseInspectArguments,
} from "../src/cli-options.js";

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

  it("documents and strictly parses the offline inspect command", () => {
    expect(helpText("0.1.0")).toContain(
      "inspect --save-dir <目录> --canonical-output <文件> --payload-output <文件>",
    );
    expect(helpText("0.1.0")).toContain(
      "inspect 不登录、不读取设备凭据，也不上传数据",
    );
    expect(
      parseInspectArguments([
        "--save-dir",
        "/fixture/save",
        "--canonical-output",
        "/fixture/canonical.json",
        "--payload-output",
        "/fixture/payload.json",
      ]),
    ).toEqual({
      saveDirectory: "/fixture/save",
      canonicalOutput: "/fixture/canonical.json",
      payloadOutput: "/fixture/payload.json",
    });
    expect(() =>
      parseInspectArguments([
        "--save-dir",
        "/fixture/save",
        "--canonical-output",
        "/fixture/canonical.json",
      ]),
    ).toThrowError(/ARGUMENTS_INVALID/);
  });
});
