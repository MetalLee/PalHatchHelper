import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            PH
          </span>
          <span>
            <strong>PalHatch</strong>
            <small>BREEDING DESK</small>
          </span>
        </div>
        <p className="eyebrow mt-10">SECURE INVENTORY WORKSPACE</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          回到你的帕鲁工作台
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          登录后只会读取当前账号经 RLS/RPC 授权的脱敏库存范围。
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
