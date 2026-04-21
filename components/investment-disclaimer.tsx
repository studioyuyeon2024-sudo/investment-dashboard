import { AlertTriangle } from "lucide-react";

export function InvestmentDisclaimer() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">투자 참고용, 투자 자문 아님</p>
        <p className="mt-0.5 leading-snug">
          본 분석은 AI 기반 참고 자료이며 매매 권유가 아닙니다. 모든 투자 결정과
          결과는 본인의 책임입니다.
        </p>
      </div>
    </div>
  );
}
