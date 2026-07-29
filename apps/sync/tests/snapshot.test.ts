import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createReadOnlySnapshot } from "../src/snapshot.js";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

describe("read-only save snapshots", () => {
  it("copies stable saves without changing source bytes or permissions", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-save-"));
    roots.push(root);
    await mkdir(join(root, "Players"));
    await writeFile(join(root, "Level.sav"), "level-fixture");
    await writeFile(join(root, "Players", "player.sav"), "player-fixture");
    await chmod(join(root, "Level.sav"), 0o640);
    const before = await stat(join(root, "Level.sav"));

    const snapshot = await createReadOnlySnapshot(root, {
      delayMilliseconds: 0,
    });
    try {
      expect(await readFile(join(root, "Level.sav"), "utf8")).toBe(
        "level-fixture",
      );
      expect((await stat(join(root, "Level.sav"))).mode & 0o777).toBe(
        before.mode & 0o777,
      );
      expect((await stat(join(snapshot.path, "Level.sav"))).mode & 0o777).toBe(
        0o444,
      );
    } finally {
      await snapshot.cleanup();
    }
    await expect(lstat(snapshot.path)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("skips a source that changes between the two stat checks", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-sync-unstable-"));
    roots.push(root);
    await writeFile(join(root, "Level.sav"), "first");
    await expect(
      createReadOnlySnapshot(root, {
        delayMilliseconds: 0,
        afterFirstStat: async () =>
          writeFile(join(root, "Level.sav"), "changed"),
      }),
    ).rejects.toThrowError(/SAVE_SOURCE_UNSTABLE/);
  });
});
