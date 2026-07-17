"use client";

export default function AdminError({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <section className="state-card border-rose-300/20" role="alert">
      <p className="eyebrow text-rose-200">ADMIN_DATA_UNAVAILABLE</p>
      <h1>管理员数据暂不可用</h1>
      <p>安全边界已保持；页面没有回退到跨用户缓存或高权限密钥。</p>
      <button className="secondary-button mt-4" onClick={reset} type="button">
        重试
      </button>
    </section>
  );
}
