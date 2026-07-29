import { lstat, opendir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export async function findWorldSave(saveDirectory: string): Promise<string> {
  const root = resolve(saveDirectory);
  await assertDirectory(root, "SAVE_DIRECTORY_INVALID");
  const matches: string[] = [];
  await walk(root, 4, async (path, name) => {
    if (name === "Level.sav") matches.push(dirname(path));
  });
  if (matches.length === 0) throw new Error("WORLD_SAVE_NOT_FOUND");
  if (matches.length > 1) throw new Error("MULTIPLE_WORLD_SAVES_FOUND");
  return realpath(matches[0]!);
}

async function assertDirectory(path: string, code: string): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(code);
}

async function walk(
  directory: string,
  remainingDepth: number,
  visit: (path: string, name: string) => Promise<void>,
): Promise<void> {
  const handle = await opendir(directory);
  for await (const entry of handle) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isFile()) await visit(path, entry.name);
    else if (entry.isDirectory() && remainingDepth > 0) {
      await walk(path, remainingDepth - 1, visit);
    }
  }
}
