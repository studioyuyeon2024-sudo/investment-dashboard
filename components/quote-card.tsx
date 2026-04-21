import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { KisQuote } from "@/lib/kis/types";
import {
  changeColorClass,
  formatChange,
  formatCompactKrw,
  formatPrice,
} from "@/lib/format";

export function QuoteCard({ quote }: { quote: KisQuote }) {
  const color = changeColorClass(quote.change);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">
          {quote.name || quote.ticker}{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {quote.ticker}
          </span>
        </CardTitle>
        <Badge variant="secondary">KRX</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold">
            {formatPrice(quote.price)}원
          </span>
          <span className={`text-sm font-medium ${color}`}>
            {formatChange(quote.change, quote.change_rate)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Row label="시가" value={`${formatPrice(quote.open)}원`} />
          <Row label="전일종가" value={`${formatPrice(quote.prev_close)}원`} />
          <Row label="고가" value={`${formatPrice(quote.high)}원`} />
          <Row label="저가" value={`${formatPrice(quote.low)}원`} />
          <Row label="거래량" value={`${formatPrice(quote.volume)}주`} />
          <Row label="거래대금" value={`${formatCompactKrw(quote.trade_value)}원`} />
          {quote.market_cap !== null && (
            <Row
              label="시가총액"
              value={`${formatCompactKrw(quote.market_cap)}원`}
            />
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
