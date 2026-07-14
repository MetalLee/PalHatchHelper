import { access, readFile } from "node:fs/promises";

const requiredPaths = [
  "AGENTS.md",
  "apps/web/app/page.tsx",
  "apps/web/app/api/health/route.ts",
  "apps/agent/src/pal_hatch_helper/main.py",
  "packages/contracts/schema/system-status.schema.json",
  "packages/contracts/schema/breeding-job.schema.json",
  "packages/contracts/schema/pal-list-item.schema.json",
  "packages/contracts/src/database.types.ts",
  "packages/pal-catalog/README.md",
  "packages/ui/src/status-badge.tsx",
  "supabase/config.toml",
  "supabase/seed.sql",
  "supabase/tests/rls.sql",
  "supabase/tests/rpc.sql",
  "docs/architecture/database-and-rls.md",
  "docs/operations/supabase-local-development.md",
  "docs/operations/database-migrations.md",
  "infra/agent/docker-compose.yml",
  ".github/workflows/ci.yml",
];

const missing = [];
for (const path of requiredPaths) {
  try {
    await access(path);
  } catch {
    missing.push(path);
  }
}

if (missing.length > 0) {
  console.error(`Missing required paths:\n${missing.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Structure check passed (${requiredPaths.length} paths).`);
}

const staleDocumentation = [
  ["README.md", "当前仓库已完成 Phase 2.5"],
  ["README.md", "Save Worker 只保留 Phase 3 入口"],
  ["apps/agent/README.md", "save-worker` 只保留 Phase 3 命令边界"],
];
const staleMatches = [];
for (const [path, phrase] of staleDocumentation) {
  if ((await readFile(path, "utf8")).includes(phrase)) {
    staleMatches.push(`${path}: ${phrase}`);
  }
}
if (staleMatches.length > 0) {
  console.error(`Stale documentation detected:\n${staleMatches.join("\n")}`);
  process.exitCode = 1;
}
