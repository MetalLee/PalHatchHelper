import { ShieldCheck, Sprout } from "lucide-react";

import { ForestScenery } from "@/components/surfaces/forest-scenery";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      <ForestScenery variant="page" />
      <div className="relative z-10 mx-auto grid min-h-dvh w-full max-w-[90rem] items-center gap-8 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,31rem)] lg:gap-14 lg:px-10">
        <section className="hidden max-w-2xl rounded-[2rem] bg-white/28 p-8 text-foreground backdrop-blur-[2px] lg:block">
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-white/72 text-primary shadow-soft">
              <Sprout aria-hidden="true" className="size-8" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-xl font-bold tracking-tight">
                PalHatch Helper
              </p>
              <p className="text-sm text-muted-foreground">
                帕鲁配种协作工作台
              </p>
            </div>
          </div>
          <p className="mt-10 max-w-xl text-4xl font-bold tracking-[-0.04em] text-forest">
            安全同步库存，
            <br />
            清楚比较并收藏每一条路线。
          </p>
          <p className="mt-5 max-w-lg text-base leading-8 text-muted-foreground">
            用固定数据版本计算确定性路线，与公会伙伴协作，并由你亲自确认每一步真实结果。
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/64 px-4 py-2 text-sm font-semibold text-primary shadow-sm">
            <ShieldCheck aria-hidden="true" className="size-4" />
            源存档只读，浏览器仅访问授权后的脱敏数据
          </div>
        </section>

        <section className="w-full max-w-[31rem] justify-self-center rounded-[2rem] border border-glass-border bg-white/74 p-5 shadow-soft backdrop-blur-xl sm:p-8 lg:justify-self-end">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-2xl bg-accent text-primary">
              <Sprout aria-hidden="true" className="size-6" />
            </span>
            <div>
              <p className="font-bold text-foreground">PalHatch Helper</p>
              <p className="text-xs text-muted-foreground">
                帕鲁配种协作工作台
              </p>
            </div>
          </div>
          <p className="mt-8 text-xs font-bold tracking-[0.16em] text-primary uppercase lg:mt-0">
            Secure workspace
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl">
            欢迎回到配种工作台
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            登录后只会读取当前账号经 RLS/RPC 授权的脱敏库存范围。
          </p>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
