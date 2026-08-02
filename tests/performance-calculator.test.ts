import assert from "node:assert/strict";
import test from "node:test";
import { buildPerformancePoints } from "../lib/performance-calculator";
import type { CategorySnapshot, DailyLogItem, PortfolioEvent } from "../lib/types";

function snapshot(total: number): CategorySnapshot {
  return { invest: total, value: total, profit: 0, total };
}

function log(date: string, total: number): DailyLogItem {
  return {
    date,
    total: snapshot(total),
    stocks: snapshot(total),
    pension: snapshot(0),
    blockchain: snapshot(0),
    crypto: snapshot(0),
    accounts: [],
  };
}

function event(eventType: PortfolioEvent["eventType"], amount: number): PortfolioEvent {
  return {
    id: 1,
    date: "2026-08-02",
    category: "stocks",
    accountName: "테스트 계좌",
    detectedAmount: amount,
    amount,
    eventType,
  };
}

function assertClose(actual: number | undefined, expected: number): void {
  assert.ok(typeof actual === "number" && Math.abs(actual - expected) < 0.000001);
}

test("입출금이 없는 자산 증가는 투자성과로 반영된다", () => {
  const points = buildPerformancePoints([log("2026-08-01", 100), log("2026-08-02", 110)], []);
  assertClose(points.at(-1)?.index, 110);
});

test("입금과 평가조정은 투자성과에서 제외된다", () => {
  const logs = [log("2026-08-01", 100), log("2026-08-02", 115)];
  const points = buildPerformancePoints(logs, [event("deposit", 10), event("valuation_adjustment", 5)]);
  assertClose(points.at(-1)?.index, 100);
});

test("출금 후 동일한 투자성과를 유지한다", () => {
  const points = buildPerformancePoints(
    [log("2026-08-01", 100), log("2026-08-02", 90)],
    [event("withdrawal", -10)]
  );
  assertClose(points.at(-1)?.index, 100);
});
