import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { InvestmentDisclaimer } from "@/components/investment-disclaimer";
import {
  checkServices,
  FEATURES,
  type ServiceState,
  type FeatureStatus,
} from "@/lib/system-status";

export const dynamic = "force-dynamic";

export default function Home() {
  const services = checkServices();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 md:gap-12 md:px-6 md:py-16">
      <Hero />
      <FeaturesSection />
      <QuickAccess />
      <StatusSection services={services} />
      <InvestmentDisclaimer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-neutral-50 via-white to-neutral-100 p-8 md:p-12 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-800">
      <div className="relative space-y-5">
        <Badge variant="outline" className="font-mono text-xs">
          Phase 1 · Week 1
        </Badge>
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            투자에서 이기는 첫걸음은
            <br />
            <span className="text-muted-foreground">잃지 않는 것입니다.</span>
          </h1>
          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            한국 주식 포트폴리오를 AI 와 함께 관리하세요. 실시간 시세·자동
            스크리너·AI 분석·카카오 알림을 하나의 대시보드에서.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "default", size: "lg" })}
          >
            내 포트폴리오 열기
          </Link>
          <Link
            href="/screener"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            스크리너 결과 보기
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="주요 기능"
        subtitle="조립형으로 쌓아 올린 개인용 투자 도구"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {FEATURES.map((f) => (
          <FeatureCard key={f.key} feature={f} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: FeatureStatus }) {
  const badge = STATUS_BADGE[feature.status];
  const body = (
    <Card className="group h-full transition-colors hover:border-foreground/30">
      <CardContent className="flex h-full flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold">{feature.label}</h3>
          <Badge variant={badge.variant} className="shrink-0 text-xs">
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${badge.dot}`}
            />
            {badge.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{feature.description}</p>
        {feature.href && feature.status === "live" && (
          <span className="mt-auto pt-2 text-xs text-foreground/60 group-hover:text-foreground">
            바로가기 →
          </span>
        )}
      </CardContent>
    </Card>
  );

  if (feature.href && feature.status === "live") {
    return (
      <Link href={feature.href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}

const STATUS_BADGE: Record<
  FeatureStatus["status"],
  {
    label: string;
    variant: "default" | "secondary" | "outline";
    dot: string;
  }
> = {
  live: { label: "운영 중", variant: "default", dot: "bg-green-500" },
  partial: { label: "일부 구현", variant: "secondary", dot: "bg-amber-500" },
  planned: { label: "예정", variant: "outline", dot: "bg-neutral-400" },
};

function QuickAccess() {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="빠른 분석"
        subtitle="포트폴리오에 등록하지 않아도 티커로 바로 분석 가능"
      />
      <Card>
        <CardContent className="flex flex-wrap gap-2 p-5">
          {QUICK_TICKERS.map((t) => (
            <Link
              key={t.ticker}
              href={`/holdings/${t.ticker}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t.name} <span className="ml-1.5 font-mono text-xs text-muted-foreground">{t.ticker}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

const QUICK_TICKERS = [
  { ticker: "005930", name: "삼성전자" },
  { ticker: "000660", name: "SK하이닉스" },
  { ticker: "035720", name: "카카오" },
  { ticker: "069500", name: "KODEX 200" },
  { ticker: "229200", name: "KODEX 코스닥150" },
] as const;

function StatusSection({ services }: { services: ServiceState[] }) {
  const configuredRequired = services.filter(
    (s) => s.required && s.configured,
  ).length;
  const totalRequired = services.filter((s) => s.required).length;

  return (
    <section className="space-y-4">
      <SectionHeader
        title="세팅 현황"
        subtitle={`필수 서비스 ${configuredRequired}/${totalRequired} 연결됨`}
      />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <ServiceRow key={s.key} service={s} />
        ))}
      </div>
    </section>
  );
}

function ServiceRow({ service }: { service: ServiceState }) {
  const tone = service.configured
    ? "border-green-500/30 bg-green-500/5"
    : service.required
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-border bg-muted/30";

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              service.configured
                ? "bg-green-500"
                : service.required
                  ? "bg-amber-500"
                  : "bg-neutral-400"
            }`}
          />
          <span className="text-sm font-medium">{service.label}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {service.configured
            ? "연결됨"
            : service.required
              ? "필수 · 미설정"
              : "선택"}
        </span>
      </div>
      <p className="mt-1 pl-4 text-xs text-muted-foreground">
        {service.description}
      </p>
      {!service.configured && service.missingVars.length > 0 && (
        <p className="mt-2 pl-4 font-mono text-[10px] text-muted-foreground">
          누락: {service.missingVars.join(", ")}
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
