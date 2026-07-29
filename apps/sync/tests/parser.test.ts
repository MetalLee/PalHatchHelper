import { chmod, mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseSnapshot } from "../src/parser.js";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

describe("Parser process safety", () => {
  it("terminates a timed-out Parser and removes its output directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-parser-test-"));
    roots.push(root);
    const snapshot = join(root, "snapshot");
    await mkdir(snapshot);
    const binary = join(root, "slow-parser");
    await writeFile(binary, "#!/bin/sh\nsleep 10\n", "utf8");
    await chmod(binary, 0o755);
    const before = new Set(
      (await readdir(tmpdir())).filter((name) =>
        name.startsWith("palbeacon-sync-parser-"),
      ),
    );

    await expect(
      parseSnapshot(
        snapshot,
        { path: "/fixture/oodle", sha256: "a".repeat(64) },
        {
          binary,
          timeoutMilliseconds: 50,
        },
      ),
    ).rejects.toThrowError(/PARSER_TIMEOUT/);

    const after = (await readdir(tmpdir())).filter((name) =>
      name.startsWith("palbeacon-sync-parser-"),
    );
    expect(after.filter((name) => !before.has(name))).toEqual([]);
  });
});
