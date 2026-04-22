"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  LineChartIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  Icon: typeof HomeIcon;
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "포트폴리오",
    match: (p) => p === "/dashboard" || p.startsWith("/holdings/"),
    Icon: HomeIcon,
  },
  {
    href: "/screener",
    label: "스크리너",
    match: (p) => p === "/screener",
    Icon: LineChartIcon,
  },
  {
    href: "/",
    label: "종목찾기",
    match: (p) => p === "/",
    Icon: SearchIcon,
  },
  {
    href: "/login",
    label: "설정",
    match: (p) => p === "/login",
    Icon: SettingsIcon,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md md:hidden"
      aria-label="주요 탐색"
    >
      <ul className="mx-auto flex max-w-5xl items-stretch">
        {NAV.map((n) => {
          const active = n.match(pathname);
          return (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <n.Icon
                  className={`h-5 w-5 ${active ? "scale-110" : ""}`}
                  strokeWidth={active ? 2.4 : 1.6}
                  aria-hidden
                />
                <span className={active ? "font-medium" : ""}>{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* iOS 홈 인디케이터 safe area */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
