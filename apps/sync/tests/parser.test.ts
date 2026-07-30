import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bundledParserDirectory,
  parseSnapshot,
  parserBinaryName,
  parserSpawnOptions,
  terminateParser,
  validateParserManifest,
  verifyParserBinary,
  type ParserManifest,
} from "../src/parser.js";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
const hashMismatchPlatforms: Array<"linux-x64" | "win32-x64"> =
  process.platform === "win32" ? ["win32-x64"] : ["linux-x64", "win32-x64"];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

describe("Parser process safety", () => {
  it("selects a platform-specific bundled Parser path and binary name", () => {
    expect(bundledParserDirectory("linux-x64")).toMatch(/bin[\\/]linux-x64$/);
    expect(bundledParserDirectory("win32-x64")).toMatch(/bin[\\/]win32-x64$/);
    expect(parserBinaryName("linux-x64")).toBe("palworld-save-parser");
    expect(parserBinaryName("win32-x64")).toBe("palworld-save-parser.exe");
  });

  it("rejects a manifest for a different runtime platform", () => {
    expect(() =>
      validateParserManifest(
        manifest("linux-x64", "0".repeat(64)),
        "win32-x64",
      ),
    ).toThrowError(/PARSER_MANIFEST_INVALID/);
  });

  it.each(hashMismatchPlatforms)(
    "rejects a %s Parser whose SHA-256 does not match its manifest",
    async (platform) => {
      const root = await mkdtemp(join(tmpdir(), "palbeacon-parser-hash-"));
      roots.push(root);
      const binary = join(root, parserBinaryName(platform));
      await writeFile(binary, "parser fixture", "utf8");
      if (platform === "linux-x64") await chmod(binary, 0o755);

      await expect(
        verifyParserBinary(
          binary,
          manifest(platform, "0".repeat(64)),
          platform,
        ),
      ).rejects.toThrowError(/PARSER_BINARY_HASH_MISMATCH/);
    },
  );

  it("accepts a Windows Parser without relying on a POSIX execute bit", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-parser-win-mode-"));
    roots.push(root);
    const binary = join(root, "palworld-save-parser.exe");
    const contents = Buffer.from("MZ synthetic PE fixture");
    await writeFile(binary, contents, { mode: 0o600 });
    const hash = createHash("sha256").update(contents).digest("hex");

    await expect(
      verifyParserBinary(binary, manifest("win32-x64", hash), "win32-x64"),
    ).resolves.toBeUndefined();
  });

  it("uses a hidden, non-detached child on Windows", () => {
    expect(parserSpawnOptions("win32-x64")).toMatchObject({
      detached: false,
      windowsHide: true,
    });
    expect(parserSpawnOptions("linux-x64")).toMatchObject({
      detached: true,
    });
  });

  it("never sends a negative PID when terminating a Windows Parser", () => {
    const processKill = vi.spyOn(process, "kill").mockReturnValue(true);
    const childKill = vi.fn(() => true);
    terminateParser(
      { pid: 4242, kill: childKill } as unknown as ChildProcess,
      "win32-x64",
    );
    expect(processKill).not.toHaveBeenCalled();
    expect(childKill).toHaveBeenCalledWith();
    processKill.mockRestore();
  });

  it("terminates a timed-out Parser and removes its output directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-parser-test-"));
    roots.push(root);
    const snapshot = join(root, "snapshot");
    await mkdir(snapshot);
    const script = join(root, "slow-parser.mjs");
    await writeFile(script, "setTimeout(() => undefined, 10_000);\n", "utf8");
    const before = new Set(
      (await readdir(tmpdir())).filter((name) =>
        name.startsWith("palbeacon-sync-parser-"),
      ),
    );

    await expect(
      parseSnapshot(snapshot, {
        binary: process.execPath,
        binaryArguments: [script],
        timeoutMilliseconds: 50,
      }),
    ).rejects.toThrowError(/PARSER_TIMEOUT/);

    const after = (await readdir(tmpdir())).filter((name) =>
      name.startsWith("palbeacon-sync-parser-"),
    );
    expect(after.filter((name) => !before.has(name))).toEqual([]);
  });

  it("passes only the explicit Parser environment allowlist", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-parser-env-"));
    roots.push(root);
    const snapshot = join(root, "snapshot");
    await mkdir(snapshot);
    const script = join(root, "environment-parser.mjs");
    const capturedEnvironment = join(root, "environment.txt");
    const canonical = JSON.stringify({
      server: {
        world_uid: "fixture-world",
        save_version: "PlM/0x31",
        captured_at: "2026-07-29T00:00:00.000Z",
      },
      guilds: [],
      players: [],
      pals: [],
    });
    await writeFile(
      script,
      `import { writeFile } from "node:fs/promises";\nconst output = process.argv[process.argv.indexOf("--output") + 1];\nawait writeFile(${JSON.stringify(capturedEnvironment)}, JSON.stringify(process.env));\nawait writeFile(output, ${JSON.stringify(canonical)});\n`,
      "utf8",
    );
    const legacyPathVariable = ["PALHATCH", "OODLE", "LIB"].join("_");
    process.env[legacyPathVariable] = "/secret/runtime.so";
    process.env.PALBEACON_TEST_SECRET = "must-not-leak";
    try {
      await parseSnapshot(snapshot, {
        binary: process.execPath,
        binaryArguments: [script],
      });
    } finally {
      delete process.env[legacyPathVariable];
      delete process.env.PALBEACON_TEST_SECRET;
    }

    const environment = await readFile(capturedEnvironment, "utf8");
    expect(environment).not.toContain(legacyPathVariable);
    expect(environment).not.toContain("PALBEACON_TEST_SECRET");
  });

  it("rejects a Parser that writes output and then fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-parser-fail-"));
    roots.push(root);
    const snapshot = join(root, "snapshot");
    await mkdir(snapshot);
    const script = join(root, "partial-parser.mjs");
    await writeFile(
      script,
      'import { writeFile } from "node:fs/promises";\nconst output = process.argv[process.argv.indexOf("--output") + 1];\nawait writeFile(output, JSON.stringify({ server: {} }));\nprocess.exitCode = 23;\n',
      "utf8",
    );

    await expect(
      parseSnapshot(snapshot, {
        binary: process.execPath,
        binaryArguments: [script],
      }),
    ).rejects.toThrowError(/PARSER_FAILED/);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a successful Parser that points output outside its temporary directory",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-parser-link-"));
      roots.push(root);
      const snapshot = join(root, "snapshot");
      await mkdir(snapshot);
      const outside = join(root, "outside.json");
      await writeFile(
        outside,
        JSON.stringify({
          server: {
            world_uid: "outside",
            save_version: null,
            captured_at: "2026-07-29T00:00:00.000Z",
          },
          guilds: [],
          players: [],
          pals: [],
        }),
        "utf8",
      );
      const binary = join(root, "link-parser");
      await writeFile(
        binary,
        `#!/bin/sh\n/bin/ln -s '${outside}' "$4"\n`,
        "utf8",
      );
      await chmod(binary, 0o755);

      await expect(parseSnapshot(snapshot, { binary })).rejects.toThrowError(
        /PARSER_OUTPUT_INVALID/,
      );
    },
  );
});

function manifest(
  platform: "linux-x64" | "win32-x64",
  sha256: string,
): ParserManifest {
  return {
    schema_version: 1,
    binary_name:
      platform === "win32-x64"
        ? "palworld-save-parser.exe"
        : "palworld-save-parser",
    platform,
    version: "1.3.0",
    sha256,
    license: "GPL-3.0-or-later",
    source_repository: "https://github.com/MetalLee/PalHatchHelper",
    source_commit: "a".repeat(40),
    source_subdirectory: "parser",
    source_tree_clean: true,
    upstream_repository:
      "https://github.com/deafdudecomputers/PalworldSaveTools",
    upstream_commit: "b".repeat(40),
  };
}
