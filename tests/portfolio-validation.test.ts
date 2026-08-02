import assert from "node:assert/strict";
import test from "node:test";
import { validatePortfolioSummary } from "../lib/portfolio-validation";
import type { AccountGroup, AssetGroup, AssetItem, AssetSummary } from "../lib/types";

const NOW = new Date("2026-08-02T12:00:00.000Z").getTime();

function createSummary(): AssetSummary {
  const item: AssetItem = {
    id: 1,
    code: "005930.KS",
    name: "테스트 종목",
    quantity: 10,
    avgPrice: 900,
    currentPrice: 1_000,
    priceUpdatedAt: "2026-08-02T09:00:00.000Z",
    valuationMode: "market",
    investAmount: 9_000,
    currentValue: 10_000,
    profitLoss: 1_000,
    returnRate: 11.11,
  };
  const account: AccountGroup = {
    name: "테스트 계좌",
    totalInvest: 9_000,
    totalValue: 10_500,
    cash: 500,
    totalProfitLoss: 1_000,
    returnRate: 11.11,
    items: [item],
    insertRowIndex: 0,
  };
  const group: AssetGroup = {
    category: "개별주식",
    items: [item],
    totalInvest: 9_000,
    totalValue: 10_500,
    cash: 500,
    totalProfitLoss: 1_000,
    returnRate: 11.11,
    accounts: [account],
  };
  return {
    totalInvest: 9_000,
    totalValue: 10_700,
    unallocatedCash: 200,
    totalProfitLoss: 1_000,
    returnRate: 11.11,
    priceUpdatedAt: item.priceUpdatedAt,
    groups: [group],
  };
}

test("정상 자산은 모든 계산과 기준일 검사를 통과한다", () => {
  const report = validatePortfolioSummary(createSummary(), NOW);
  assert.equal(report.calculationIssues, 0);
  assert.equal(report.freshnessIssues, 0);
  assert.equal(report.calculationChecks, 6);
});

test("미분류 현금을 포함해 전체 합계를 검증한다", () => {
  const summary = createSummary();
  summary.totalValue -= summary.unallocatedCash ?? 0;
  const report = validatePortfolioSummary(summary, NOW);
  assert.equal(report.calculationIssues, 1);
  assert.equal(report.issues[0]?.id, "summary-total-value");
  assert.equal(report.issues[0]?.difference, -200);
});

test("계좌 오류가 계좌와 분류 단계에 전파된 것을 함께 찾는다", () => {
  const summary = createSummary();
  summary.groups[0].accounts[0].totalValue += 100;
  const report = validatePortfolioSummary(summary, NOW);
  assert.deepEqual(
    report.issues.filter((issue) => issue.kind === "calculation").map((issue) => issue.id),
    ["group-accounts-개별주식", "account-value-개별주식-테스트 계좌"]
  );
});

test("오래된 현재가와 기준일 누락을 구분한다", () => {
  const staleSummary = createSummary();
  staleSummary.groups[0].items[0].priceUpdatedAt = "2026-07-20T09:00:00.000Z";
  const staleReport = validatePortfolioSummary(staleSummary, NOW);
  assert.equal(staleReport.freshnessIssues, 1);
  assert.match(staleReport.issues.find((issue) => issue.kind === "freshness")?.title ?? "", /오래됨/);

  const missingSummary = createSummary();
  missingSummary.groups[0].items[0].priceUpdatedAt = undefined;
  const missingReport = validatePortfolioSummary(missingSummary, NOW);
  assert.equal(missingReport.freshnessIssues, 1);
  assert.equal(missingReport.issues.find((issue) => issue.kind === "freshness")?.severity, "critical");
});
