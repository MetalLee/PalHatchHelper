import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(packageRoot, "..", "..");
const outputRoot = join(packageRoot, "dist");
const parserRoot = join(repositoryRoot, "parser");
const releaseBuild = process.argv.includes("--release");
const expectedParserVersion = (
  await readFile(join(parserRoot, "VERSION"), "utf8")
)
  .trim()
  .replace(/\r/g, "");
if (!/^\d+\.\d+\.\d+$/.test(expectedParserVersion))
  throw new Error("PARSER_VERSION_INVALID");
const expectedSourceCommit = (
  await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
).stdout.trim();
if (!/^[0-9a-f]{40}$/.test(expectedSourceCommit))
  throw new Error("PARSER_SOURCE_COMMIT_INVALID");
const parserStatus = (
  await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all", "--", "parser"],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
).stdout;
if (releaseBuild && parserStatus.split("\n").some(Boolean))
  throw new Error("PARSER_SOURCE_TREE_DIRTY");
const upstreamNotice = await readFile(
  join(parserRoot, "third_party", "palooz", "UPSTREAM.md"),
  "utf8",
);
const expectedUpstreamCommit = /Pinned commit: `([0-9a-f]{40})`/.exec(
  upstreamNotice,
)?.[1];
if (expectedUpstreamCommit === undefined)
  throw new Error("PALOOZ_UPSTREAM_COMMIT_INVALID");
const targets = [
  {
    platform: "linux-x64",
    binaryName: "palworld-save-parser",
    binary: resolve(
      process.env.PALBEACON_PARSER_LINUX_X64 ??
        join(parserRoot, "build", "linux-x64", "palworld-save-parser"),
    ),
    manifest: resolve(
      process.env.PALBEACON_PARSER_LINUX_X64_MANIFEST ??
        join(parserRoot, "build", "linux-x64", "parser-manifest.json"),
    ),
  },
  {
    platform: "win32-x64",
    binaryName: "palworld-save-parser.exe",
    binary: resolve(
      process.env.PALBEACON_PARSER_WIN32_X64 ??
        join(parserRoot, "build", "win32-x64", "palworld-save-parser.exe"),
    ),
    manifest: resolve(
      process.env.PALBEACON_PARSER_WIN32_X64_MANIFEST ??
        join(parserRoot, "build", "win32-x64", "parser-manifest.json"),
    ),
  },
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "LICENSES"), { recursive: true });
await build({
  entryPoints: [join(packageRoot, "src", "cli.ts")],
  outfile: join(outputRoot, "cli.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  banner: { js: "#!/usr/bin/env node" },
});
await chmod(join(outputRoot, "cli.js"), 0o755);

const artifactPresence = await Promise.all(
  targets.flatMap((target) => [exists(target.binary), exists(target.manifest)]),
);
const artifactsComplete = artifactPresence.every(Boolean);
if (releaseBuild && !artifactsComplete)
  throw new Error("PARSER_ARTIFACT_SET_INCOMPLETE");

let manifests = [];
if (artifactsComplete) {
  manifests = await Promise.all(targets.map(copyAndValidateTarget));
  assertSharedMetadata(manifests);
}

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
  parserSourceNotice(manifests),
  "utf8",
);

async function copyAndValidateTarget(target) {
  const info = await lstat(target.binary);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("PARSER_BINARY_INVALID");
  const manifest = JSON.parse(await readFile(target.manifest, "utf8"));
  validateManifest(manifest, target);
  const actualHash = sha256(await readFile(target.binary));
  if (actualHash !== manifest.sha256)
    throw new Error("PARSER_BINARY_HASH_MISMATCH");
  if (target.platform === "linux-x64") {
    const reportedVersion = (
      await execFileAsync(target.binary, ["--version"], { encoding: "utf8" })
    ).stdout.trim();
    if (reportedVersion !== manifest.version)
      throw new Error("PARSER_VERSION_MISMATCH");
  }
  const destination = join(outputRoot, "bin", target.platform);
  await mkdir(destination, { recursive: true });
  const binaryDestination = join(destination, target.binaryName);
  await copyFile(target.binary, binaryDestination);
  if (target.platform === "linux-x64") await chmod(binaryDestination, 0o755);
  await copyFile(target.manifest, join(destination, "parser-manifest.json"));
  if (sha256(await readFile(binaryDestination)) !== manifest.sha256)
    throw new Error("PARSER_BINARY_HASH_MISMATCH");
  return manifest;
}

function validateManifest(manifest, target) {
  if (
    manifest.schema_version !== 1 ||
    manifest.binary_name !== target.binaryName ||
    manifest.platform !== target.platform ||
    manifest.version !== expectedParserVersion ||
    !/^[0-9a-f]{64}$/.test(manifest.sha256) ||
    manifest.license !== "GPL-3.0-or-later" ||
    manifest.source_repository !==
      "https://github.com/MetalLee/PalHatchHelper" ||
    manifest.source_commit !== expectedSourceCommit ||
    manifest.source_subdirectory !== "parser" ||
    manifest.source_tree_clean !== true ||
    manifest.upstream_repository !==
      "https://github.com/deafdudecomputers/PalworldSaveTools" ||
    manifest.upstream_commit !== expectedUpstreamCommit
  ) {
    throw new Error("PARSER_MANIFEST_INVALID");
  }
}

function assertSharedMetadata(values) {
  const [first, second] = values;
  for (const field of [
    "version",
    "source_repository",
    "source_commit",
    "source_subdirectory",
    "source_tree_clean",
    "upstream_repository",
    "upstream_commit",
    "license",
  ]) {
    if (first?.[field] !== second?.[field])
      throw new Error(`PARSER_METADATA_MISMATCH:${field}`);
  }
}

async function exists(path) {
  return lstat(path)
    .then(() => true)
    .catch((error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parserSourceNotice(metadata) {
  if (metadata.length !== 2)
    return "# Source for the bundled Parser\n\nRelease artifacts were not assembled by this development build.\n";
  const linux = metadata.find((value) => value.platform === "linux-x64");
  const windows = metadata.find((value) => value.platform === "win32-x64");
  return `# Source for the bundled Parsers

This npm package contains separate Linux x64 and Windows x64
\`palworld-save-parser\` executables built from the same source commit and
distributed under GPL-3.0-or-later.

- Linux x64 version \`${linux.version}\`: \`${linux.sha256}\`
- Windows x64 version \`${windows.version}\`: \`${windows.sha256}\`

The corresponding source is the \`parser/\` directory at commit
\`${linux.source_commit}\` in:

<${linux.source_repository}>

The embedded palooz/ooz decoder is pinned to PalworldSaveTools commit
\`${linux.upstream_commit}\`. Its provenance, vendored-file hashes, local
decode-only patch, and update procedure are recorded in
\`parser/third_party/palooz/UPSTREAM.md\` at the source commit above.

Build the executables with \`parser/scripts/build-linux-amd64.sh\` and
\`parser/scripts/build-windows-amd64.sh\` in their documented fixed Go 1.26.5
environments. The TypeScript CLI and Parsers are separate programs; they
communicate only through a child process and JSON files.

Source tree clean when packaged: \`${String(linux.source_tree_clean)}\`.
`;
}
