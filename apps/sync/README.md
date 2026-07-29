# palbeacon

[简体中文](README.zh-CN.md)

Read-only Palworld server save synchronization for PalBeacon. It uploads Pal
inventory for collaborative breeding plans without modifying your save.

## Install

Linux x64 and Node.js 22 or later are required.

```bash
npm install -g palbeacon-cli
```

## Use

Create a sync device in your PalBeacon account and copy its pairing code. Then
run:

```bash
palbeacon init
```

Enter the pairing code and your Palworld save directory when prompted.

After pairing, start synchronization:

```bash
palbeacon run
```

The client syncs immediately, then checks for save changes every five minutes.
Keep the command running to continue synchronization.

## Other commands

```bash
palbeacon status
palbeacon logout
```

The CLI follows your system language when possible and falls back to English.
Use `--locale en` or `--locale zh-CN` before or after a command to override it.

palbeacon only reads save data. It never modifies Palworld saves or runs
server control commands.
