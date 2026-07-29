import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { BrandLogo } from "@/components/brand/brand-logo";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { brand } from "@/config/brand";
import { isAppLocale } from "@/i18n/routing";

import { LoginForm } from "./login-form";
import { isPasswordLoginEnabled } from "@/features/auth/password-login";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ next?: string; error?: string }>;
}>) {
  const { locale } = await params;
  const query = await searchParams;
  if (!isAppLocale(locale)) notFound();
  const [brandCopy, login] = await Promise.all([
    getTranslations({ locale, namespace: "Brand" }),
    getTranslations({ locale, namespace: "Login" }),
  ]);
  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      <ForestScenery variant="page" />
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 sm:right-6">
        <LocaleSwitcher />
      </div>
      <div className="relative z-10 mx-auto grid min-h-dvh w-full max-w-[90rem] items-center gap-8 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,31rem)] lg:gap-14 lg:px-10">
        <section className="hidden max-w-2xl p-8 text-foreground lg:block">
          <div className="flex items-center gap-3">
            <BrandLogo size={56} priority />
            <div>
              <p className="text-xl font-bold tracking-tight">
                <BrandWordmark />
              </p>
              <p className="text-sm text-muted-foreground">
                {brandCopy("productName")}
              </p>
            </div>
          </div>
          <p className="mt-10 max-w-xl font-bold text-forest">
            <span className="block text-4xl tracking-[-0.04em]">
              {brand.englishTagline}
            </span>
            <span className="mt-2 block text-2xl tracking-[-0.025em]">
              {brandCopy("tagline")}
            </span>
          </p>
          <p className="mt-5 max-w-lg text-base leading-8 text-muted-foreground">
            {brandCopy("description")}
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/64 px-4 py-2 text-sm font-semibold text-primary shadow-sm">
            <ShieldCheck aria-hidden="true" className="size-4" />
            {brandCopy("secureWorld")}
          </div>
        </section>

        <section className="w-full max-w-[31rem] justify-self-center rounded-[2rem] border border-glass-border bg-white/74 p-5 shadow-soft backdrop-blur-xl sm:p-8 lg:justify-self-end">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandLogo size={44} priority />
            <div>
              <p className="font-bold text-foreground">
                <BrandWordmark />
              </p>
              <p className="text-xs text-muted-foreground">
                {brandCopy("productName")}
              </p>
            </div>
          </div>
          <p className="mt-8 text-xs font-bold tracking-[0.16em] text-primary uppercase lg:mt-0">
            {brand.englishProductName.toUpperCase()}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl">
            {login("welcome")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {login("subtitle")}
          </p>
          <LoginForm
            passwordLoginEnabled={isPasswordLoginEnabled()}
            next={query.next}
            initialErrorCode={query.error}
          />
        </section>
      </div>
    </main>
  );
}
