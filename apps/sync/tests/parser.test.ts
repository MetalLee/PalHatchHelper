import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
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
      parseSnapshot(snapshot, {
        binary,
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
    const binary = join(root, "environment-parser");
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
      binary,
      `#!/bin/sh\n/usr/bin/env > '${capturedEnvironment}'\nprintf '%s' '${canonical}' > "$4"\n`,
      "utf8",
    );
    await chmod(binary, 0o755);
    const legacyPathVariable = ["PALHATCH", "OODLE", "LIB"].join("_");
    process.env[legacyPathVariable] = "/secret/runtime.so";
    process.env.PALBEACON_TEST_SECRET = "must-not-leak";
    try {
      await parseSnapshot(snapshot, { binary });
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
    const binary = join(root, "partial-parser");
    await writeFile(
      binary,
      '#!/bin/sh\nprintf \'{"server":{}}\' > "$4"\nexit 23\n',
      "utf8",
    );
    await chmod(binary, 0o755);

    await expect(parseSnapshot(snapshot, { binary })).rejects.toThrowError(
      /PARSER_FAILED/,
    );
  });

  it("rejects a successful Parser that points output outside its temporary directory", async () => {
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
  });
});
