import { access, readFile } from "node:fs/promises";

const requiredPaths = [
  "AGENTS.md",
  "apps/web/app/[locale]/page.tsx",
  "apps/web/app/api/health/route.ts",
  "apps/web/i18n/routing.ts",
  "apps/web/messages/en.json",
  "apps/web/messages/zh.json",
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
  "docs/decisions/0005-phase5-parallel-delivery-boundary.md",
  "docs/decisions/0006-localized-app-router-and-game-content.md",
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

const phase5BoundaryDecision = await readFile(
  "docs/decisions/0005-phase5-parallel-delivery-boundary.md",
  "utf8",
).catch(() => "");
const requiredPhase5BoundaryStatements = [
  "状态：已批准",
  "Phase 1",
  "Phase 3",
  "Phase 6",
  "生产发布",
];
const missingBoundaryStatements = requiredPhase5BoundaryStatements.filter(
  (statement) => !phase5BoundaryDecision.includes(statement),
);
if (missingBoundaryStatements.length > 0) {
  console.error(
    `Phase 5 parallel-delivery decision is incomplete:\n${missingBoundaryStatements.join("\n")}`,
  );
  process.exitCode = 1;
}

const phase5Migration = await readFile(
  "supabase/migrations/20260715020000_phase5_web_foundation.sql",
  "utf8",
);
if (
  /create\s+index(?!\s+concurrently)[\s\S]{0,120}pal_snapshot_items_page_order_idx/i.test(
    phase5Migration,
  )
) {
  console.error(
    "Phase 5 must not add a blocking inventory page index without a separately approved concurrent migration.",
  );
  process.exitCode = 1;
}

const phase5StatusDocuments = [
  [
    "docs/superpowers/specs/2026-07-13-palworld-breeding-system-design.md",
    "Phase 5 implementation=completed、automated_gates=passed",
  ],
  [
    "docs/superpowers/plans/2026-07-13-palworld-breeding-system-implementation.md",
    "Phase 5 implementation=completed、automated_gates=passed",
  ],
  [
    "docs/project-status.md",
    "| Phase 5 | `implementation`       | `completed`",
  ],
  ["docs/project-status.md", "| Phase 5 | `automated_gates`      | `passed`"],
];
for (const [path, expectedStatus] of phase5StatusDocuments) {
  const contents = await readFile(path, "utf8");
  if (!contents.includes(expectedStatus)) {
    console.error(`Phase 5 completion status is inconsistent: ${path}`);
    process.exitCode = 1;
  }
}

const phase4StatusDocuments = [
  [
    "docs/superpowers/specs/2026-07-13-palworld-breeding-system-design.md",
    "Phase 4 implementation=completed、automated_gates=passed、real_data_acceptance=completed、local_test_publish=completed、production_publish=not_started",
  ],
  [
    "docs/superpowers/plans/2026-07-13-palworld-breeding-system-implementation.md",
    "Phase 4 implementation=completed、automated_gates=passed、real_data_acceptance=completed、local_test_publish=completed、production_publish=not_started",
  ],
  [
    "docs/project-status.md",
    "| Phase 4 | `real_data_acceptance` | `completed`",
  ],
  [
    "docs/project-status.md",
    "| Phase 4 | `local_test_publish`   | `completed`",
  ],
  [
    "docs/project-status.md",
    "| Phase 4 | `production_publish`   | `not_started`",
  ],
];
for (const [path, expectedStatus] of phase4StatusDocuments) {
  const contents = await readFile(path, "utf8");
  if (!contents.includes(expectedStatus)) {
    console.error(`Phase 4 completion status is inconsistent: ${path}`);
    process.exitCode = 1;
  }
}
