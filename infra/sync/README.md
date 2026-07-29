# palbeacon-sync systemd 运行手册

本目录提供公共 Sync 客户端的生产模板。它以专用非 root 用户运行，只读取
Palworld 存档，不需要 Docker Socket、RCON 或 Palworld 写权限。模板中的
`__PALWORLD_SAVE_DIRECTORY__` 必须在安装前替换为经过确认的真实世界存档目录；
仓库不记录生产路径。

## 1. 创建专用用户

以主机管理员身份创建不可登录、无主目录的系统账户，并单独创建状态目录：

```bash
sudo useradd --system --no-create-home --home-dir /var/lib/palbeacon-sync \
  --shell /usr/sbin/nologin palbeacon-sync
sudo install -d -o palbeacon-sync -g palbeacon-sync -m 0700 \
  /var/lib/palbeacon-sync
```

不要把该用户加入 `docker`、Palworld 管理或其他高权限组。

## 2. 授予最小只读存档权限

先确定唯一世界目录，即包含 `Level.sav` 和可选 `Players/` 的目录。只给
`palbeacon-sync` 穿越父目录以及读取该世界目录、`.sav` 文件的权限。可以使用主机
既有的只读组或 ACL；例如，将占位路径替换后由管理员执行：

```bash
sudo setfacl -m u:palbeacon-sync:--x __SAVE_PARENT_DIRECTORY__
sudo setfacl -R -m u:palbeacon-sync:r-X __PALWORLD_SAVE_DIRECTORY__
sudo setfacl -R -d -m u:palbeacon-sync:r-X __PALWORLD_SAVE_DIRECTORY__
```

不要改变 Palworld 的所有者，不要授予写权限，也不要修改、停止或重启 Palworld。

## 3. 安装精确版本

只有 `palbeacon-sync@0.1.0` 已按发布手册人工发布并完成 tgz 校验后，才安装精确
版本；不要使用 `latest`：

```bash
sudo npm install --global --ignore-scripts=false palbeacon-sync@0.1.0
/usr/local/bin/palbeacon-sync --version
```

版本输出必须为 `0.1.0`。生产安装不从本地重新打包另一个 tarball。

## 4. 以服务用户初始化

配对码是一次性的。以专用用户运行 `init`，并把 `XDG_CONFIG_HOME` 固定到状态目录：

```bash
sudo -u palbeacon-sync env XDG_CONFIG_HOME=/var/lib/palbeacon-sync \
  /usr/local/bin/palbeacon-sync init \
  --url https://www.palbeacon.app \
  --code __ONE_TIME_PAIRING_CODE__ \
  --save-dir __PALWORLD_SAVE_DIRECTORY__
```

配置文件应位于
`/var/lib/palbeacon-sync/palbeacon-sync/config.json`。检查所有者和权限，不要打印
文件内容：

```bash
sudo stat -c '%U %G %a %n' \
  /var/lib/palbeacon-sync/palbeacon-sync \
  /var/lib/palbeacon-sync/palbeacon-sync/config.json
```

目录必须为 `0700`，配置必须为 `0600` 且由 `palbeacon-sync` 所有。

## 5. 验证一次同步

数据库身份 transition 成功后、启用常驻服务前，以同一用户运行一次：

```bash
sudo -u palbeacon-sync env XDG_CONFIG_HOME=/var/lib/palbeacon-sync \
  /usr/local/bin/palbeacon-sync sync --once
```

随后必须运行受控 cutover 验证脚本，确认 world UUID、绑定、库存数量和 Parser
版本均符合预期。不要在 transition 之前上传。

## 6. 安装并启用 systemd

复制模板前先把 `__PALWORLD_SAVE_DIRECTORY__` 替换成经过确认的绝对路径，并检查
差异；不得把替换后的生产文件提交回仓库：

```bash
sudo install -o root -g root -m 0644 palbeacon-sync.service \
  /etc/systemd/system/palbeacon-sync.service
sudo systemd-analyze verify /etc/systemd/system/palbeacon-sync.service
sudo systemctl daemon-reload
sudo systemctl enable --now palbeacon-sync.service
```

模板以非 root 用户常驻运行，`ProtectSystem=strict`，只有配置目录可写，存档路径仅
以只读方式暴露给服务。

## 7. 查看状态与日志

```bash
sudo systemctl status palbeacon-sync.service
sudo journalctl -u palbeacon-sync.service --since '30 minutes ago'
```

日志不得包含设备 token、配对码或完整库存。出现异常时先停止公共 Sync，不要操作
Palworld、mihomo 或 Docker daemon。

## 8. 停止与回滚

停止只影响公共 Sync：

```bash
sudo systemctl disable --now palbeacon-sync.service
```

然后按
[`docs/operations/save-worker-to-public-sync-cutover.md`](../../docs/operations/save-worker-to-public-sync-cutover.md)
依次撤销 Sync 设备、调用受控 rollback RPC、再启动旧 Save Worker 并等待一份新的
原始 UID 快照。rollback 不会启动进程，也不会删除公共 Sync 历史快照。不要停止或
重启 Palworld/mihomo，不要挂载 Docker Socket，也不要授予 RCON。
