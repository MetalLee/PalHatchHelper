import { spawn } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCanonicalSnapshot,
  type CanonicalSnapshot,
} from "@palhatch/contracts";

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_ERROR_BYTES = 32 * 1024;

interface ParserOptions {
  binary?: string;
  timeoutMilliseconds?: number;
}

export async function parseSnapshot(
  snapshotPath: string,
  oodle: { path: string; sha256: string },
  options: ParserOptions = {},
): Promise<CanonicalSnapshot> {
  const snapshotInfo = await lstat(snapshotPath);
  if (!snapshotInfo.isDirectory() || snapshotInfo.isSymbolicLink())
    throw new Error("PARSER_INPUT_INVALID");
  const binary =
    options.binary ?? process.env.PALBEACON_PARSER_BIN ?? bundledParserPath();
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "palbeacon-sync-parser-"),
  );
  const outputPath = join(outputDirectory, "canonical.json");
  try {
    await executeParser(
      binary,
      snapshotPath,
      outputPath,
      oodle,
      options.timeoutMilliseconds ?? 180_000,
    );
    const outputInfo = await stat(outputPath);
    if (outputInfo.size > MAX_OUTPUT_BYTES)
      throw new Error("PARSER_OUTPUT_TOO_LARGE");
    return parseCanonicalSnapshot(
      JSON.parse(await readFile(outputPath, "utf8")),
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

function bundledParserPath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "bin",
    "palworld-save-parser",
  );
}

async function executeParser(
  binary: string,
  snapshotPath: string,
  outputPath: string,
  oodle: { path: string; sha256: string },
  timeoutMilliseconds: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      ["--snapshot", snapshotPath, "--output", outputPath],
      {
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          ...process.env,
          PALHATCH_OODLE_LIB: oodle.path,
          PALHATCH_OODLE_SHA256: oodle.sha256,
        },
      },
    );
    let errorOutput = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (errorOutput.length < MAX_ERROR_BYTES)
        errorOutput += chunk.slice(0, MAX_ERROR_BYTES - errorOutput.length);
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    }, timeoutMilliseconds);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error("PARSER_TIMEOUT"));
      else if (code !== 0) reject(new Error(parserErrorCode(errorOutput)));
      else resolve();
    });
  });
}

function parserErrorCode(stderr: string): string {
  return (
    /PALHATCH_PARSER_ERROR code=([A-Z0-9_]+)/.exec(stderr)?.[1] ??
    "PARSER_FAILED"
  );
}
