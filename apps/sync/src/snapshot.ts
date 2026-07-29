import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  opendir,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

export interface ReadOnlySnapshot {
  path: string;
  hash: string;
  sourceModifiedAt: string;
  cleanup(): Promise<void>;
}

interface SnapshotOptions {
  delayMilliseconds?: number;
  afterFirstStat?: () => Promise<void>;
}

interface SourceFile {
  relative: string;
  absolute: string;
}

export async function createReadOnlySnapshot(
  sourceDirectory: string,
  options: SnapshotOptions = {},
): Promise<ReadOnlySnapshot> {
  const files = await sourceFiles(sourceDirectory);
  const first = await statFiles(files);
  await options.afterFirstStat?.();
  await delay(options.delayMilliseconds ?? 2000);
  const second = await statFiles(files);
  if (!sameStats(first, second)) throw new Error("SAVE_SOURCE_UNSTABLE");

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "palbeacon-sync-snapshot-"),
  );
  let complete = false;
  try {
    for (const file of files) {
      const destination = join(temporaryRoot, file.relative);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await copyFile(file.absolute, destination, constants.COPYFILE_FICLONE);
      await chmod(destination, 0o444);
    }
    const third = await statFiles(files);
    if (!sameStats(second, third)) throw new Error("SAVE_SOURCE_UNSTABLE");
    const hash = await hashFiles(
      temporaryRoot,
      files.map((file) => file.relative),
    );
    const latestMilliseconds = Math.max(
      ...second.map((entry) => entry.mtimeMs),
    );
    await chmod(join(temporaryRoot, "Players"), 0o555).catch(() => undefined);
    await chmod(temporaryRoot, 0o555);
    complete = true;
    return {
      path: temporaryRoot,
      hash,
      sourceModifiedAt: new Date(latestMilliseconds).toISOString(),
      cleanup: async () => {
        await makeDirectoryTreeRemovable(temporaryRoot);
        await rm(temporaryRoot, { recursive: true, force: true });
      },
    };
  } finally {
    if (!complete) {
      await makeDirectoryTreeRemovable(temporaryRoot);
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

async function makeDirectoryTreeRemovable(root: string): Promise<void> {
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) return;

  await chmod(root, 0o700);
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => makeDirectoryTreeRemovable(join(root, entry.name))),
  );
}

async function sourceFiles(sourceDirectory: string): Promise<SourceFile[]> {
  const rootInfo = await lstat(sourceDirectory).catch(() => undefined);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error("SAVE_DIRECTORY_INVALID");
  const level = join(sourceDirectory, "Level.sav");
  await assertRegularFile(level);
  const files: SourceFile[] = [{ relative: "Level.sav", absolute: level }];
  const playersDirectory = join(sourceDirectory, "Players");
  const playersInfo = await lstat(playersDirectory).catch(() => undefined);
  if (playersInfo?.isDirectory() && !playersInfo.isSymbolicLink()) {
    const handle = await opendir(playersDirectory);
    for await (const entry of handle) {
      if (!entry.isFile() || !entry.name.endsWith(".sav")) continue;
      const absolute = join(playersDirectory, entry.name);
      await assertRegularFile(absolute);
      files.push({ relative: join("Players", basename(entry.name)), absolute });
    }
  }
  return files.sort((left, right) =>
    left.relative.localeCompare(right.relative),
  );
}

async function assertRegularFile(path: string): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink())
    throw new Error("SAVE_FILE_INVALID");
}

async function statFiles(files: SourceFile[]) {
  return Promise.all(
    files.map(async (file) => {
      const info = await stat(file.absolute);
      return {
        relative: file.relative,
        size: info.size,
        mtimeMs: info.mtimeMs,
        ino: info.ino,
      };
    }),
  );
}

function sameStats(
  left: Awaited<ReturnType<typeof statFiles>>,
  right: Awaited<ReturnType<typeof statFiles>>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function hashFiles(
  root: string,
  relativePaths: string[],
): Promise<string> {
  const hash = createHash("sha256");
  for (const relativePath of relativePaths) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
