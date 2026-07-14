"use client";

export function SignOutButton() {
  return (
    <button
      className="secondary-button"
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
        window.location.assign("/login");
      }}
    >
      退出登录
    </button>
  );
}
