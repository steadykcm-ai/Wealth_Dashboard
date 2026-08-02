import type { DailyLogItem, PortfolioEvent } from "@/lib/types";

export interface PerformancePoint {
  date: string;
  index: number;
}

export function buildPerformancePoints(logs: DailyLogItem[], events: PortfolioEvent[]): PerformancePoint[] {
  const sorted = [...logs].sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length === 0) return [];
  let index = 100;
  const points: PerformancePoint[] = [{ date: sorted[0].date, index }];
  sorted.slice(1).forEach((log, position) => {
    const previous = sorted[position];
    const intervalEvents = events.filter((event) => event.date > previous.date && event.date <= log.date && event.eventType !== "ignored");
    const cashFlow = intervalEvents.reduce((sum, event) => (
      event.eventType === "deposit" || event.eventType === "withdrawal" ? sum + event.amount : sum
    ), 0);
    const adjustment = intervalEvents.reduce((sum, event) => (
      event.eventType === "valuation_adjustment" ? sum + event.amount : sum
    ), 0);
    if (previous.total.total > 0) {
      index *= 1 + ((log.total.total - cashFlow - adjustment - previous.total.total) / previous.total.total);
    }
    points.push({ date: log.date, index });
  });
  return points;
}
