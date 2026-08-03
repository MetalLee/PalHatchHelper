"use client";

import type { SyncBindingInvitationPreview } from "@palhatch/contracts";
import { CheckCircle2, LoaderCircle, UserRoundCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { VisitorDateTime } from "@/components/formatters/visitor-date-time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppLocale, useCopy } from "@/i18n/client";

export function BindingInvitationConfirmation({
  token,
}: Readonly<{ token: string }>) {
  const locale = useAppLocale();
  const t = useCopy("BindingInvitation");
  const [preview, setPreview] = useState<SyncBindingInvitationPreview | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/sync/binding-invitations/${token}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          error_code?: string;
        } & Partial<SyncBindingInvitationPreview>;
        if (!response.ok)
          throw new Error(body.error_code ?? "SYNC_UNAVAILABLE");
        return body as SyncBindingInvitationPreview;
      })
      .then((body) => {
        if (active) setPreview(body);
      })
      .catch((error: unknown) => {
        if (active)
          setErrorCode(
            error instanceof Error ? error.message : "SYNC_UNAVAILABLE",
          );
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function accept() {
    setPending(true);
    setErrorCode(null);
    try {
      const response = await fetch(`/api/sync/binding-invitations/${token}`, {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json()) as { error_code?: string };
      if (!response.ok) throw new Error(body.error_code ?? "SYNC_UNAVAILABLE");
      setAccepted(true);
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "SYNC_UNAVAILABLE");
    } finally {
      setPending(false);
    }
  }

  if (accepted) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/85 py-0 shadow-soft">
        <CardContent className="grid justify-items-start gap-4 p-5 sm:p-6">
          <CheckCircle2
            aria-hidden="true"
            className="size-10 text-emerald-600"
          />
          <div>
            <h2 className="text-xl font-bold text-emerald-950">
              {t("successTitle")}
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              {t("successDescription")}
            </p>
          </div>
          <Button asChild>
            <a href={`/${locale}/overview`}>{t("openWorkspace")}</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (errorCode !== null) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{invitationError(errorCode, t)}</AlertDescription>
      </Alert>
    );
  }

  if (preview === null) {
    return (
      <Card className="border-glass-border bg-card/90 py-0 shadow-soft">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground sm:p-6">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          {t("loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-glass-border bg-card/90 py-0 shadow-soft">
      <CardContent className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <UserRoundCheck
            aria-hidden="true"
            className="mt-0.5 size-6 text-primary"
          />
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {preview.nickname} {preview.discriminator}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("reviewDescription")}
            </p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <InvitationFact label={t("server")} value={preview.device_name} />
          <InvitationFact label={t("world")} value={preview.world_name} />
          <InvitationFact
            label={t("guild")}
            value={preview.guild_name ?? t("noGuild")}
          />
          <InvitationFact
            label={t("level")}
            value={
              preview.level === null ? t("levelUnknown") : String(preview.level)
            }
          />
        </dl>

        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          {t("rebindNotice")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("expiresLabel")}{" "}
          <VisitorDateTime
            value={preview.expires_at}
            locale={locale}
            options={{ dateStyle: "medium", timeStyle: "short" }}
          />
        </p>
        <Button
          type="button"
          disabled={pending}
          onClick={() => void accept()}
          className="justify-self-start"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {pending ? t("accepting") : t("accept")}
        </Button>
      </CardContent>
    </Card>
  );
}

function InvitationFact({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl bg-muted/55 p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{value}</dd>
    </div>
  );
}

type InvitationCopy = (key: "expired" | "invalid" | "unavailable") => string;

function invitationError(code: string, t: InvitationCopy): string {
  if (code === "BINDING_INVITATION_EXPIRED") return t("expired");
  if (
    code === "BINDING_INVITATION_INVALID" ||
    code === "PLAYER_ALREADY_CLAIMED"
  ) {
    return t("invalid");
  }
  return t("unavailable");
}
