import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function stageParserBinary(options) {
  const info = await lstat(options.source);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("PARSER_BINARY_INVALID");
  if (sha256(await readFile(options.source)) !== options.sha256)
    throw new Error("PARSER_BINARY_HASH_MISMATCH");

  await mkdir(dirname(options.destination), { recursive: true });
  await copyFile(options.source, options.destination);
  if (options.platform === "linux-x64") await chmod(options.destination, 0o755);
  if (sha256(await readFile(options.destination)) !== options.sha256)
    throw new Error("PARSER_BINARY_HASH_MISMATCH");

  if (options.platform === "linux-x64") {
    const reportedVersion = (
      await execFileAsync(options.destination, ["--version"], {
        encoding: "utf8",
      })
    ).stdout.trim();
    if (reportedVersion !== options.version)
      throw new Error("PARSER_VERSION_MISMATCH");
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
