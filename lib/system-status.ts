/**
 * 외부 서비스 연결 상태 체크.
 *
 * 서버 전용 — 환경 변수는 Next.js 에서 서버 컴포넌트에서만 안전하게 읽을 수 있음.
 * 실제 네트워크 호출은 하지 않고 env 존재 여부만 본다 (랜딩 페이지 지연 방지).
 */

export type ServiceConfig = {
  key: string;
  label: string;
  description: string;
  envVars: string[];
  required: boolean;
};

export type ServiceState = ServiceConfig & {
  configured: boolean;
  missingVars: string[];
};

const SERVICES: ServiceConfig[] = [
  {
    key: "supabase",
    label: "Supabase",
    description: "DB · 분석 캐시 · 토큰 보관",
    envVars: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    required: true,
  },
  {
    key: "anthropic",
    label: "Claude API",
    description: "AI 분석 엔진 (Haiku / Sonnet / Opus 라우팅)",
    envVars: ["ANTHROPIC_API_KEY"],
    required: true,
  },
  {
    key: "kis",
    label: "한국투자증권",
    description: "실시간 KRX 시세 (주문 기능은 미구현)",
    // 시세·일봉 조회만 하므로 APP_KEY/APP_SECRET 만 필수.
    // ACCOUNT_NUMBER 는 주문·잔고 조회 시 필요하나 본 프로젝트는 자동 매매 미지원.
    envVars: ["KIS_APP_KEY", "KIS_APP_SECRET"],
    required: true,
  },
  {
    key: "kakao",
    label: "카카오톡",
    description: "손절·익절 도달 시 나에게 보내기",
    envVars: ["KAKAO_REST_API_KEY", "KAKAO_CLIENT_SECRET"],
    required: false,
  },
  {
    key: "dart",
    label: "DART 공시",
    description: "공시·재무 데이터 (Phase 2)",
    envVars: ["DART_API_KEY"],
    required: false,
  },
];

export function checkServices(): ServiceState[] {
  return SERVICES.map((s) => {
    const missing = s.envVars.filter((v) => !process.env[v]);
    return {
      ...s,
      configured: missing.length === 0,
      missingVars: missing,
    };
  });
}

export type FeatureStatus = {
  key: string;
  label: string;
  description: string;
  status: "live" | "partial" | "planned";
  href?: string;
};

// 코드베이스 기준 기능 구현 현황. 새 기능 추가 시 이 배열 갱신.
export const FEATURES: FeatureStatus[] = [
  {
    key: "portfolio",
    label: "포트폴리오 수익률",
    description: "평가금액·미실현 손익·벤치마크(KODEX 200 / 코스닥150) 비교",
    status: "live",
    href: "/dashboard",
  },
  {
    key: "screener",
    label: "스크리너 (중기 스윙)",
    description: "KOSPI200 + KOSDAQ150 에서 주 2회 자동 후보 3개",
    status: "live",
    href: "/screener",
  },
  {
    key: "analysis",
    label: "AI 분석",
    description: "개별종목 / ETF 분기 프롬프트, 진입·손절·익절·리스크",
    status: "live",
  },
  {
    key: "catalog",
    label: "종목 카탈로그",
    description: "KRX 전종목 이름 사전 (월 1회 자동 적재, 약 2,700개)",
    status: "live",
  },
  {
    key: "alerts",
    label: "카카오 알림",
    description: "손절/익절 근접, 급등락, 분배락 전일 등 자동 발송",
    status: "planned",
  },
  {
    key: "backtest",
    label: "스크리너 성과 추적",
    description: "과거 pick 들의 수익률 집계로 알고리즘 품질 검증",
    status: "planned",
  },
];
