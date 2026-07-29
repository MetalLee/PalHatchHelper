import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(packageRoot, "..", "..");
const outputRoot = join(packageRoot, "dist");
const parserSource = join(repositoryRoot, "parser", "palworld-save-parser");
const parserHash =
  "94c7b04246530dfb31291719d33d98fc22b9914107e5d5ad4aeb61eed2aaa8b5";

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
const actualHash = createHash("sha256")
  .update(await readFile(parserSource))
  .digest("hex");
if (actualHash !== parserHash) throw new Error("PARSER_BINARY_HASH_MISMATCH");
const parserOutput = join(outputRoot, "bin", "palworld-save-parser");
await copyFile(parserSource, parserOutput);
await chmod(parserOutput, 0o755);
await chmod(join(outputRoot, "cli.js"), 0o755);
await writeFile(
  join(outputRoot, "bin", "parser-manifest.json"),
  `${JSON.stringify({ platform: "linux-x64", version: "1.1.0", sha256: parserHash }, null, 2)}\n`,
  "utf8",
);
await copyFile(
  join(repositoryRoot, "parser", "THIRD_PARTY_NOTICES.md"),
  join(outputRoot, "THIRD_PARTY_NOTICES.md"),
);
await copyFile(
  join(repositoryRoot, "parser", "LICENSES", "Apache-2.0.txt"),
  join(outputRoot, "LICENSES", "Apache-2.0.txt"),
);
await copyFile(
  join(
    repositoryRoot,
    "parser",
    "vendor",
    "golang.org",
    "x",
    "text",
    "LICENSE",
  ),
  join(outputRoot, "LICENSES", "golang-x-text-BSD-3-Clause.txt"),
);
