import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const generatedPaths = [
  "system-status",
  "readiness-status",
  "breeding-job",
  "pal-list-item",
  "game-catalog",
  "breeding-data",
  "breeding-engine",
  "canonical-snapshot",
  "inventory-sync",
  "phase5-web",
  "phase6-breeder",
  "phase7-execution-plans",
].map((contract) => resolve(packageRoot, `src/generated/${contract}.ts`));
generatedPaths.push(
  resolve(
    repositoryRoot,
    "apps/agent/src/pal_hatch_helper/generated/contracts.py",
  ),
  resolve(
    repositoryRoot,
    "apps/agent/src/pal_hatch_helper/generated/__init__.py",
  ),
);

const before = new Map(
  await Promise.all(
    generatedPaths.map(async (path) => [path, await readGeneratedFile(path)]),
  ),
);

await import("./generate.mjs");

const changedPaths = [];
for (const path of generatedPaths) {
  if (before.get(path) !== (await readGeneratedFile(path))) {
    changedPaths.push(path);
  }
}

if (changedPaths.length > 0) {
  throw new Error(
    `Generated contracts were stale:\n${changedPaths.map((path) => `- ${path}`).join("\n")}`,
  );
}

console.log("Generated contract drift check passed.");

async function readGeneratedFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
