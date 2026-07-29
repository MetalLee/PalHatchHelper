import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  lstat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(packageRoot, "..", "..");
const outputRoot = join(packageRoot, "dist");
const parserRoot = join(repositoryRoot, "parser");
const parserSource = join(parserRoot, "palworld-save-parser");
const releaseBuild = process.argv.includes("--release");
const parserVersion = (await readFile(join(parserRoot, "VERSION"), "utf8"))
  .trim()
  .replace(/\r/g, "");
if (!/^\d+\.\d+\.\d+$/.test(parserVersion))
  throw new Error("PARSER_VERSION_INVALID");

const parserInfo = await lstat(parserSource);
if (
  !parserInfo.isFile() ||
  parserInfo.isSymbolicLink() ||
  (parserInfo.mode & 0o111) === 0
)
  throw new Error("PARSER_BINARY_INVALID");
const { stdout: reportedVersion } = await execFileAsync(
  parserSource,
  ["--version"],
  { encoding: "utf8" },
);
if (reportedVersion.trim() !== parserVersion)
  throw new Error("PARSER_VERSION_MISMATCH");

const parserHash = sha256(await readFile(parserSource));
const { stdout: sourceCommitOutput } = await execFileAsync(
  "git",
  ["rev-parse", "HEAD"],
  { cwd: repositoryRoot, encoding: "utf8" },
);
const sourceCommit = sourceCommitOutput.trim();
if (!/^[0-9a-f]{40}$/.test(sourceCommit))
  throw new Error("PARSER_SOURCE_COMMIT_INVALID");
const { stdout: parserStatusOutput } = await execFileAsync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all", "--", "parser"],
  { cwd: repositoryRoot, encoding: "utf8" },
);
const sourceTreeClean =
  parserStatusOutput.split("\n").filter(Boolean).length === 0;
if (releaseBuild && !sourceTreeClean)
  throw new Error("PARSER_SOURCE_TREE_DIRTY");

const upstreamNotice = await readFile(
  join(parserRoot, "third_party", "palooz", "UPSTREAM.md"),
  "utf8",
);
const upstreamCommit = /Pinned commit: `([0-9a-f]{40})`/.exec(
  upstreamNotice,
)?.[1];
if (upstreamCommit === undefined)
  throw new Error("PALOOZ_UPSTREAM_COMMIT_INVALID");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "bin"), { recursive: true });
await mkdir(join(outputRoot, "LICENSES"), { recursive: true });
await build({
  entryPoints: [join(packageRoot, "src", "cli.ts")],
  outfile: join(outputRoot, "cli.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: true,
});

const parserOutput = join(outputRoot, "bin", "palworld-save-parser");
await copyFile(parserSource, parserOutput);
await chmod(parserOutput, 0o755);
await chmod(join(outputRoot, "cli.js"), 0o755);
if (sha256(await readFile(parserOutput)) !== parserHash)
  throw new Error("PARSER_BINARY_HASH_MISMATCH");

const manifest = {
  schema_version: 1,
  binary_name: "palworld-save-parser",
  platform: "linux-x64",
  version: parserVersion,
  sha256: parserHash,
  license: "GPL-3.0-or-later",
  source_repository: "https://github.com/MetalLee/PalHatchHelper",
  source_commit: sourceCommit,
  source_subdirectory: "parser",
  source_tree_clean: sourceTreeClean,
  upstream_repository: "https://github.com/deafdudecomputers/PalworldSaveTools",
  upstream_commit: upstreamCommit,
};
await writeFile(
  join(outputRoot, "bin", "parser-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

await Promise.all([
  copyFile(
    join(parserRoot, "THIRD_PARTY_NOTICES.md"),
    join(outputRoot, "THIRD_PARTY_NOTICES.md"),
  ),
  copyFile(
    join(parserRoot, "LICENSES", "GPL-3.0-or-later.txt"),
    join(outputRoot, "LICENSES", "GPL-3.0-or-later.txt"),
  ),
  copyFile(
    join(parserRoot, "LICENSES", "Apache-2.0.txt"),
    join(outputRoot, "LICENSES", "Apache-2.0.txt"),
  ),
  copyFile(
    join(packageRoot, "LICENSES", "MIT.txt"),
    join(outputRoot, "LICENSES", "MIT.txt"),
  ),
  copyFile(
    join(parserRoot, "LICENSES", "SIMDe-MIT.txt"),
    join(outputRoot, "LICENSES", "SIMDe-MIT.txt"),
  ),
  copyFile(
    join(parserRoot, "LICENSES", "CC0-1.0.txt"),
    join(outputRoot, "LICENSES", "CC0-1.0.txt"),
  ),
  copyFile(
    join(parserRoot, "vendor", "golang.org", "x", "text", "LICENSE"),
    join(outputRoot, "LICENSES", "golang-x-text-BSD-3-Clause.txt"),
  ),
]);
await writeFile(
  join(outputRoot, "PARSER_SOURCE.md"),
  parserSourceNotice(manifest),
  "utf8",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parserSourceNotice(metadata) {
  return `# Source for the bundled Parser

This npm package contains the separate \`palworld-save-parser\` executable
version \`${metadata.version}\` for Linux x64. Its SHA-256 is
\`${metadata.sha256}\` and it is distributed under GPL-3.0-or-later.

The corresponding source is the \`parser/\` directory at commit
\`${metadata.source_commit}\` in:

<${metadata.source_repository}>

The embedded palooz/ooz decoder is pinned to PalworldSaveTools commit
\`${metadata.upstream_commit}\`. Its provenance, vendored-file hashes, local
decode-only patch, and update procedure are recorded in
\`parser/third_party/palooz/UPSTREAM.md\` at the source commit above.

Build the executable with \`parser/scripts/build-linux-amd64.sh\` in the
documented Go 1.26.5 Linux environment. The TypeScript CLI and Parser are
separate programs; they communicate only through a child process and JSON
files.

Source tree clean when packaged: \`${String(metadata.source_tree_clean)}\`.
`;
}
