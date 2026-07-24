# PalHatchHelper 生产部署手册

本文档描述 Phase 8 生产文件和下一轮 `MODE=DEPLOY_PRODUCTION` 的执行顺序。当前 `MODE=DEVELOP_ADMIN` 只生成并验证文件，不部署 Supabase、Vercel 或腾讯云 Agent。

## 永久安全边界

- 不修改或在 `/opt/palworld` 执行其 Compose，不停止、重启或升级 Palworld、mihomo。
- Palworld Compose 与源存档只读挂载；Agent 只把稳定副本写入自己的数据目录。
- Agent 健康接口只能通过宿主 `127.0.0.1:18765` 访问，不开放新公网端口。
- 浏览器只使用用户 JWT 和 Supabase anon key。Service Role 只进入 Agent 容器。
- 镜像必须为 `repository:git-short-sha@sha256:digest`，不得使用 `latest`。
- 只应用向前 migration；禁止 `supabase db reset --linked`。
- 任一核心验证失败就停止后续步骤并执行对应回滚。

## 文件与权限

将 [`infra/agent/.env.production.example`](../../infra/agent/.env.production.example) 复制到部署目录的 `.env.production`，通过受控渠道填值后执行 `chmod 0600`。不得在终端、日志、文档或 Git diff 打印值。部署工具只读取这一个文件。

必需配置包括 Supabase project ref/DB password/URL/anon/Service Role、Vercel project/org、正式 URL、Agent image repository/tag、Palworld 保存根、Parser bundle、世界 ID/UID 和 `BOOTSTRAP_ADMIN_EMAIL`。`PALWORLD_SAVE_ROOT`、`PALWORLD_COMPOSE_DIR`、`PARSER_BUNDLE_DIR` 在 Compose 中均为只读挂载。生产 Parser 身份固定为 `palhatch-plm-save-parser/1.1.0`，命令固定为 `["/app/parser/palworld-save-parser","--snapshot","{snapshot_path}","--output","{output_path}"]`；`PARSER_REQUIRED_FILES_JSON` 需同时声明要同步的普通玩家存档与对应 `_dps.sav` 次元仓库存档。不得继续配置旧 `palworld-save-tools` CLI。

Oodle 库不属于发布制品。经授权的运维人员从已确认且有权使用的来源人工取得
`liboo2corelinux64.so.9`，把来源产品/版本、取得日期和 SHA-256 记入受控变更单，然后放到
`${PARSER_BUNDLE_DIR}/lib/`。库和真实摘要都不提交 Git，库不进入 Agent 镜像，任何部署脚本
都不得联网获取它。将人工计算的摘要通过秘密配置渠道固定为 `PALHATCH_OODLE_SHA256`，库的
容器路径固定为 `PALHATCH_OODLE_LIB=/app/parser/lib/liboo2corelinux64.so.9`。

Vercel Production 只允许：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

任何 Service Role、数据库密码、AI Key 或 Agent Token 都不得带 `NEXT_PUBLIC_` 前缀。

## 部署前检查

1. 明确确认 MODE 是 `DEPLOY_PRODUCTION`；脚本不会自行切换 MODE。
2. `main` 已包含 Phase 8 PR，工作区干净，required CI 全绿。
3. `.env.production` 存在且权限为 `0600`；Supabase 使用文件中的明确 project ref；Vercel 已 link 且正式域名已配置。
4. 只读确认服务器仍为 Build `24181105`、`v1.0.1.100619`，appmanifest SHA-256 为 `98ef29829ebfde6d71528f5a83883e6bfda96fa77ce363e52630205353c1a189`。不一致时停止并报告 `TARGET_SERVER_VERSION_CHANGED`。
5. 记录 `/opt/palworld/docker-compose.yml` 和源存档的只读校验值，部署后比较；不写这些文件。
6. 对所有脚本先运行 `--dry-run`。脚本会检查仓库根、Git SHA、镜像 digest、磁盘、端口和 Compose 配置，并且不打印秘密。
7. 只读核对 Parser bundle：可执行文件存在且可执行、Oodle 文件是普通文件而非 symlink，
   并在不打印配置摘要的前提下比较人工 pin：

```bash
test -x "${PARSER_BUNDLE_DIR}/palworld-save-parser"
test -f "${PARSER_BUNDLE_DIR}/lib/liboo2corelinux64.so.9"
test ! -L "${PARSER_BUNDLE_DIR}/lib/liboo2corelinux64.so.9"
oodle_actual="$(sha256sum "${PARSER_BUNDLE_DIR}/lib/liboo2corelinux64.so.9" | cut -d ' ' -f1)"
test "${oodle_actual}" = "${PALHATCH_OODLE_SHA256}"
unset oodle_actual
```

## 备份

先执行：

```bash
ENV_FILE=/data/projects/PalHatchHelper/.env.production \
  infra/agent/scripts/backup-production.sh
```

备份保存到 `/data/projects/PalHatchHelper/data/backups/<UTC timestamp>/`，目录权限 `0700`。内容包括 Supabase public schema/数据 dump、migration list、世界 active catalog pointer、当前 Agent image、production Compose、权限受控的环境副本、Git SHA 和 Vercel deployment reference。任何项目失败停止并报告 `PRODUCTION_BACKUP_FAILED`。

