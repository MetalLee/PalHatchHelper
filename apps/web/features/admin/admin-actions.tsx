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
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

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
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">(
    "idle",
  );
  async function submit() {
    if (
      confirmText &&
      window.prompt(`请输入确认文字：${confirmText}`) !== confirmText
    )
      return;
    setState("pending");
    try {
      await runAdminAction({ action, ...payload });
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }
  return (
    <button
      className="secondary-button"
      disabled={state === "pending"}
      onClick={submit}
      type="button"
    >
      {state === "pending"
        ? "处理中…"
        : state === "done"
          ? "已提交"
          : state === "error"
            ? "提交失败"
            : children}
    </button>
  );
}

export function BindingCreateForm({
  users,
  players,
}: Readonly<{
  users: AdminBindingCandidate[];
  players: AdminGamePlayer[];
}>) {
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
    <form className="admin-form-grid" onSubmit={submit}>
      <label>
        Supabase 用户
        <select name="user_id" required defaultValue="">
          <option disabled value="">
            选择未绑定用户
          </option>
          {availableUsers.map((user) => (
            <option key={user.user_id} value={user.user_id}>
              {user.user_display}
            </option>
          ))}
        </select>
      </label>
      <label>
        游戏玩家
        <select name="player_id" required defaultValue="">
          <option disabled value="">
            选择未绑定玩家
          </option>
          {availablePlayers.map((player) => (
            <option key={player.player_id} value={player.player_id}>
              {player.nickname} · {player.world_name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="primary-button"
        disabled={status === "pending"}
        type="submit"
      >
        {status === "pending"
          ? "创建中…"
          : status === "error"
            ? "创建失败，重试"
            : "创建绑定"}
      </button>
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
    <form className="admin-inline-form" onSubmit={submit}>
      <select
        aria-label={`修改 ${user.user_display} 的绑定`}
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
      <button
        className="secondary-button"
        disabled={status === "pending"}
        type="submit"
      >
        {status === "error"
          ? "修改失败"
          : status === "pending"
            ? "修改中…"
            : "修改"}
      </button>
    </form>
  );
}

export function SettingsForm({
  version,
}: Readonly<{ version: RuntimeSettingsVersion }>) {
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
    <form className="admin-form-grid" onSubmit={submit}>
      <label>
        <span>允许创建任务</span>
        <input
          name="job_creation_enabled"
          type="checkbox"
          defaultChecked={settings.job_creation_enabled}
        />
      </label>
      <label>
        最大代数上限
        <input
          name="max_generations"
          type="number"
          min="1"
          max="8"
          defaultValue={settings.max_generations}
        />
      </label>
      <label>
        Job Worker 并发
        <input
          name="job_worker_concurrency"
          type="number"
          min="1"
          max="4"
          defaultValue={settings.job_worker_concurrency}
        />
      </label>
      <label>
        AI 并发
        <input
          name="ai_concurrency"
          type="number"
          min="1"
          max="2"
          defaultValue={settings.ai_concurrency}
        />
      </label>
      <label>
        Parser 超时（秒）
        <input
          name="parser_timeout_seconds"
          type="number"
          min="30"
          max="1800"
          defaultValue={settings.parser_timeout_seconds}
        />
      </label>
      <label>
        快照保留数量
        <input
          name="snapshot_retention_count"
          type="number"
          min="1"
          max="20"
          defaultValue={settings.snapshot_retention_count}
        />
      </label>
      <label>
        数据过期阈值（分钟）
        <input
          name="data_stale_threshold_minutes"
          type="number"
          min="5"
          max="1440"
          defaultValue={settings.data_stale_threshold_minutes}
        />
      </label>
      <label>
        AI Provider 顺序（逗号分隔）
        <input
          name="ai_provider_order"
          defaultValue={settings.ai_provider_order.join(",")}
        />
      </label>
      <label>
        维护公告
        <textarea
          name="maintenance_announcement"
          maxLength={500}
          defaultValue={settings.maintenance_announcement ?? ""}
        />
      </label>
      <button
        className="primary-button"
        type="submit"
        disabled={status === "pending"}
      >
        {status === "pending"
          ? "保存中…"
          : status === "error"
            ? "保存失败，重试"
            : "保存新版本"}
      </button>
    </form>
  );
}

export function CatalogUploadGuard({
  sources,
}: Readonly<{ sources: AdminCatalogSource[] }>) {
  const router = useRouter();
  const [message, setMessage] = useState(
    "仅接受标准化 .tar.zst，最大 64 MiB。",
  );
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
      setMessage("CATALOG_UPLOAD_INVALID：文件类型或大小不符合白名单。");
      return;
    }
    setPending(true);
    setMessage("正在计算 SHA-256 并申请私有上传路径…");
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
      setMessage("正在上传到受限私有对象路径…");
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
      setMessage(
        "上传完成；请发起 validate，Agent 将再次验证大小、SHA-256、成员白名单与目录契约。",
      );
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
    <form className="admin-form-grid" onSubmit={submit}>
      <label>
        目录来源
        <select name="source_id" required defaultValue="">
          <option value="" disabled>
            选择已启用来源
          </option>
          {sources.map((source) => (
            <option key={source.source_id} value={source.source_id}>
              {source.name} · {source.source_type}
            </option>
          ))}
        </select>
      </label>
      <label>
        标准化目录包
        <input
          aria-label="标准化目录包"
          name="catalog_file"
          required
          type="file"
          accept=".tar.zst,application/zstd"
        />
      </label>
      <button
        className="primary-button"
        disabled={pending || sources.length === 0}
        type="submit"
      >
        {pending ? "上传中…" : "上传私有目录包"}
      </button>
      <p className="text-sm text-slate-400" role="status">
        {message}
      </p>
    </form>
  );
}

export function CatalogUploadActions({
  upload,
}: Readonly<{ upload: AdminCatalogUpload }>) {
  return (
    <div className="admin-actions">
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
  const [worldId, setWorldId] = useState(worlds[0]?.world_id ?? "");
  return (
    <div className="admin-action-stack">
      {worlds.length > 0 && (
        <select
          aria-label={`选择 ${version.version_id} 的世界`}
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
      <div className="admin-actions">
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
        version.settings.job_creation_enabled ? "关闭任务创建" : "开启任务创建"
      }
    >
      {version.settings.job_creation_enabled
        ? "临时关闭创建入口"
        : "打开创建入口"}
    </AdminActionButton>
  );
}
