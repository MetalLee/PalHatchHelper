import { lstat, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { findWorldSave } from "./discovery.js";
import { buildUploadArtifacts } from "./pipeline.js";
import { createReadOnlySnapshot } from "./snapshot.js";
import { worldUidFromSaveDirectory } from "./world-id.js";

export interface InspectOptions {
  saveDirectory: string;
  canonicalOutput: string;
  payloadOutput: string;
}

export async function inspectSave(options: InspectOptions): Promise<void> {
  const canonicalOutput = resolve(options.canonicalOutput);
  const payloadOutput = resolve(options.payloadOutput);
  if (canonicalOutput === payloadOutput)
    throw new Error("INSPECT_OUTPUT_PATH_INVALID");
  await assertOutputAbsent(canonicalOutput);
  await assertOutputAbsent(payloadOutput);

  const saveDirectory = await findWorldSave(options.saveDirectory);
  const worldUid = worldUidFromSaveDirectory(saveDirectory);
  const snapshot = await createReadOnlySnapshot(saveDirectory);
  let canonicalCreated = false;
  try {
    const artifacts = await buildUploadArtifacts(snapshot, { worldUid });
    try {
      await writeFile(canonicalOutput, deterministicJson(artifacts.canonical), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      throw normalizeOutputError(error);
    }
    canonicalCreated = true;
    try {
      await writeFile(payloadOutput, deterministicJson(artifacts.payload), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (canonicalCreated) await rm(canonicalOutput, { force: true });
      throw normalizeOutputError(error);
    }
  } finally {
    await snapshot.cleanup();
  }
}

async function assertOutputAbsent(path: string): Promise<void> {
  const info = await lstat(path).catch((error: unknown) => {
    if (isFileSystemError(error, "ENOENT")) return undefined;
    throw error;
  });
  if (info !== undefined) throw new Error("INSPECT_OUTPUT_EXISTS");
}

function deterministicJson(value: unknown): string {
  return `${JSON.stringify(sortObjectKeys(value), null, 2)}\n`;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortObjectKeys(child)]),
  );
}

function normalizeOutputError(error: unknown): unknown {
  return isFileSystemError(error, "EEXIST")
    ? new Error("INSPECT_OUTPUT_EXISTS")
    : error;
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
