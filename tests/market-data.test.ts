import assert from "node:assert/strict";
import test from "node:test";
import { calculateCrossRate, combineMarketTrendPoints } from "../lib/market-data";

test("유로/원과 100엔/원 교차환율을 계산한다", () => {
  assert.ok(Math.abs(calculateCrossRate("eurkrw", 1400, 1.15) - 1610) < 0.000001);
  assert.ok(Math.abs(calculateCrossRate("jpykrw", 1400, 160) - 875) < 0.000001);
});

test("날짜가 일치하는 시장 데이터만 결합한다", () => {
  const combined = combineMarketTrendPoints(
    [
      { date: "2026-08-06", value: 1400 },
      { date: "2026-08-07", value: 1410 },
    ],
    [
      { date: "2026-08-05", value: 1.14 },
      { date: "2026-08-07", value: 1.15 },
    ],
    (left, right) => left * right
  );
  assert.equal(combined.length, 1);
  assert.equal(combined[0]?.date, "2026-08-07");
  assert.ok(Math.abs((combined[0]?.value ?? 0) - 1621.5) < 0.000001);
});

test("유효하지 않은 교차환율은 거부한다", () => {
  assert.throws(() => calculateCrossRate("eurkrw", 0, 1.15), /0보다 큰 숫자/);
  assert.throws(() => calculateCrossRate("jpykrw", 1400, Number.NaN), /0보다 큰 숫자/);
});
