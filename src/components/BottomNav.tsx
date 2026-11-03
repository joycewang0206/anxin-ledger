"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 手機版底部固定導覽列：4 個大按鈕。
const ITEMS = [
  { href: "/", label: "首頁", icon: "🏠", match: (p: string) => p === "/" },
  { href: "/add", label: "記帳", icon: "✏️", match: (p: string) => ["/add", "/income", "/expense", "/records"].some((x) => p.startsWith(x)) },
  { href: "/debts", label: "債務", icon: "👛", match: (p: string) => p.startsWith("/debts") },
  { href: "/settings", label: "設定", icon: "⚙️", match: (p: string) => p.startsWith("/settings") },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="手機主選單"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-paper lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[68px] flex-col items-center justify-center gap-0.5 px-0.5 font-extrabold no-underline ${
                  active ? "bg-balance text-white" : "text-ink"
                }`}
              >
                <span aria-hidden="true" className="text-[1.5rem] leading-none">
                  {item.icon}
                </span>
                <span className="text-[0.75rem] leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
