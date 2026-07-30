import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, win32 } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findWorldSave } from "../src/discovery.js";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

describe("world-save discovery", () => {
  it.each(["PalServer", "Program Files", "幻兽帕鲁服务器"])(
    "finds the unique world beneath a path containing %s",
    async (segment) => {
      const root = await mkdtemp(join(tmpdir(), "palbeacon-discovery-"));
      roots.push(root);
      const world = join(
        root,
        segment,
        "Pal",
        "Saved",
        "SaveGames",
        "0",
        "ABC",
      );
      await mkdir(world, { recursive: true });
      await writeFile(join(world, "Level.sav"), "fixture", "utf8");

      await expect(findWorldSave(join(root, segment))).resolves.toBe(
        await realpath(world),
      );
    },
  );

  it("preserves native Windows drive-letter paths without POSIX escaping", () => {
    expect(
      win32.join(
        "C:\\PalServer\\Pal\\Saved\\SaveGames",
        "0",
        "ABC",
        "Level.sav",
      ),
    ).toBe("C:\\PalServer\\Pal\\Saved\\SaveGames\\0\\ABC\\Level.sav");
    expect(
      win32.join(
        "C:\\Program Files\\PalServer\\Pal\\Saved\\SaveGames",
        "0",
        "ABC",
        "Level.sav",
      ),
    ).toBe(
      "C:\\Program Files\\PalServer\\Pal\\Saved\\SaveGames\\0\\ABC\\Level.sav",
    );
    expect(
      win32.join(
        "C:\\幻兽帕鲁服务器\\Pal\\Saved\\SaveGames",
        "0",
        "ABC",
        "Level.sav",
      ),
    ).toBe("C:\\幻兽帕鲁服务器\\Pal\\Saved\\SaveGames\\0\\ABC\\Level.sav");
  });

  it("refuses to choose when more than one world is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-multi-world-"));
    roots.push(root);
    for (const worldId of ["ABC", "DEF"]) {
      const world = join(root, "SaveGames", "0", worldId);
      await mkdir(world, { recursive: true });
      await writeFile(join(world, "Level.sav"), "fixture", "utf8");
    }
    await expect(findWorldSave(root)).rejects.toThrowError(
      /MULTIPLE_WORLD_SAVES_FOUND/,
    );
  });

  it("refuses a filesystem root instead of scanning an entire drive", async () => {
    await expect(findWorldSave(parse(tmpdir()).root)).rejects.toThrowError(
      /SAVE_DIRECTORY_TOO_BROAD/,
    );
  });
});
