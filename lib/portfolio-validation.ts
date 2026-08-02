import type { AssetItem, AssetSummary } from "@/lib/types";

export type PortfolioValidationSeverity = "critical" | "warning";
export type PortfolioValidationKind = "calculation" | "freshness";

export interface PortfolioValidationIssue {
  id: string;
  kind: PortfolioValidationKind;
  severity: PortfolioValidationSeverity;
  title: string;
  detail: string;
  difference?: number;
}

export interface PortfolioValidationReport {
  calculationChecks: number;
  calculationIssues: number;
  freshnessChecks: number;
  freshnessIssues: number;
  issues: PortfolioValidationIssue[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function amountsDiffer(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) >= 1;
}

function amountIssue(
  id: string,
  title: string,
  actual: number,
  expected: number
): PortfolioValidationIssue | null {
  if (!amountsDiffer(actual, expected)) return null;
  const difference = actual - expected;
  return {
    id,
    kind: "calculation",
    severity: "critical",
    title,
    detail: `표시 금액 ${Math.round(actual).toLocaleString("ko-KR")}원 · 재계산 ${Math.round(expected).toLocaleString("ko-KR")}원`,
    difference,
  };
}

function freshnessIssue(item: AssetItem, nowMs: number): PortfolioValidationIssue | null {
  const isManual = item.valuationMode === "manual";
  const updatedAt = isManual ? item.valuationUpdatedAt : item.priceUpdatedAt;
  const thresholdDays = isManual ? 45 : 5;

  if (!updatedAt) {
    return {
      id: `freshness-missing-${item.id ?? item.name}`,
      kind: "freshness",
      severity: isManual ? "warning" : "critical",
      title: `${item.name} 기준일 누락`,
      detail: isManual ? "수동 평가일이 기록되지 않았습니다." : "현재가 갱신 시각이 기록되지 않았습니다.",
    };
  }

  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) {
    return {
      id: `freshness-invalid-${item.id ?? item.name}`,
      kind: "freshness",
      severity: "warning",
      title: `${item.name} 기준일 오류`,
      detail: "저장된 갱신 시각을 해석할 수 없습니다.",
    };
  }

  const elapsedDays = Math.floor((nowMs - updatedMs) / DAY_MS);
  if (elapsedDays <= thresholdDays) return null;

  return {
    id: `freshness-stale-${item.id ?? item.name}`,
    kind: "freshness",
    severity: "warning",
    title: `${item.name} ${isManual ? "수동평가" : "현재가"} 오래됨`,
    detail: `마지막 갱신 후 ${elapsedDays}일이 지났습니다.`,
  };
}

export function validatePortfolioSummary(
  summary: AssetSummary,
  nowMs = Date.now()
): PortfolioValidationReport {
  const issues: PortfolioValidationIssue[] = [];
  let calculationChecks = 0;
  let freshnessChecks = 0;

  const expectedSummaryValue = summary.groups.reduce((sum, group) => sum + group.totalValue, 0)
    + (summary.unallocatedCash ?? 0);
  calculationChecks += 1;
  const summaryValueIssue = amountIssue(
    "summary-total-value",
    "전체 자산 합계 불일치",
    summary.totalValue,
    expectedSummaryValue
  );
  if (summaryValueIssue) issues.push(summaryValueIssue);

  const expectedSummaryInvest = summary.groups.reduce((sum, group) => sum + group.totalInvest, 0);
  calculationChecks += 1;
  const summaryInvestIssue = amountIssue(
    "summary-total-invest",
    "전체 원금 합계 불일치",
    summary.totalInvest,
    expectedSummaryInvest
  );
  if (summaryInvestIssue) issues.push(summaryInvestIssue);

  summary.groups.forEach((group) => {
    const holdingsValue = group.items.reduce((sum, item) => sum + item.currentValue, 0);
    calculationChecks += 1;
    const groupValueIssue = amountIssue(
      `group-value-${group.category}`,
      `${group.category} 합계 불일치`,
      group.totalValue,
      holdingsValue + group.cash
    );
    if (groupValueIssue) issues.push(groupValueIssue);

    if (group.accounts.length > 0) {
      const accountsValue = group.accounts.reduce((sum, account) => sum + account.totalValue, 0);
      calculationChecks += 1;
      const groupAccountIssue = amountIssue(
        `group-accounts-${group.category}`,
        `${group.category} 계좌 합계 불일치`,
        group.totalValue,
        accountsValue
      );
      if (groupAccountIssue) issues.push(groupAccountIssue);
    }

    group.accounts.forEach((account) => {
      const expectedAccountValue = account.items.reduce((sum, item) => sum + item.currentValue, 0)
        + account.cash;
      calculationChecks += 1;
      const accountIssue = amountIssue(
        `account-value-${group.category}-${account.name}`,
        `${account.name} 합계 불일치`,
        account.totalValue,
        expectedAccountValue
      );
      if (accountIssue) issues.push(accountIssue);
    });

    group.items.forEach((item) => {
      const expectedValue = item.valuationMode === "manual" && typeof item.manualValue === "number"
        ? item.manualValue
        : item.quantity * item.currentPrice;
      calculationChecks += 1;
      const itemIssue = amountIssue(
        `asset-value-${item.id ?? item.name}`,
        `${item.name} 평가금액 불일치`,
        item.currentValue,
        expectedValue
      );
      if (itemIssue) issues.push(itemIssue);

      freshnessChecks += 1;
      const itemFreshnessIssue = freshnessIssue(item, nowMs);
      if (itemFreshnessIssue) issues.push(itemFreshnessIssue);
    });
  });

  return {
    calculationChecks,
    calculationIssues: issues.filter((issue) => issue.kind === "calculation").length,
    freshnessChecks,
    freshnessIssues: issues.filter((issue) => issue.kind === "freshness").length,
    issues,
  };
}
