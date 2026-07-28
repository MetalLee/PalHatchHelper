"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import type {
  AdminCatalogSource,
  AdminCatalogUpload,
  AdminCatalogWorld,
  AdminGamePlayer,
} from "./server";
import type {
  AdminBindingCandidate,
  AdminCatalogVersion,
  RuntimeSettingsVersion,
} from "@palhatch/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCopy } from "@/i18n/client";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

import {
  adminActionsClasses,
  adminActionStackClasses,
  adminControlClasses,
  adminFormClasses,
} from "./presentation";

async function runAdminAction<T = unknown>(
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/admin/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      ...body,
      idempotency_key: `${String(body.action)}:${crypto.randomUUID()}`,
    }),
  });
  const result = (await response.json()) as {
    ok?: boolean;
    error_code?: string;
    data?: T;
  };
  if (!response.ok || result.ok !== true)
    throw new Error(result.error_code ?? "ADMIN_DATA_UNAVAILABLE");
  return result.data as T;
}

export function AdminActionButton({
  action,
  payload = {},
  children,
  confirmText,
}: Readonly<{
  action: string;
  payload?: Record<string, unknown>;
  children: ReactNode;
  confirmText?: string;
}>) {
  const t = useCopy("Admin");
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">(
    "idle",
  );
  const [confirmation, setConfirmation] = useState("");
  async function submit() {
    setState("pending");
    try {
      await runAdminAction({ action, ...payload });
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }
  const label =
    state === "pending"
      ? t("processing")
      : state === "done"
        ? t("submitted")
        : state === "error"
          ? t("submitFailed")
          : children;

  if (confirmText === undefined) {
    return (
      <Button
        variant="outline"
        disabled={state === "pending"}
        onClick={submit}
        type="button"
      >
        {label}
      </Button>
    );
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && setConfirmation("")}>
      <AlertDialogTrigger asChild>
        <Button
          className="border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 hover:text-rose-900"
          variant="outline"
          disabled={state === "pending"}
          type="button"
        >
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-mono text-sm text-rose-900">
          {confirmText}
        </div>
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          {t("confirmation")}
          <Input
            aria-label={t("confirmation")}
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={confirmation !== confirmText || state === "pending"}
            onClick={submit}
          >
            {t("confirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BindingCreateForm({
  users,
  players,
}: Readonly<{
  users: AdminBindingCandidate[];
  players: AdminGamePlayer[];
}>) {
  const t = useCopy("Admin");
  const router = useRouter();
  const [status, setStatus] = useState("idle");
  const availableUsers = users.filter((user) => user.player_id === null);
  const availablePlayers = players.filter(
    (player) => player.bound_user_id === null,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("pending");
    const data = new FormData(event.currentTarget);
    try {
      await runAdminAction({
        action: "binding_create",
        user_id: String(data.get("user_id")),
        player_id: String(data.get("player_id")),
      });
      setStatus("done");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }
  return (
    <form className={adminFormClasses} onSubmit={submit}>
      <label>
        {t("supabaseUser")}
        <select name="user_id" required defaultValue="">
          <option disabled value="">
            {t("chooseUnlinkedUser")}
          </option>
          {availableUsers.map((user) => (
            <option key={user.user_id} value={user.user_id}>
              {user.user_display}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("gamePlayer")}
        <select name="player_id" required defaultValue="">
          <option disabled value="">
            {t("chooseUnlinkedPlayer")}
          </option>
          {availablePlayers.map((player) => (
            <option key={player.player_id} value={player.player_id}>
              {player.nickname} · {player.world_name}
            </option>
          ))}
        </select>
      </label>
      <Button disabled={status === "pending"} type="submit">
        {status === "pending"
          ? t("creating")
          : status === "error"
            ? t("createFailed")
            : t("createBinding")}
      </Button>
    </form>
  );
}

export function BindingUpdateForm({
  user,
  players,
}: Readonly<{
  user: AdminBindingCandidate;
  players: AdminGamePlayer[];
}>) {
  const t = useCopy("Admin");
  const router = useRouter();
  const [status, setStatus] = useState("idle");
  if (user.binding_version === null) return null;
  const choices = players.filter(
    (player) =>
      player.bound_user_id === null || player.bound_user_id === user.user_id,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("pending");
    const data = new FormData(event.currentTarget);
    try {
      await runAdminAction({
        action: "binding_update",
        user_id: user.user_id,
        player_id: String(data.get("player_id")),
        expected_version: user.binding_version,
      });
      setStatus("done");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }
  return (
    <form className={adminActionStackClasses} onSubmit={submit}>
      <select
        className={adminControlClasses}
        aria-label={t("updateBindingLabel", { user: user.user_display })}
        name="player_id"
        required
        defaultValue={user.player_id ?? ""}
      >
        {choices.map((player) => (
          <option key={player.player_id} value={player.player_id}>
            {player.nickname}
          </option>
        ))}
      </select>
      <Button variant="outline" disabled={status === "pending"} type="submit">
        {status === "error"
          ? t("updateFailed")
          : status === "pending"
            ? t("updating")
            : t("update")}
      </Button>
    </form>
  );
}

export function SettingsForm({
  version,
}: Readonly<{ version: RuntimeSettingsVersion }>) {
  const t = useCopy("Admin");
  const router = useRouter();
  const settings = version.settings;
  const [status, setStatus] = useState("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("pending");
    const data = new FormData(event.currentTarget);
    const providers = String(data.get("ai_provider_order"))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      await runAdminAction({
        action: "settings_update",
        expected_version: version.version,
        settings: {
          job_creation_enabled: data.get("job_creation_enabled") === "on",
          max_generations: Number(data.get("max_generations")),
          job_worker_concurrency: Number(data.get("job_worker_concurrency")),
          ai_concurrency: Number(data.get("ai_concurrency")),
          parser_timeout_seconds: Number(data.get("parser_timeout_seconds")),
          snapshot_retention_count: Number(
            data.get("snapshot_retention_count"),
          ),
          data_stale_threshold_minutes: Number(
            data.get("data_stale_threshold_minutes"),
          ),
          ai_provider_order: providers,
          maintenance_announcement:
            String(data.get("maintenance_announcement") || "") || null,
        },
      });
      setStatus("done");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }
  return (
    <form className={adminFormClasses} onSubmit={submit}>
      <label className="!flex min-h-11 items-center justify-between rounded-lg border border-border bg-white/62 px-3 py-2">
        <span>{t("jobCreationAllowed")}</span>
        <input
          name="job_creation_enabled"
          type="checkbox"
          className="size-5 accent-primary"
          defaultChecked={settings.job_creation_enabled}
        />
      </label>
      <label>
        {t("maxGenerationLimit")}
        <input
          name="max_generations"
          type="number"
          min="1"
          max="5"
          defaultValue={settings.max_generations}
        />
      </label>
      <label>
        {t("jobWorkerConcurrency")}
        <input
          name="job_worker_concurrency"
          type="number"
          min="1"
          max="4"
          defaultValue={settings.job_worker_concurrency}
        />
      </label>
      <label>
        {t("aiConcurrency")}
        <input
          name="ai_concurrency"
          type="number"
          min="1"
          max="2"
          defaultValue={settings.ai_concurrency}
        />
      </label>
      <label>
        {t("parserTimeout")}
        <input
          name="parser_timeout_seconds"
          type="number"
          min="30"
          max="1800"
          defaultValue={settings.parser_timeout_seconds}
        />
      </label>
      <label>
        {t("snapshotRetention")}
        <input
          name="snapshot_retention_count"
          type="number"
          min="1"
          max="20"
          defaultValue={settings.snapshot_retention_count}
        />
      </label>
      <label>
        {t("staleThreshold")}
        <input
          name="data_stale_threshold_minutes"
          type="number"
          min="5"
          max="1440"
          defaultValue={settings.data_stale_threshold_minutes}
        />
      </label>
      <label>
        {t("providerOrder")}
        <input
          name="ai_provider_order"
          defaultValue={settings.ai_provider_order.join(",")}
        />
      </label>
      <label>
        {t("maintenanceAnnouncement")}
        <textarea
          name="maintenance_announcement"
          maxLength={500}
          defaultValue={settings.maintenance_announcement ?? ""}
        />
      </label>
      <Button type="submit" disabled={status === "pending"}>
        {status === "pending"
          ? t("saving")
          : status === "error"
            ? t("saveFailed")
            : t("saveNewVersion")}
      </Button>
    </form>
  );
}

export function CatalogUploadGuard({
  sources,
}: Readonly<{ sources: AdminCatalogSource[] }>) {
  const t = useCopy("Admin");
  const router = useRouter();
  const [message, setMessage] = useState(t("uploadInitial"));
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("catalog_file");
    if (!(file instanceof File)) return;
    const forbidden =
      /\.(pak|utoc|ucas|usmap|sav|dll|exe|png|jpe?g|gif|webp|mp3|wav|ogg)$/i;
    if (
      !file.name.endsWith(".tar.zst") ||
      forbidden.test(file.name) ||
      file.size > 64 * 1024 * 1024
    ) {
      setMessage(t("uploadInvalid"));
      return;
    }
    setPending(true);
    setMessage(t("uploadHashing"));
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const packageSha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const ticket = await runAdminAction<{
        upload_id: string;
        bucket: string;
        object_path: string;
      }>({
        action: "catalog_upload_create",
        filename: file.name,
        size_bytes: file.size,
        package_sha256: packageSha256,
        source_id: String(data.get("source_id")),
      });
      if (
        !ticket?.upload_id ||
        ticket.bucket !== "game-catalog-artifacts" ||
        !ticket.object_path
      )
        throw new Error("CATALOG_UPLOAD_INVALID");
      setMessage(t("uploadingPrivate"));
      const { error } = await createBrowserSupabaseClient()
        .storage.from(ticket.bucket)
        .upload(ticket.object_path, file, {
          cacheControl: "0",
          contentType: "application/zstd",
          upsert: false,
        });
      if (error) throw new Error("CATALOG_UPLOAD_INCOMPLETE");
      await runAdminAction({
        action: "catalog_upload_ready",
        upload_id: ticket.upload_id,
      });
      form.reset();
      setMessage(t("uploadComplete"));
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "CATALOG_UPLOAD_INVALID",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className={adminFormClasses} onSubmit={submit}>
      <label>
        {t("catalogSource")}
        <select name="source_id" required defaultValue="">
          <option value="" disabled>
            {t("chooseSource")}
          </option>
          {sources.map((source) => (
            <option key={source.source_id} value={source.source_id}>
              {source.name} · {source.source_type}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("catalogPackage")}
        <input
          aria-label={t("catalogPackage")}
          name="catalog_file"
          required
          type="file"
          accept=".tar.zst,application/zstd"
        />
      </label>
      <Button disabled={pending || sources.length === 0} type="submit">
        {pending ? t("uploading") : t("uploadPrivate")}
      </Button>
      <p className="text-sm text-muted-foreground" role="status">
        {message}
      </p>
    </form>
  );
}

export function CatalogUploadActions({
  upload,
}: Readonly<{ upload: AdminCatalogUpload }>) {
  return (
    <div className={adminActionsClasses}>
      {(upload.status === "uploaded" || upload.status === "failed") && (
        <AdminActionButton
          action="catalog_validate"
          payload={{ upload_id: upload.upload_id }}
        >
          validate
        </AdminActionButton>
      )}
      {upload.status === "validated" && (
        <AdminActionButton
          action="catalog_stage"
          payload={{ upload_id: upload.upload_id }}
        >
          stage
        </AdminActionButton>
      )}
      {!["staging", "staged", "rejected"].includes(upload.status) && (
        <AdminActionButton
          action="catalog_upload_reject"
          payload={{
            upload_id: upload.upload_id,
            confirmation: `REJECT ${upload.upload_id}`,
          }}
          confirmText={`REJECT ${upload.upload_id}`}
        >
          reject
        </AdminActionButton>
      )}
    </div>
  );
}

export function CatalogVersionActions({
  version,
  worlds,
}: Readonly<{ version: AdminCatalogVersion; worlds: AdminCatalogWorld[] }>) {
  const t = useCopy("Admin");
  const [worldId, setWorldId] = useState(worlds[0]?.world_id ?? "");
  return (
    <div className={adminActionStackClasses}>
      {worlds.length > 0 && (
        <select
          className={adminControlClasses}
          aria-label={t("chooseWorld", { version: version.version_id })}
          value={worldId}
          onChange={(event) => setWorldId(event.target.value)}
        >
          {worlds.map((world) => (
            <option key={world.world_id} value={world.world_id}>
              {world.name}
            </option>
          ))}
        </select>
      )}
      <div className={adminActionsClasses}>
        <AdminActionButton
          action="catalog_inspect"
          payload={{ version_id: version.version_id }}
        >
          inspect
        </AdminActionButton>
        <AdminActionButton
          action="warm_catalog_cache"
          payload={{ version_id: version.version_id }}
        >
          warm-cache
        </AdminActionButton>
        {version.validation_state === "validated" && worldId && (
          <AdminActionButton
            action="catalog_publish"
            payload={{
              world_id: worldId,
              version_id: version.version_id,
              confirmation: `PUBLISH ${version.version_id}`,
            }}
            confirmText={`PUBLISH ${version.version_id}`}
          >
            publish
          </AdminActionButton>
        )}
        {version.validation_state === "published" && worldId && (
          <AdminActionButton
            action="catalog_rollback"
            payload={{
              world_id: worldId,
              version_id: version.version_id,
              confirmation: `ROLLBACK ${version.version_id}`,
            }}
            confirmText={`ROLLBACK ${version.version_id}`}
          >
            rollback
          </AdminActionButton>
        )}
        {["extracting", "staging", "validated"].includes(
          version.validation_state,
        ) && (
          <AdminActionButton
            action="catalog_reject"
            payload={{
              version_id: version.version_id,
              confirmation: `REJECT ${version.version_id}`,
            }}
            confirmText={`REJECT ${version.version_id}`}
          >
            reject
          </AdminActionButton>
        )}
      </div>
    </div>
  );
}

export function JobCreationToggle({
  version,
}: Readonly<{ version: RuntimeSettingsVersion }>) {
  const t = useCopy("Admin");
  return (
    <AdminActionButton
      action="settings_update"
      payload={{
        expected_version: version.version,
        settings: {
          ...version.settings,
          job_creation_enabled: !version.settings.job_creation_enabled,
        },
      }}
      confirmText={
        version.settings.job_creation_enabled
          ? t("disableCreationConfirm")
          : t("enableCreationConfirm")
      }
    >
      {version.settings.job_creation_enabled
        ? t("disableCreation")
        : t("enableCreation")}
    </AdminActionButton>
  );
}
