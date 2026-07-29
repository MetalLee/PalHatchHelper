"use client";

import type { SyncClaimablePlayer, SyncDevice } from "@palhatch/contracts";
import {
  CheckCircle2,
  Copy,
  Link2,
  LoaderCircle,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppLocale, useCopy } from "@/i18n/client";

type PairingCode = { code: string; expires_at: string };

export function SyncDeviceCard({
  hasBinding,
}: Readonly<{ hasBinding: boolean }>) {
  const locale = useAppLocale();
  const t = useCopy("Sync");
  const unavailableText = t("unavailable");
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [players, setPlayers] = useState<SyncClaimablePlayer[]>([]);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [deviceResponse, playerResponse] = await Promise.all([
      fetch("/api/sync/devices", { cache: "no-store" }),
      hasBinding
        ? Promise.resolve(null)
        : fetch("/api/sync/claimable-players", { cache: "no-store" }),
    ]);
    if (!deviceResponse.ok || (playerResponse !== null && !playerResponse.ok)) {
      throw new Error("SYNC_UNAVAILABLE");
    }
    const deviceBody = (await deviceResponse.json()) as {
      devices?: SyncDevice[];
    };
    const playerBody =
      playerResponse === null
        ? { players: [] }
        : ((await playerResponse.json()) as {
            players?: SyncClaimablePlayer[];
          });
    setDevices(deviceBody.devices ?? []);
    setPlayers(playerBody.players ?? []);
  }, [hasBinding]);

  useEffect(() => {
    void reload().catch(() => setError(unavailableText));
  }, [reload, unavailableText]);

  async function createCode() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/sync/pairing-codes", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("PAIRING_FAILED");
      setPairing((await response.json()) as PairingCode);
    } catch {
      setError(t("pairingFailed"));
    } finally {
      setPending(false);
    }
  }

  async function revoke(deviceId: string) {
    if (!window.confirm(t("revokeConfirm"))) return;
    setPending(true);
    try {
      const response = await fetch(`/api/sync/devices/${deviceId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("REVOKE_FAILED");
      await reload();
    } catch {
      setError(t("revokeFailed"));
    } finally {
      setPending(false);
    }
  }

  async function claim(playerId: string) {
    setPending(true);
    try {
      const response = await fetch("/api/sync/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player_id: playerId }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("CLAIM_FAILED");
      window.location.assign(`/${locale}/overview`);
    } catch {
      setError(t("claimFailed"));
      setPending(false);
    }
  }

  const command = pairing
    ? `npx palbeacon-sync@latest init \\\n+  --url ${windowOrigin()} \\\n+  --code ${pairing.code} \\\n+  --save-dir /path/to/Pal/Saved/SaveGames`
    : null;

  return (
    <Card className="border-glass-border bg-card/90 py-0 shadow-soft">
      <CardContent className="grid gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Server aria-hidden="true" className="size-5 text-primary" />
              {t("title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void createCode()}
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <Link2 aria-hidden="true" className="size-4" />
            )}
            {pairing === null ? t("addDevice") : t("regenerate")}
          </Button>
        </div>

        {error !== null ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {pairing !== null && command !== null ? (
          <div className="grid gap-3 rounded-2xl bg-muted/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">
                {t("pairingCode")}:{" "}
                <span className="font-mono text-lg">{pairing.code}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {t("expires", {
                  date: new Date(pairing.expires_at).toLocaleTimeString(locale),
                })}
              </p>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-emerald-100">
              <code>{command}</code>
            </pre>
            <Button
              variant="outline"
              type="button"
              className="justify-self-start"
              onClick={() => void navigator.clipboard.writeText(command)}
            >
              <Copy aria-hidden="true" className="size-4" />
              {t("copyCommand")}
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3">
          {devices.length === 0 ? (
            <p className="rounded-2xl bg-muted/45 p-4 text-sm text-muted-foreground">
              {t("noDevices")}
            </p>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-muted/45 p-4"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-foreground">
                    <span
                      className={`size-2 rounded-full ${isOnline(device.last_seen_at) && device.revoked_at === null ? "bg-emerald-500" : "bg-slate-400"}`}
                    />
                    {device.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {device.app_version ?? t("versionUnknown")} ·{" "}
                    {device.last_snapshot_at
                      ? t("lastSnapshot", {
                          time: relativeTime(device.last_snapshot_at, locale),
                        })
                      : t("neverSynced")}
                  </p>
                </div>
                {device.revoked_at === null ? (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={pending}
                    onClick={() => void revoke(device.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    {t("revoke")}
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("revoked")}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {!hasBinding && players.length > 0 ? (
          <div className="grid gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-foreground">
                <CheckCircle2
                  aria-hidden="true"
                  className="size-5 text-primary"
                />
                {t("claimTitle")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("claimDescription")}
              </p>
            </div>
            {players.map((player) => (
              <div
                key={player.player_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background/70 p-3"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {player.nickname}{" "}
                    <span className="text-xs text-muted-foreground">
                      {player.discriminator}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {player.guild_name ?? t("noGuild")} ·{" "}
                    {player.level === null
                      ? t("levelUnknown")
                      : t("level", { level: player.level })}
                  </p>
                </div>
                <Button
                  size="sm"
                  type="button"
                  disabled={pending}
                  onClick={() => void claim(player.player_id)}
                >
                  {t("claim")}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          type="button"
          onClick={() => void reload().catch(() => setError(unavailableText))}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {t("refresh")}
        </Button>
      </CardContent>
    </Card>
  );
}

function windowOrigin(): string {
  return typeof window === "undefined"
    ? "https://www.palbeacon.app"
    : window.location.origin;
}

function isOnline(value: string | null): boolean {
  return value !== null && Date.now() - Date.parse(value) < 10 * 60 * 1000;
}

function relativeTime(value: string, locale: string): string {
  const seconds = Math.round((Date.parse(value) - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  return formatter.format(Math.round(minutes / 60), "hour");
}
