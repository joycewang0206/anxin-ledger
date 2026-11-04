"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/", label: "首頁", icon: "🏠" },
  { href: "/income/new", label: "新增收入", icon: "💰" },
  { href: "/expense/new", label: "新增支出", icon: "🧾" },
  { href: "/records", label: "收支紀錄", icon: "📋" },
  { href: "/debts", label: "債務管理", icon: "👛" },
  { href: "/settings", label: "設定", icon: "⚙️" },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-2">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 font-bold no-underline ${
                active ? "border-balance bg-balance text-white" : "border-transparent bg-white text-ink"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
