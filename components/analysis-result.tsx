import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/lib/claude/prompts";
import { formatPrice } from "@/lib/format";

const RECOMMENDATION_LABEL: Record<AnalysisResult["recommendation"], string> = {
  hold: "보유 유지",
  partial_buy: "부분 매수",
  partial_sell: "부분 매도",
  full_sell: "전량 매도",
};

const RECOMMENDATION_VARIANT: Record<
  AnalysisResult["recommendation"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  hold: "secondary",
  partial_buy: "default",
  partial_sell: "outline",
  full_sell: "destructive",
};

const CONFIDENCE_LABEL: Record<AnalysisResult["confidence"], string> = {
  high: "확신도 높음",
  medium: "확신도 보통",
  low: "확신도 낮음",
};

export function AnalysisResultCard({
  result,
  meta,
}: {
  result: AnalysisResult;
  meta: { cached: boolean; model: string; cost_krw: number };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-lg">AI 분석 결과</CardTitle>
          <div className="flex gap-2">
            <Badge variant={RECOMMENDATION_VARIANT[result.recommendation]}>
              {RECOMMENDATION_LABEL[result.recommendation]}
            </Badge>
            <Badge variant="outline">{CONFIDENCE_LABEL[result.confidence]}</Badge>
            {meta.cached && <Badge variant="outline">캐시 응답</Badge>}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{meta.model}</div>
          <div>비용 ≈ {meta.cost_krw}원</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h3 className="mb-1 font-semibold">핵심 근거</h3>
          <p className="leading-relaxed text-muted-foreground">
            {result.reasoning}
          </p>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">실행 계획</h3>
          <dl className="grid grid-cols-1 gap-y-1 md:grid-cols-2 md:gap-x-6">
            <Row label="오늘 할 일" value={result.action_plan.immediate} />
            <Row
              label="손절선"
              value={
                result.action_plan.stop_loss !== null
                  ? `${formatPrice(result.action_plan.stop_loss)}원`
                  : "—"
              }
            />
            <Row
              label="익절선"
              value={
                result.action_plan.take_profit !== null
                  ? `${formatPrice(result.action_plan.take_profit)}원`
                  : "—"
              }
            />
            <Row label="재점검" value={result.action_plan.review_at} />
          </dl>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">리스크</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {result.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
