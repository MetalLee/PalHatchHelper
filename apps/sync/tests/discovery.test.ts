import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, win32 } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findWorldSave } from "../src/discovery.js";
import { removeTestDirectory } from "./support.js";

const WORLD_UID = "64EAE19D36004D1FA0321A3703BD825F";
const OTHER_WORLD_UID = "74EAE19D36004D1FA0321A3703BD825F";
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
        WORLD_UID,
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
        WORLD_UID,
        "Level.sav",
      ),
    ).toBe(`C:\\PalServer\\Pal\\Saved\\SaveGames\\0\\${WORLD_UID}\\Level.sav`);
    expect(
      win32.join(
        "C:\\Program Files\\PalServer\\Pal\\Saved\\SaveGames",
        "0",
        WORLD_UID,
        "Level.sav",
      ),
    ).toBe(
      `C:\\Program Files\\PalServer\\Pal\\Saved\\SaveGames\\0\\${WORLD_UID}\\Level.sav`,
    );
    expect(
      win32.join(
        "C:\\幻兽帕鲁服务器\\Pal\\Saved\\SaveGames",
        "0",
        WORLD_UID,
        "Level.sav",
      ),
    ).toBe(
      `C:\\幻兽帕鲁服务器\\Pal\\Saved\\SaveGames\\0\\${WORLD_UID}\\Level.sav`,
    );
  });

  it("prefers an explicitly selected live world over nested backups", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-discovery-world-"));
    roots.push(root);
    const world = join(root, WORLD_UID);
    await mkdir(join(world, "backup", "world", "20260731"), {
      recursive: true,
    });
    await writeFile(join(world, "Level.sav"), "live", "utf8");
    await writeFile(
      join(world, "backup", "world", "20260731", "Level.sav"),
      "backup",
      "utf8",
    );

    await expect(findWorldSave(world)).resolves.toBe(await realpath(world));
  });

  it("ignores backup trees when discovering from a parent directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-discovery-parent-"));
    roots.push(root);
    const world = join(root, WORLD_UID);
    await mkdir(world);
    await mkdir(join(root, "backups", OTHER_WORLD_UID), { recursive: true });
    await writeFile(join(world, "Level.sav"), "live", "utf8");
    await writeFile(
      join(root, "backups", OTHER_WORLD_UID, "Level.sav"),
      "backup",
      "utf8",
    );

    await expect(findWorldSave(root)).resolves.toBe(await realpath(world));
  });

  it("still rejects two independent live worlds", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-multi-world-"));
    roots.push(root);
    for (const worldId of [WORLD_UID, OTHER_WORLD_UID]) {
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
