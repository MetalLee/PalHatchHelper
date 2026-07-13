import { StatusBadge } from "@palhatch/ui";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-teal-300/20 bg-slate-950/70 p-8 shadow-2xl shadow-teal-950/40 backdrop-blur md:p-12">
        <StatusBadge status="operational">Phase 0 · Operational</StatusBadge>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
          PalHatch Helper
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
          工程骨架已运行。这里将成长为帕鲁配种协作工作台；当前版本只验证前端、私有
          Agent 与共享契约的开发 Harness。
        </p>
        <dl className="mt-10 grid gap-4 text-sm text-slate-300 sm:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-4">
            <dt className="text-slate-500">Web</dt>
            <dd className="mt-1 text-white">Next.js App Router</dd>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <dt className="text-slate-500">Agent</dt>
            <dd className="mt-1 text-white">FastAPI · private</dd>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <dt className="text-slate-500">Data</dt>
            <dd className="mt-1 text-white">No production access</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
