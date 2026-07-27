import { ShieldCheck } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { brand } from "@/config/brand";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      <ForestScenery variant="page" />
      <div className="relative z-10 mx-auto grid min-h-dvh w-full max-w-[90rem] items-center gap-8 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,31rem)] lg:gap-14 lg:px-10">
        <section className="hidden max-w-2xl rounded-[2rem] bg-white/28 p-8 text-foreground backdrop-blur-[2px] lg:block">
          <div className="flex items-center gap-3">
            <BrandLogo size={56} priority />
            <div>
              <p className="text-xl font-bold tracking-tight">
                <BrandWordmark />
              </p>
              <p className="text-sm text-muted-foreground">
                {brand.productName}
              </p>
            </div>
          </div>
          <p className="mt-10 max-w-xl font-bold text-forest">
            <span className="block text-4xl tracking-[-0.04em]">
              {brand.englishTagline}
            </span>
            <span className="mt-2 block text-2xl tracking-[-0.025em]">
              {brand.tagline}
            </span>
          </p>
          <p className="mt-5 max-w-lg text-base leading-8 text-muted-foreground">
            集中查看服务器数据状态、帕鲁库存与配种计划，让每一次同步和培育都有迹可循。
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/64 px-4 py-2 text-sm font-semibold text-primary shadow-sm">
            <ShieldCheck aria-hidden="true" className="size-4" />
            安全连接的你帕鲁世界
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
                {brand.productName}
              </p>
            </div>
          </div>
          <p className="mt-8 text-xs font-bold tracking-[0.16em] text-primary uppercase lg:mt-0">
            {brand.englishProductName.toUpperCase()}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl">
            欢迎回到服务器控制台
          </h1>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
