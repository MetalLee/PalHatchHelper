# Parser 1.3.0 / palbeacon-cli 0.2.0 发布候选变更记录

## 范围

Parser 1.3.0 在保留既有 Go GVAS、PlM/PlZ、玩家、公会、帕鲁和
CanonicalSnapshot 语义的基础上，增加由同一 decode-only palooz/ooz 源码构建的
Windows x64 PE。固定上游仍为 PalworldSaveTools commit
`3395e393466fc1f384dee54dabb3e597e611435e`，不增加压缩、编码、联网、子进程或 SAV
写回能力。

唯一 npm 候选为 `palbeacon-cli-0.2.0.tgz`，同时包含：

- `dist/bin/linux-x64/palworld-save-parser`
- `dist/bin/win32-x64/palworld-save-parser.exe`

两个平台分别携带 manifest 和 SHA-256，版本、仓库 source commit、upstream commit
与 GPL-3.0-or-later 边界一致。TypeScript CLI 保持 MIT，通过子进程和 JSON 文件与
Parser 通信。

## 构建与验收边界

Linux 使用固定 Go 1.26.5 镜像；Windows 使用固定 Go/Ubuntu 镜像、MinGW-w64
GCC/G++ 13.2.0、binutils 2.41.90.20240122 和 MinGW-w64 11.0.1 headers 交叉编译。
两个 artifact 均连续构建两次比较 SHA-256。Windows PE 必须不依赖
`libstdc++-6.dll`、`libgcc_s_seh-1.dll` 或 `libwinpthread-1.dll`。

同一 tgz 由 Ubuntu 和 Windows runner 分别安装，执行 `palbeacon --version`、帮助、
PlM/PlZ fixture、自动 Parser 选择、输入不变与跨平台快照哈希检查。缺少任一 artifact
或 metadata 不一致时 release build 失败。

本候选记录不授权 npm publish、生产数据库 migration、Vercel 部署、Palworld 变更或
停止既有同步服务。
