// 숫자 포맷: 억 이상 "억" 단위 축약, 원화는 정수 반올림
export function formatKRW(value: number): string {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  if (abs >= 100_000_000) {
    const eok = rounded / 100_000_000;
    return `${eok.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억`;
  }
  return rounded.toLocaleString("ko-KR");
}

export function formatRate(rate: number): string {
  return `${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%`;
}
