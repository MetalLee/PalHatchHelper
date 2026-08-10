"use client";

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { type FormEvent, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  REGISTRATION_PASSWORD_MAX_LENGTH,
  REGISTRATION_PASSWORD_MIN_LENGTH,
  type RegistrationErrorCode,
} from "@/features/auth/register";
import { safeNextPath } from "@/features/auth/safe-next";
import { useAppLocale, useCopy } from "@/i18n/client";
import { Link } from "@/i18n/navigation";

type FieldErrors = Partial<
  Record<"displayName" | "email" | "password" | "confirmation", string>
>;

export function RegisterForm({
  next,
  onNavigate = (path) => window.location.assign(path),
}: Readonly<{ next?: string; onNavigate?: (path: string) => void }>) {
  const locale = useAppLocale();
  const t = useCopy("Register");
  const safeDestination = safeNextPath(next);
  const destination = safeDestination.startsWith(`/${locale}/`)
    ? safeDestination
    : `/${locale}${safeDestination}`;
  const loginHref =
    next === undefined
      ? "/login"
      : `/login?next=${encodeURIComponent(destination)}`;
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(
      form.get("password_confirmation") ?? "",
    );
    if (password !== passwordConfirmation) {
      setFieldErrors({ confirmation: t("passwordMismatch") });
      return;
    }

    setPending(true);
    try {
      const payload = {
        display_name: String(form.get("display_name") ?? ""),
        email: String(form.get("email") ?? ""),
        password,
        password_confirmation: passwordConfirmation,
        locale,
        ...(next === undefined ? {} : { next: destination }),
      };
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        requires_email_confirmation?: boolean;
        error_code?: RegistrationErrorCode | "INVALID_REGISTRATION";
      };
      if (!response.ok || result.ok !== true) {
        applyRegistrationError(result.error_code, t, setFieldErrors, setError);
        return;
      }
      if (result.requires_email_confirmation === true) {
        setSuccess(true);
        return;
      }
      onNavigate(destination);
    } catch {
      setError(t("unavailable"));
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="mt-8 grid gap-5">
        <Alert
          className="rounded-xl border-emerald-200 bg-emerald-50/90 text-emerald-950"
          role="status"
        >
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>{t("confirmationTitle")}</AlertTitle>
          <AlertDescription className="text-emerald-900">
            {t("confirmationSent")}
          </AlertDescription>
        </Alert>
        <Button asChild className="h-12 w-full rounded-xl" variant="outline">
          <Link href={loginHref}>{t("returnLogin")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 grid min-w-0 gap-5">
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
      <form
        className="grid min-w-0 gap-5"
        onSubmit={(event) => void submit(event)}
      >
        <div className="grid gap-2">
          <Label htmlFor="register-display-name">{t("displayName")}</Label>
          <div className="relative">
            <UserRound
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="register-display-name"
              aria-describedby={
                fieldErrors.displayName
                  ? "register-display-name-error"
                  : undefined
              }
              aria-invalid={fieldErrors.displayName !== undefined}
              autoComplete="nickname"
              className="h-12 rounded-xl bg-white/76 pl-10"
              maxLength={80}
              name="display_name"
              placeholder={t("displayNamePlaceholder")}
              required
            />
          </div>
          <FieldError
            id="register-display-name-error"
            message={fieldErrors.displayName}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="register-email">{t("email")}</Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="register-email"
              aria-describedby={
                fieldErrors.email ? "register-email-error" : undefined
              }
              aria-invalid={fieldErrors.email !== undefined}
              autoComplete="email"
              className="h-12 rounded-xl bg-white/76 pl-10"
              inputMode="email"
              maxLength={254}
              name="email"
              placeholder="player@example.com"
              required
              type="email"
            />
          </div>
          <FieldError id="register-email-error" message={fieldErrors.email} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="register-password">{t("password")}</Label>
          <div className="relative">
            <LockKeyhole
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="register-password"
              aria-describedby={
                fieldErrors.password
                  ? "register-password-error"
                  : "register-password-hint"
              }
              aria-invalid={fieldErrors.password !== undefined}
              autoComplete="new-password"
              className="h-12 rounded-xl bg-white/76 px-11 pl-10"
              maxLength={REGISTRATION_PASSWORD_MAX_LENGTH}
              minLength={REGISTRATION_PASSWORD_MIN_LENGTH}
              name="password"
              required
              type={showPassword ? "text" : "password"}
            />
            <PasswordVisibilityButton
              label={showPassword ? t("hidePassword") : t("showPassword")}
              onClick={() => setShowPassword((value) => !value)}
              visible={showPassword}
            />
          </div>
          {fieldErrors.password ? (
            <FieldError
              id="register-password-error"
              message={fieldErrors.password}
            />
          ) : (
            <p
              id="register-password-hint"
              className="text-xs leading-5 text-muted-foreground"
            >
              {t("passwordHint")}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="register-password-confirmation">
            {t("confirmPassword")}
          </Label>
          <div className="relative">
            <LockKeyhole
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="register-password-confirmation"
              aria-describedby={
                fieldErrors.confirmation
                  ? "register-password-confirmation-error"
                  : undefined
              }
              aria-invalid={fieldErrors.confirmation !== undefined}
              autoComplete="new-password"
              className="h-12 rounded-xl bg-white/76 px-11 pl-10"
              maxLength={REGISTRATION_PASSWORD_MAX_LENGTH}
              minLength={REGISTRATION_PASSWORD_MIN_LENGTH}
              name="password_confirmation"
              required
              type={showConfirmation ? "text" : "password"}
            />
            <PasswordVisibilityButton
              label={
                showConfirmation ? t("hideConfirmation") : t("showConfirmation")
              }
              onClick={() => setShowConfirmation((value) => !value)}
              visible={showConfirmation}
            />
          </div>
          <FieldError
            id="register-password-confirmation-error"
            message={fieldErrors.confirmation}
          />
        </div>
        <Button
          aria-busy={pending}
          className="h-12 w-full rounded-xl shadow-[0_12px_30px_rgb(40_122_84_/_0.2)]"
          disabled={pending}
          type="submit"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{t("or")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        asChild
        className="h-12 w-full rounded-xl bg-[#1b2838] text-white shadow-[0_12px_30px_rgb(27_40_56_/_0.22)] hover:bg-[#223b52]"
      >
        <a
          href={`/api/auth/steam/start?next=${encodeURIComponent(destination)}`}
        >
          <Image
            alt=""
            aria-hidden="true"
            className="size-5 shrink-0"
            height={20}
            src="/brand/steam-icon.svg"
            unoptimized
            width={20}
          />
          {t("steamSubmit")}
        </a>
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link
          className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
          href={loginHref}
        >
          {t("returnLogin")}
        </Link>
      </p>
    </div>
  );
}

function PasswordVisibilityButton({
  label,
  onClick,
  visible,
}: Readonly<{ label: string; onClick: () => void; visible: boolean }>) {
  return (
    <Button
      aria-label={label}
      className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
      onClick={onClick}
      size="icon"
      type="button"
      variant="ghost"
    >
      {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </Button>
  );
}

function FieldError({
  id,
  message,
}: Readonly<{ id: string; message?: string }>) {
  if (message === undefined) return null;
  return (
    <p
      id={id}
      className="text-xs font-medium leading-5 text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}

function applyRegistrationError(
  code: RegistrationErrorCode | "INVALID_REGISTRATION" | undefined,
  t: (key: RegisterErrorMessageKey) => string,
  setFieldErrors: (errors: FieldErrors) => void,
  setError: (message: string) => void,
) {
  if (code === "INVALID_DISPLAY_NAME") {
    setFieldErrors({ displayName: t("invalidDisplayName") });
  } else if (code === "INVALID_EMAIL") {
    setFieldErrors({ email: t("invalidEmail") });
  } else if (code === "WEAK_PASSWORD") {
    setFieldErrors({ password: t("weakPassword") });
  } else if (code === "PASSWORD_MISMATCH") {
    setFieldErrors({ confirmation: t("passwordMismatch") });
  } else if (code === "EMAIL_UNAVAILABLE") {
    setFieldErrors({ email: t("emailUnavailable") });
  } else {
    setError(t("unavailable"));
  }
}

type RegisterErrorMessageKey =
  | "invalidDisplayName"
  | "invalidEmail"
  | "weakPassword"
  | "passwordMismatch"
  | "emailUnavailable"
  | "unavailable";
