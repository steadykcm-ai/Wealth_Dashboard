import assert from "node:assert/strict";
import test from "node:test";
import { calculateRetirementScenario } from "../lib/retirement-calculator";
import type { RetirementSettings } from "../lib/types";

function settings(overrides: Partial<RetirementSettings> = {}): RetirementSettings {
  return {
    currentAge: 60,
    retirementAge: 60,
    lifeExpectancy: 70,
    monthlyContribution: 0,
    monthlyLivingCost: 1_000_000,
    publicPensionMonthly: 0,
    publicPensionStartAge: 65,
    privatePensionStartAge: 60,
    pensionContributionRatio: 60,
    monthlyContributionAfterRetirement: 0,
    withdrawalPriority: "taxable_first",
    expectedReturnRate: 0,
    inflationRate: 0,
    ...overrides,
  };
}

test("무수익 환경에서 10년 생활비와 같은 자산은 목표를 정확히 충족한다", () => {
  const result = calculateRetirementScenario(120_000_000, 0, settings(), 0, "기준");
  assert.equal(result.projectedAssets, 120_000_000);
  assert.equal(result.targetAssets, 120_000_000);
  assert.equal(result.fundingRate, 100);
  assert.equal(result.monthlyIncome, 1_000_000);
  assert.equal(result.depletionAge, null);
});

test("공적연금이 생활비를 충족하면 필요 목표자산은 0이다", () => {
  const result = calculateRetirementScenario(
    10_000_000,
    20_000_000,
    settings({ publicPensionMonthly: 1_000_000, publicPensionStartAge: 60 }),
    0,
    "기준"
  );
  assert.equal(result.targetAssets, 0);
  assert.equal(result.fundingRate, 100);
  assert.equal(result.depletionAge, null);
});

test("은퇴 전 납입금은 설정한 연금 비율로 배분된다", () => {
  const result = calculateRetirementScenario(
    10_000_000,
    20_000_000,
    settings({
      currentAge: 50,
      retirementAge: 60,
      monthlyContribution: 1_000_000,
      pensionContributionRatio: 60,
    }),
    0,
    "기준"
  );
  assert.equal(result.projectedStockAssets, 58_000_000);
  assert.equal(result.projectedPensionAssets, 92_000_000);
});
