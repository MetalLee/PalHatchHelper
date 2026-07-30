import { lstat, opendir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

import { worldUidFromSaveDirectory } from "./world-id.js";

const MAX_SEARCH_DEPTH = 6;
const IGNORED_DIRECTORY_NAMES = new Set(["backup", "backups"]);

export async function findWorldSave(saveDirectory: string): Promise<string> {
  const root = resolve(saveDirectory);
  await assertDirectory(root, "SAVE_DIRECTORY_INVALID");
  if (parse(root).root === root) throw new Error("SAVE_DIRECTORY_TOO_BROAD");
  const canonicalRoot = await realpath(root);
  if (await isRegularFile(join(canonicalRoot, "Level.sav"))) {
    worldUidFromSaveDirectory(canonicalRoot);
    return canonicalRoot;
  }
  const matches: string[] = [];
  await walk(
    canonicalRoot,
    MAX_SEARCH_DEPTH,
    canonicalRoot,
    async (path, name) => {
      if (name !== "Level.sav") return;
      const directory = dirname(path);
      try {
        worldUidFromSaveDirectory(directory);
        matches.push(directory);
      } catch (error) {
        if (
          !(error instanceof Error && error.message === "WORLD_SAVE_ID_INVALID")
        )
          throw error;
      }
    },
  );
  if (matches.length === 0) throw new Error("WORLD_SAVE_NOT_FOUND");
  if (matches.length > 1) throw new Error("MULTIPLE_WORLD_SAVES_FOUND");
  return realpath(matches[0]!);
}

async function isRegularFile(path: string): Promise<boolean> {
  const info = await lstat(path).catch(() => undefined);
  return info?.isFile() === true && !info.isSymbolicLink();
}

async function assertDirectory(path: string, code: string): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(code);
}

async function walk(
  directory: string,
  remainingDepth: number,
  root: string,
  visit: (path: string, name: string) => Promise<void>,
): Promise<void> {
  const handle = await opendir(directory);
  for await (const entry of handle) {
    const path = join(directory, entry.name);
    const info = await lstat(path).catch(() => undefined);
    if (info === undefined || info.isSymbolicLink()) continue;
    if (info.isFile()) await visit(path, entry.name);
    else if (
      info.isDirectory() &&
      remainingDepth > 0 &&
      !IGNORED_DIRECTORY_NAMES.has(entry.name.toLowerCase())
    ) {
      const canonical = await realpath(path).catch(() => undefined);
      if (canonical === undefined || !isWithin(root, canonical)) continue;
      await walk(canonical, remainingDepth - 1, root, visit);
    }
  }
}

function isWithin(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}
