export function rateColor(rate: number): string {
  if (rate > 0) return "#f44336";
  if (rate < 0) return "#1565c0";
  return "#9e9e9e";
}

export function formatPriceUpdatedAt(updatedAt?: string): string | undefined {
  if (!updatedAt) return undefined;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return undefined;

  const today = new Date();
  const dateKey = date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  const todayKey = today.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  const time = date.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (dateKey === todayKey) {
    return `오늘 ${time}`;
  }

  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}
