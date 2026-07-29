# 验证手册

## 全量检查

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` 依次检查 Prettier/Ruff 格式、ESLint/Ruff、TypeScript/mypy、Vitest/pytest、Next.js 构建、目录结构和常见秘密模式。

## Phase 1 数据库与契约

Docker 和 Supabase CLI 可用时执行：

```bash
supabase start
supabase db reset
supabase db lint
supabase test db
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' pnpm database:test:concurrency
pnpm contracts:generate
supabase gen types typescript --local --schema public > packages/contracts/src/database.types.ts
pnpm exec prettier --write packages/contracts/src/database.types.ts
pnpm typecheck
pnpm test
```

数据库类型也可通过只接受回环地址的 `DATABASE_URL=... pnpm database:types` 生成。生成文件必须纳入 diff 审查，不能手工复制两套 DTO。

## Agent 明细

```bash
cd apps/agent
uv sync --frozen --dev
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest
```

## 自包含 Parser 与 Sync 候选包

Parser 标准构建需要 Linux amd64、Go 1.26.5、GCC/G++ 和 CGO：

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace/parser golang:1.26.5-bookworm \
  sh -c 'go test -mod=vendor ./... && go vet ./... && ./scripts/build-linux-amd64.sh'
file parser/palworld-save-parser
ldd parser/palworld-save-parser
sha256sum parser/palworld-save-parser
```

重复构建到两个临时输出并比较 SHA-256。`ldd` 只能显示 glibc/系统加载器；Parser 必须无需额外环境即可解析 `data/parser-fixtures/plm-minimal/Level.sav`。

Sync 候选包验证不会发布 npm：

```bash
pnpm --filter palbeacon-sync lint
pnpm --filter palbeacon-sync typecheck
pnpm --filter palbeacon-sync test
pnpm --filter palbeacon-sync build
cd apps/sync
npm pack --dry-run --ignore-scripts
tarball="$(npm pack --silent)"
node scripts/verify-package.mjs "$tarball"
sha256sum "$tarball"
```

验证脚本会展开并干净安装 tgz，执行 `npx --no-install palbeacon-sync --help`/`--version`、核对可执行权限和 manifest 哈希、检查 `ldd`，并用真正的合成 Mermaid PlM fixture 烟测包内 Parser。tarball 不得含 Python runtime、专有解压文件、真实存档或未声明原生扩展。

## Compose 与镜像

Docker 可用时执行：

```bash
docker compose --env-file infra/agent/.env.example -f infra/agent/docker-compose.yml --profile save-worker config
docker build -f apps/agent/Dockerfile -t palhatch-agent:phase3 apps/agent
```

该命令只构建本地镜像，不启动 Compose、不连接现有 Docker 网络、不读取 `/opt/palworld`。

## 交付前差异

```bash
git status --short
git diff --check
git diff --stat
pnpm scan:secrets
```

工具缺失时记录版本探测输出、受影响命令和已执行替代验证；不得把未运行项目标记为通过。
