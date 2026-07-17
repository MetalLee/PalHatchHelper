import Link from "next/link";

const items = [
  { href: "/admin", label: "管理员概览" },
  { href: "/admin/bindings", label: "玩家绑定" },
  { href: "/admin/save-parser", label: "存档与 Parser" },
  { href: "/admin/breeding-data", label: "配种数据" },
  { href: "/admin/jobs", label: "任务与 AI" },
  { href: "/admin/settings", label: "系统设置" },
] as const;

export function AdminNavigation({
  activePath,
}: Readonly<{ activePath: string }>) {
  return (
    <nav className="admin-navigation" aria-label="管理员导航">
      {items.map((item) => {
        const active =
          activePath === item.href ||
          (item.href !== "/admin" && activePath.startsWith(`${item.href}/`));
        return (
          <Link
            className={
              active ? "admin-nav-link admin-nav-link-active" : "admin-nav-link"
            }
            aria-current={active ? "page" : undefined}
            href={item.href}
            prefetch={false}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
