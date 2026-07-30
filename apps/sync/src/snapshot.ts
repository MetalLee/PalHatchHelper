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
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix } from "node:path";

import { runtimePlatform, type RuntimePlatform } from "./platform.js";

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
  logicalPath: string;
  absolute: string;
}

const DEFAULT_MAX_SAVE_BYTES = 512 * 1024 * 1024;
const HARD_MAX_SAVE_BYTES = 2 * 1024 * 1024 * 1024;
const SNAPSHOT_HASH_DOMAIN = "palbeacon-sync-snapshot-v1\0";

export async function createReadOnlySnapshot(
  sourceDirectory: string,
  options: SnapshotOptions = {},
): Promise<ReadOnlySnapshot> {
  const maximumBytes = maximumSaveBytes();
  const files = await sourceFiles(sourceDirectory, maximumBytes);
  const first = await statFiles(files, maximumBytes);
  await options.afterFirstStat?.();
  await delay(options.delayMilliseconds ?? 2000);
  const second = await statFiles(files, maximumBytes);
  if (!sameStats(first, second)) throw new Error("SAVE_SOURCE_UNSTABLE");

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "palbeacon-sync-snapshot-"),
  );
  let complete = false;
  try {
    const stableMetadata = new Map(
      second.map((entry) => [entry.logicalPath, entry]),
    );
    for (const file of files) {
      const destination = physicalPath(temporaryRoot, file.logicalPath);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await copyFile(file.absolute, destination, constants.COPYFILE_FICLONE);
      const modified = new Date(stableMetadata.get(file.logicalPath)!.mtimeMs);
      await utimes(destination, modified, modified);
      await makeSnapshotReadOnly(destination);
    }
    const third = await statFiles(files, maximumBytes);
    if (!sameStats(second, third)) throw new Error("SAVE_SOURCE_UNSTABLE");
    const hash = await hashFiles(
      temporaryRoot,
      files.map((file) => file.logicalPath),
    );
    const latestMilliseconds = Math.max(
      ...second.map((entry) => entry.mtimeMs),
    );
    await makeSnapshotReadOnly(join(temporaryRoot, "Players"), true).catch(
      () => undefined,
    );
    await makeSnapshotReadOnly(temporaryRoot, true);
    complete = true;
    return {
      path: temporaryRoot,
      hash,
      sourceModifiedAt: new Date(latestMilliseconds).toISOString(),
      cleanup: async () => {
        await makeSnapshotRemovable(temporaryRoot);
        await removeSnapshotTree(temporaryRoot);
      },
    };
  } finally {
    if (!complete) {
      await makeSnapshotRemovable(temporaryRoot);
      await removeSnapshotTree(temporaryRoot);
    }
  }
}

export async function makeSnapshotReadOnly(
  path: string,
  directory = false,
  platform: RuntimePlatform = runtimePlatform(),
): Promise<void> {
  if (platform === "linux-x64") await chmod(path, directory ? 0o555 : 0o444);
}

export async function makeSnapshotRemovable(
  root: string,
  platform: RuntimePlatform = runtimePlatform(),
): Promise<void> {
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) return;

  if (platform === "linux-x64") await chmod(root, 0o700);
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => makeSnapshotRemovable(join(root, entry.name), platform)),
  );
}

async function sourceFiles(
  sourceDirectory: string,
  maximumBytes: number,
): Promise<SourceFile[]> {
  const rootInfo = await lstat(sourceDirectory).catch(() => undefined);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error("SAVE_DIRECTORY_INVALID");
  const level = join(sourceDirectory, "Level.sav");
  await assertRegularFile(level, maximumBytes);
  const files: SourceFile[] = [{ logicalPath: "Level.sav", absolute: level }];
  const playersDirectory = join(sourceDirectory, "Players");
  const playersInfo = await lstat(playersDirectory).catch(() => undefined);
  if (playersInfo?.isDirectory() && !playersInfo.isSymbolicLink()) {
    const handle = await opendir(playersDirectory);
    for await (const entry of handle) {
      if (!entry.isFile() || !entry.name.endsWith(".sav")) continue;
      const absolute = join(playersDirectory, entry.name);
      await assertRegularFile(absolute, maximumBytes);
      files.push({
        logicalPath: posix.join("Players", basename(entry.name)),
        absolute,
      });
    }
  }
  return files.sort((left, right) =>
    compareStrings(left.logicalPath, right.logicalPath),
  );
}

async function assertRegularFile(
  path: string,
  maximumBytes: number,
): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink())
    throw new Error("SAVE_FILE_INVALID");
  if (info.size > maximumBytes) throw new Error("SAVE_FILE_TOO_LARGE");
}

async function statFiles(files: SourceFile[], maximumBytes: number) {
  return Promise.all(
    files.map(async (file) => {
      const info = await lstat(file.absolute);
      if (!info.isFile() || info.isSymbolicLink())
        throw new Error("SAVE_FILE_INVALID");
      if (info.size > maximumBytes) throw new Error("SAVE_FILE_TOO_LARGE");
      return {
        logicalPath: file.logicalPath,
        size: info.size,
        mtimeMs: info.mtimeMs,
        ino: info.ino,
      };
    }),
  );
}

function maximumSaveBytes(): number {
  const configured = process.env.PALHATCH_SAV_MAX_BYTES;
  if (configured === undefined || configured.length === 0)
    return DEFAULT_MAX_SAVE_BYTES;
  if (!/^\d+$/.test(configured)) throw new Error("SAVE_SIZE_LIMIT_INVALID");
  const parsed = Number(configured);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    parsed > HARD_MAX_SAVE_BYTES
  ) {
    throw new Error("SAVE_SIZE_LIMIT_INVALID");
  }
  return parsed;
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
  hash.update(SNAPSHOT_HASH_DOMAIN);
  for (const logicalPath of relativePaths) {
    hash.update(logicalPath);
    hash.update("\0");
    hash.update(await readFile(physicalPath(root, logicalPath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function physicalPath(root: string, logicalPath: string): string {
  return join(root, ...logicalPath.split("/"));
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function removeSnapshotTree(root: string): Promise<void> {
  try {
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  } catch {
    throw new Error("SNAPSHOT_CLEANUP_FAILED");
  }
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
