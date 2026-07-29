import { createHash } from "node:crypto";
import { lstat, opendir, readFile, realpath } from "node:fs/promises";
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

export async function discoverOodleLibrary(
  worldSaveDirectory: string,
  explicitPath?: string,
): Promise<{ path: string; sha256: string }> {
  const candidates: string[] = [];
  if (explicitPath && explicitPath.length > 0)
    candidates.push(resolve(explicitPath));
  const environmentPath = process.env.PALHATCH_OODLE_LIB;
  if (environmentPath && environmentPath.length > 0)
    candidates.push(resolve(environmentPath));

  let ancestor = resolve(worldSaveDirectory);
  for (let index = 0; index < 8; index += 1) {
    candidates.push(
      join(ancestor, "Pal", "Binaries", "Linux", "liboo2corelinux64.so.9"),
    );
    candidates.push(
      join(ancestor, "Binaries", "Linux", "liboo2corelinux64.so.9"),
    );
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const info = await lstat(candidate);
      if (!info.isFile() || info.isSymbolicLink()) continue;
      const path = await realpath(candidate);
      return {
        path,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      };
    } catch {
      // Continue through the fixed local candidates. Nothing is downloaded.
    }
  }
  throw new Error("OODLE_LIBRARY_NOT_FOUND");
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
