# palbeacon-sync

PalBeacon 的 Linux x64 只读存档同步客户端。最终用户只需运行：

```bash
npx --yes palbeacon-sync@latest init
```

`init` 会依次询问 PalBeacon API 地址、配对码和 Palworld 存档目录，定位唯一世界、完成设备配对并保存配置；在交互终端中还会询问是否立即执行首次同步。也可以完整传参：

```bash
npx --yes palbeacon-sync@latest init \
  --url https://www.palbeacon.app \
  --code ABCD-EFGH \
  --save-dir /path/to/Pal/Saved/SaveGames \
  --sync-now yes

npx --yes palbeacon-sync@latest sync --once
npx --yes palbeacon-sync@latest run
npx --yes palbeacon-sync@latest status
npx --yes palbeacon-sync@latest logout
```

第一版只支持 Linux x64，不支持 Windows 或 macOS。用户无需安装 Python、palsav、Oodle、编译器或其他解压运行库，也不需要额外构建命令。包内包含预编译的自包含 Go Parser；CLI 启动前按 manifest 校验它的 SHA-256。Parser 使用固定版本的开源 palooz/ooz 解码核心，PalBeacon 不分发专有 Oodle 文件，也不会在安装或运行时下载 Parser、Python 环境或解压依赖。

CLI 先把稳定的源存档复制到临时只读快照，再以独立子进程运行 Parser。Parser 环境采用明确白名单，JSON 输出上限为 64 MiB，并有超时与进程组终止保护；`finally` 总会清理临时快照。Parser 无网络、无子进程、无编码器和写回路径，源 `.sav` 不会被修改。

配置保存在 `~/.config/palbeacon-sync/config.json`，目录权限为 `0700`、文件权限为 `0600`。配置版本为 2；当前开发分支曾生成的 v1 配置会保留 API 地址、设备 ID、设备 token、存档目录和同步状态并自动迁移，无需重新配对。`status` 不显示 token 或废弃运行时字段。

## Parser 来源与许可证

npm 包是 mixed-license distribution：

- TypeScript CLI 保持 MIT；
- 独立的 `dist/bin/palworld-save-parser` 因集成 palooz/ooz，以 GPL-3.0-or-later 分发；
- 源自 palhelm 的 Parser 代码保留 Apache-2.0 声明；
- 其他 vendored 组件保留各自通知。

CLI 与 Parser 不做原生链接，只通过子进程和 JSON 文件通信。tarball 包含完整许可证、第三方通知、Parser SHA-256、PalHatchHelper 精确源码 commit、上游 PalworldSaveTools 精确 commit 和源码获取/构建说明：查看 `LICENSE`、`dist/LICENSES/`、`dist/THIRD_PARTY_NOTICES.md`、`dist/PARSER_SOURCE.md` 与 `dist/bin/parser-manifest.json`。

开发时可以用 `PALBEACON_PARSER_BIN` 指向本地 Linux x64 Parser。该变量只用于显式开发覆盖，正式包默认始终验证随包二进制。
