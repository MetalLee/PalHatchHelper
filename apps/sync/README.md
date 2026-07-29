# palbeacon-sync

PalBeacon 的 Linux x64 只读存档同步客户端。它先复制稳定的本地存档，再调用随包发布且经过 SHA-256 校验的 Go Parser；只上传脱敏后的标准化库存 JSON。

```bash
npx palbeacon-sync@latest init \
  --url https://www.palbeacon.app \
  --code ABCD-EFGH \
  --save-dir /path/to/Pal/Saved/SaveGames

npx palbeacon-sync@latest sync --once
npx palbeacon-sync@latest run
npx palbeacon-sync@latest status
npx palbeacon-sync@latest logout
```

找不到本机 Oodle 动态库时，向 `init` 增加 `--oodle-lib /path/to/liboo2corelinux64.so.9`。本包不包含、不复制、也不下载 Oodle。配置保存在 `~/.config/palbeacon-sync/config.json`，权限为 `0600`。开发时可用 `PALBEACON_PARSER_BIN` 指向本地 Parser。
