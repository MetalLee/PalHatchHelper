import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { compileFromFile } from "json-schema-to-typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "src/generated");
const contracts = ["system-status", "readiness-status"];

await mkdir(outputDirectory, { recursive: true });
for (const contract of contracts) {
  const schemaPath = resolve(packageRoot, `schema/${contract}.schema.json`);
  const outputPath = resolve(outputDirectory, `${contract}.ts`);
  const source = await compileFromFile(schemaPath, {
    bannerComment: `/* Generated from ${contract}.schema.json. Do not edit directly. */`,
    style: { singleQuote: false },
  });

  await writeFile(outputPath, source, "utf8");
  console.log(`Generated ${outputPath}`);
}
