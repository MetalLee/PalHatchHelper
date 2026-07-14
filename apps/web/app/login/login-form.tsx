"use client";

import { type FormEvent, useState } from "react";

export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error_code?: "INVALID_CREDENTIALS" | "AUTH_UNAVAILABLE";
      };
      if (!response.ok || result.ok !== true) {
        setError(
          result.error_code === "INVALID_CREDENTIALS"
            ? "邮箱或密码不正确。"
            : "登录服务暂不可用，请稍后重试。",
        );
        return;
      }
      // A full navigation guarantees the freshly written Supabase session cookie is
      // visible to middleware and the first protected Server Component request.
      window.location.assign("/overview");
    } catch {
      setError("登录服务暂不可用，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 grid gap-5" onSubmit={(event) => void submit(event)}>
      <label className="login-field">
        <span>邮箱</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="player@example.com"
        />
      </label>
      <label className="login-field">
        <span>密码</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          placeholder="输入测试账号密码"
        />
      </label>
      {error !== null ? (
        <p
          className="rounded-xl border border-rose-300/20 bg-rose-300/8 px-4 py-3 text-sm text-rose-100"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        className="primary-button w-full"
        type="submit"
        disabled={pending}
      >
        {pending ? "正在登录…" : "登录工作台"}
      </button>
      <p className="text-center text-xs leading-5 text-slate-500">
        当前阶段仅使用本地或预览 Supabase 的脱敏测试账号。
      </p>
    </form>
  );
}
