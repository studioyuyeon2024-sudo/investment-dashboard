export function formatPrice(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function formatChange(change: number, rate: number): string {
  const sign = change > 0 ? "+" : change < 0 ? "" : "";
  return `${sign}${change.toLocaleString("ko-KR")} (${sign}${rate.toFixed(2)}%)`;
}

export function formatCompactKrw(n: number): string {
  if (n >= 1_000_000_000_000) {
    return `${(n / 1_000_000_000_000).toFixed(1)}조`;
  }
  if (n >= 100_000_000) {
    return `${(n / 100_000_000).toFixed(0)}억`;
  }
  if (n >= 10_000) {
    return `${(n / 10_000).toFixed(0)}만`;
  }
  return n.toLocaleString("ko-KR");
}

export function changeColorClass(change: number): string {
  if (change > 0) return "text-red-600 dark:text-red-500";
  if (change < 0) return "text-blue-600 dark:text-blue-500";
  return "text-muted-foreground";
}
