"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationCenter } from "./notification-center";

// 페이지별 사용자 친화 라벨.
const PAGE_TITLES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === "/", title: "홈" },
  { match: (p) => p === "/dashboard", title: "내 포트폴리오" },
  { match: (p) => p === "/screener", title: "스크리너" },
  { match: (p) => p.startsWith("/holdings/"), title: "종목 분석" },
  { match: (p) => p === "/login", title: "카카오 연결" },
];

function resolveTitle(pathname: string): string {
  return PAGE_TITLES.find((p) => p.match(pathname))?.title ?? "investment-dashboard";
}

export function AppHeader() {
  const pathname = usePathname();
  const title = resolveTitle(pathname);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:underline"
            aria-label="홈"
          >
            잃지 않는 투자
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · {title}
          </span>
        </div>
        <NotificationCenter />
      </div>
    </header>
  );
}
