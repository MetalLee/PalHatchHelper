# palbeacon

[简体中文](README.zh-CN.md)

Read-only Palworld server save synchronization for PalBeacon. It uploads Pal
inventory for collaborative breeding plans without modifying your save.

## Supported platforms

- Linux x64
- Windows x64

Node.js 22 or later is required.

In a Linux shell or Windows PowerShell:

```powershell
npm install -g palbeacon-cli
palbeacon init
palbeacon run
```

## Use

Create a sync device in your PalBeacon account and copy its pairing code. If
you did not use the quick-start sequence above, run:

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
