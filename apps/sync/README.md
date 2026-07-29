# palbeacon-sync

[简体中文](README.zh-CN.md)

Read-only Palworld server save synchronization for PalBeacon. It uploads Pal
inventory for collaborative breeding plans without modifying your save.

## Install

Linux x64 and Node.js 22 or later are required.

```bash
npm install -g palbeacon-sync
```

## Use

Create a sync device in your PalBeacon account and copy its pairing code. Then
run:

```bash
palbeacon-sync init
```

Enter the pairing code and your Palworld save directory when prompted.

After pairing, start synchronization:

```bash
palbeacon-sync run
```

The client syncs immediately, then checks for save changes every five minutes.
Keep the command running to continue synchronization.

## Other commands

```bash
palbeacon-sync status
palbeacon-sync logout
```

The CLI follows your system language when possible and falls back to English.
Use `--locale en` or `--locale zh-CN` before or after a command to override it.

palbeacon-sync only reads save data. It never modifies Palworld saves or runs
server control commands.
