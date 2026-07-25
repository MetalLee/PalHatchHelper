"use client";

import { AlertCircle, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  onNavigate = (path) => window.location.assign(path),
}: Readonly<{ onNavigate?: (path: string) => void }>) {
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
      onNavigate("/overview");
    } catch {
      setError("登录服务暂不可用，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="mt-8 grid min-w-0 gap-5"
      onSubmit={(event) => void submit(event)}
    >
      <div className="grid gap-2">
        <Label htmlFor="login-email">邮箱</Label>
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="login-email"
            className="h-12 rounded-xl bg-white/76 pl-10"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="player@example.com"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="login-password">密码</Label>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="login-password"
            className="h-12 rounded-xl bg-white/76 pl-10"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            placeholder="输入密码"
          />
        </div>
      </div>
      {error !== null ? (
        <Alert
          variant="destructive"
          role="alert"
          className="rounded-xl border-rose-200 bg-rose-50/90 text-rose-900"
        >
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="text-rose-800">{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        className="h-12 w-full rounded-xl shadow-[0_12px_30px_rgb(40_122_84_/_0.2)]"
        type="submit"
        disabled={pending}
        aria-label="登录工作台"
        aria-busy={pending}
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {pending ? "正在登录…" : "登录工作台"}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        仅使用当前系统已提供的账号登录。
      </p>
    </form>
  );
}
