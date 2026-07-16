import Link from "next/link";

const primaryItems = [
  { href: "/overview", label: "概览", glyph: "◫" },
  { href: "/pals", label: "帕鲁", glyph: "◇" },
  { href: "/breeder", label: "配种器", glyph: "△" },
  { href: "/plans", label: "计划", glyph: "□" },
] as const;

const utilityItems = [
  { href: "/data-status", label: "数据状态", glyph: "●" },
  { href: "/account", label: "账号", glyph: "○" },
] as const;

const mobileItems = [...primaryItems, utilityItems[0]] as const;

function NavigationLink({
  href,
  label,
  glyph,
  activePath,
  mobile = false,
}: Readonly<{
  href: string;
  label: string;
  glyph: string;
  activePath: string;
  mobile?: boolean;
}>) {
  const active = activePath === href || activePath.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        mobile
          ? `mobile-nav-link ${active ? "mobile-nav-link-active" : ""}`
          : `side-nav-link ${active ? "side-nav-link-active" : ""}`
      }
    >
      <span aria-hidden="true" className="text-base">
        {glyph}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function AppNavigation({
  activePath,
  displayName,
}: Readonly<{ activePath: string; displayName: string }>) {
  return (
    <>
      <aside className="desktop-sidebar" aria-label="主导航">
        <Link
          href="/overview"
          className="brand-lockup"
          aria-label="PalHatch 首页"
        >
          <span className="brand-mark" aria-hidden="true">
            PH
          </span>
          <span>
            <strong>PalHatch</strong>
            <small>BREEDING DESK</small>
          </span>
        </Link>
        <nav className="mt-10 grid gap-2">
          {primaryItems.map((item) => (
            <NavigationLink key={item.href} {...item} activePath={activePath} />
          ))}
        </nav>
        <nav className="mt-auto grid gap-2 border-t border-white/8 pt-5">
          {utilityItems.map((item) => (
            <NavigationLink key={item.href} {...item} activePath={activePath} />
          ))}
          <p className="mt-3 truncate px-3 text-xs text-slate-500">
            {displayName}
          </p>
        </nav>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="移动端导航">
        {mobileItems.map((item) => (
          <NavigationLink
            key={item.href}
            {...item}
            activePath={activePath}
            mobile
          />
        ))}
      </nav>
    </>
  );
}