首次部署且 schema dump 明确不存在 `public.worlds` 时，REST 的 404 会被记录为
`not_present_before_first_deploy` 空目录指针基线。只有这一已由 schema dump 证明的空库场景允许继续；
若 dump 中已有 `worlds` 或出现其他 HTTP 状态，备份仍失败并停止部署。仓库内的
`data/backups/` 始终被 Git 忽略，生产 dump 不得进入提交。

## Supabase migration

使用 `.env.production` 中的明确 ref：

```bash
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
```

dry-run 的待应用文件必须全部来自当前仓库。迁移后执行 RLS、admin/player 隔离、基础 RPC 和共享契约 smoke。失败时不继续 Web/Agent；根据失败点准备向前补偿 migration 或恢复刚创建的备份，不运行 linked reset。

## 游戏目录

先检查生产库是否已存在 content hash `872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3`。不存在时，只读使用忽略目录中的 `palworld-catalog-24181105-872e4a79af5b.tar.zst`，重新确认 package SHA-256 `8c36cb60e4f78c3e4c7681cde602539b4b85f160d26392ed0144f728c6f191a9`，再走现有 `validate → stage/finalize → publish` 流程。不得直接 SQL 插入事实。

发布后七类计数必须依次为 pals 288、passive skills 115、active skills 227、pal-active skills 2200、partner skills 287、breeding recipes 41617、localizations 6234。rollback 只切换 world pointer，历史版本和事实保持不可变。

## Agent image 与部署

镜像 tag 固定为 Git 短 SHA，推送后记录 registry digest，并把 `AGENT_IMAGE` 设为 `repository:tag@sha256:digest`。先验证配置，再执行部署：

```bash
docker compose \
  --env-file /data/projects/PalHatchHelper/.env.production \
  -f infra/agent/docker-compose.production.yml \
  config --quiet

ENV_FILE=/data/projects/PalHatchHelper/.env.production \
  infra/agent/scripts/deploy-production.sh
```

部署脚本只对 `api job-worker save-worker command-worker` 执行 `up -d --no-deps`。失败时使用 Agent 数据目录记录的 previous immutable image 自动切回并再次只操作四个 PalHatchHelper 服务。

[`verify-production.sh`](../../infra/agent/scripts/verify-production.sh) 检查四容器运行、UID 10001、cap drop、禁止提权、非 host network、资源/PID 限额、源存档只读挂载、API loopback PortBinding、健康响应和日志秘密泄漏。首次同步仍遵循只读复制、异常下降待审核、Parser 失败保留上一有效库存。

首次同步前先用 Agent 创建的脱敏/只读快照执行容器内 smoke；输入只读挂载，输出只写 Agent
runtime tmpfs，容器禁网并以 UID 10001 运行。确认输出小于 64 MiB、通过
`canonical-snapshot.schema.json`，且 smoke 前后 fixture SHA-256 一致。真实存档验收只能由
Agent 先创建只读副本，再对该副本运行相同命令；严禁让 Parser 参数指向
`PALWORLD_SAVE_ROOT`，也严禁修改 magic、重编码或写回 `.sav`。任何缺库、hash mismatch、
non-GVAS、world UID mismatch 或截断错误都必须保留上一份有效库存。

## Vercel

确认 project/org link 与自定义域名后，检查环境变量名称但不打印值；运行 production build，再执行 `vercel --prod`。记录 deployment ID/URL，并确认自定义域名指向新 deployment。`/api/health` 显示 `VERCEL_GIT_COMMIT_SHA`；管理员和玩家数据响应必须是 `private, no-store`。

## 首个管理员

迁移完成后执行一次幂等 bootstrap：

```bash
ENV_FILE=/data/projects/PalHatchHelper/.env.production \
  infra/agent/scripts/bootstrap-admin.sh
```

脚本只把 `BOOTSTRAP_ADMIN_EMAIL` 对应的现有 Supabase 用户设为 admin，不创建密码、不修改其他用户，并由 `bootstrap_first_admin` 写不可变审计。已经是 admin 时安全复用；已有其他 admin 时拒绝扩大权限。

## Smoke 与回滚

管理员 smoke：登录、概览、绑定、save/parser、目录、任务、非秘密设置、审计。玩家 smoke：库存、自己的共享开关、创建任务、Worker 完成、路线、采用计划和步骤推进。额外确认普通玩家被 `/admin` 拒绝、Service Role 不出现在 HTML/JS/响应/日志、Agent 无公网端口、Palworld Compose/源存档/mihomo 校验值不变、AI 不可用时 Template 降级。

核心检查失败时按顺序：关闭新任务创建；Vercel 切回上一 production deployment；运行 [`rollback-production.sh`](../../infra/agent/scripts/rollback-production.sh) 切回 previous Agent image；Catalog world pointer 切回上一 published version；数据库使用向前补偿或备份恢复；保留失败版本和审计。整个过程不操作 Palworld 或 mihomo。
