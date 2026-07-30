# palbeacon

[English](README.md)

PalBeacon 的《幻兽帕鲁》服务器存档同步工具。它会只读解析服务器存档，并将帕鲁库存同步到
PalBeacon，用于生成公会配种路线。

## 支持平台

- Linux x64
- Windows x64

需要 Node.js 22 或更高版本。

在 Linux shell 或 Windows PowerShell 中运行：

```powershell
npm install -g palbeacon-cli
palbeacon init
palbeacon run
```

## 使用

先在 PalBeacon 账户页创建同步设备并复制配对码。如果尚未执行上面的快速开始命令，运行：

```bash
palbeacon init
```

根据提示输入 PalBeacon 配对码和 Palworld 存档目录。完成配对后启动同步：

```bash
palbeacon run
```

程序会立即同步一次，之后每 5 分钟自动检查存档变化。保持该命令运行即可持续同步。

## 其他命令

```bash
palbeacon status
palbeacon logout
```

CLI 会优先使用系统语言，无法判断时使用英文。可在命令前或后添加 `--locale en` 或
`--locale zh-CN` 手动指定语言。

palbeacon 只读存档，不会修改 Palworld 存档，也不会执行服务器控制命令。
