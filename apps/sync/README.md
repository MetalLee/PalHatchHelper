# palbeacon-sync

PalBeacon 的《幻兽帕鲁》服务器存档同步工具。它会只读解析服务器存档，并将帕鲁库存同步到 PalBeacon，用于生成公会配种路线。

## 安装

支持 Linux x64，需要 Node.js 22。

```bash
npm install -g palbeacon-sync
```

## 使用

先在 PalBeacon 账户页创建同步设备并复制配对码，然后运行：

```bash
palbeacon-sync init
```

根据提示输入 PalBeacon 配对码和 Palworld 存档目录。

完成配对后启动同步：

```bash
palbeacon-sync run
```

程序会立即同步一次，之后每 5 分钟自动检查存档变化。

保持该命令运行即可持续同步。

## 其他命令

```bash
palbeacon-sync status
palbeacon-sync logout
```

palbeacon-sync 只读存档，不会修改 Palworld 存档，也不会执行服务器控制命令。
