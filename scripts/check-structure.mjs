import { access } from "node:fs/promises";

const requiredPaths = [
  "AGENTS.md",
  "apps/web/app/page.tsx",
  "apps/web/app/api/health/route.ts",
  "apps/agent/src/pal_hatch_helper/main.py",
  "packages/contracts/schema/system-status.schema.json",
  "packages/pal-catalog/README.md",
  "packages/ui/src/status-badge.tsx",
  "supabase/config.toml",
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
