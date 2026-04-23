"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 대시보드 자동 새로고침 토글.
 * 기본 off (배터리/네트워크 고려). 켜면 N초마다 router.refresh() 호출.
 * 장 시간 (KST 09:00~15:30, 월~금) 에만 의미 있으므로 그 외엔 hint.
 *
 * localStorage 로 사용자 선호 유지.
 */

const STORAGE_KEY = "dashboard_auto_refresh";
const INTERVAL_SEC = 30;

export function AutoRefreshToggle() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(INTERVAL_SEC);
  const mountedRef = useRef(false);

  // 초기 로드: localStorage 에서 선호 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "on") setEnabled(true);
    mountedRef.current = true;
  }, []);

  // 토글 시 저장
  useEffect(() => {
    if (!mountedRef.current) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  }, [enabled]);

  // 카운트다운 + refresh 트리거
  useEffect(() => {
    if (!enabled) {
      setSecondsLeft(INTERVAL_SEC);
      return;
    }
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          router.refresh();
          return INTERVAL_SEC;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [enabled, router]);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={() => setEnabled((v) => !v)}
      >
        <RefreshCwIcon
          className={`mr-1 h-3.5 w-3.5 ${enabled ? "animate-spin-slow" : ""}`}
        />
        자동 새로고침 {enabled ? "켜짐" : "꺼짐"}
      </Button>
      {enabled && (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {secondsLeft}초 후 갱신
        </span>
      )}
    </div>
  );
}
