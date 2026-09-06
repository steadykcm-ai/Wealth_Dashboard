"use client";

import { useEffect, useMemo, useState } from "react";
import { rateColor } from "@/lib/dashboard-format";
import { formatKRW, formatRate } from "@/lib/number-format";
import type { AssetGroup, DailyLogItem, PortfolioEvent } from "@/lib/types";

export function MonthlyInvestmentReport({
  logs,
  events,
  unreviewedCount,
}: {
  logs: DailyLogItem[];
  events: PortfolioEvent[];
  unreviewedCount: number;
}) {
  const sortedLogs = useMemo(
    () => [...logs].sort((left, right) => left.date.localeCompare(right.date)),
    [logs]
  );
  const availableMonths = useMemo(
    () => Array.from(new Set(sortedLogs.map((log) => log.date.slice(0, 7)))).sort().reverse().slice(0, 12),
    [sortedLogs]
  );
  const [selectedMonth, setSelectedMonth] = useState("");

  useEffect(() => {
    if (availableMonths.length === 0) {
      setSelectedMonth("");
      return;
    }
    if (!availableMonths.includes(selectedMonth)) setSelectedMonth(availableMonths[0]);
  }, [availableMonths, selectedMonth]);

  const report = useMemo(() => {
    if (!selectedMonth) return null;
    const monthLogs = sortedLogs.filter((log) => log.date.startsWith(selectedMonth));
    if (monthLogs.length === 0) return null;

    const firstMonthLog = monthLogs[0];
    const endLog = monthLogs.at(-1) ?? firstMonthLog;
    const startLog = sortedLogs.filter((log) => log.date < firstMonthLog.date).at(-1) ?? firstMonthLog;
    const periodEvents = events.filter((event) => (
      event.date > startLog.date
      && event.date <= endLog.date
      && event.eventType !== "ignored"
    ));
    const netFlow = periodEvents.reduce((sum, event) => (
      event.eventType === "deposit" || event.eventType === "withdrawal"
        ? sum + event.amount
        : sum
    ), 0);
    const valuationAdjustment = periodEvents.reduce((sum, event) => (
      event.eventType === "valuation_adjustment" ? sum + event.amount : sum
    ), 0);
    const assetChange = endLog.total.total - startLog.total.total;
    const investmentProfit = assetChange - netFlow - valuationAdjustment;

    let previousDate = startLog.date;
    let previousValue = startLog.total.total;
    let returnFactor = 1;
    monthLogs.filter((log) => log.date > startLog.date).forEach((log) => {
      const intervalEvents = periodEvents.filter((event) => (
        event.date > previousDate && event.date <= log.date
      ));
      const intervalFlow = intervalEvents.reduce((sum, event) => (
        event.eventType === "deposit" || event.eventType === "withdrawal"
          ? sum + event.amount
          : sum
      ), 0);
      const intervalAdjustment = intervalEvents.reduce((sum, event) => (
        event.eventType === "valuation_adjustment" ? sum + event.amount : sum
      ), 0);
      if (previousValue > 0) {
        returnFactor *= 1 + ((log.total.total - intervalFlow - intervalAdjustment - previousValue) / previousValue);
      }
      previousDate = log.date;
      previousValue = log.total.total;
    });

    const startAccounts = new Map(
      startLog.accounts.map((account) => [`${account.category}|${account.accountName}`, account] as const)
    );
    const endAccounts = new Map(
      endLog.accounts.map((account) => [`${account.category}|${account.accountName}`, account] as const)
    );
    const accountKeys = new Set([...startAccounts.keys(), ...endAccounts.keys()]);
    const accountContributions = Array.from(accountKeys).map((key) => {
      const startAccount = startAccounts.get(key);
      const endAccount = endAccounts.get(key);
      const [category, accountName] = key.split("|", 2) as ["stocks" | "pension", string];
      const accountEvents = periodEvents.filter((event) => (
        event.category === category && event.accountName === accountName
      ));
      const accountFlow = accountEvents.reduce((sum, event) => (
        event.eventType === "deposit"
        || event.eventType === "withdrawal"
        || event.eventType === "transfer_in"
        || event.eventType === "transfer_out"
          ? sum + event.amount
          : sum
      ), 0);
      const accountAdjustment = accountEvents.reduce((sum, event) => (
        event.eventType === "valuation_adjustment" ? sum + event.amount : sum
      ), 0);
      const startValue = startAccount?.total ?? 0;
      const endValue = endAccount?.total ?? 0;
      return {
        key,
        category,
        accountName,
        endValue,
        investmentProfit: endValue - startValue - accountFlow - accountAdjustment,
      };
    }).sort((left, right) => Math.abs(right.investmentProfit) - Math.abs(left.investmentProfit));

    return {
      startDate: startLog.date,
      endDate: endLog.date,
      assetChange,
      netFlow,
      valuationAdjustment,
      investmentProfit,
      returnRate: (returnFactor - 1) * 100,
      accountContributions,
      eventCount: periodEvents.length,
      hasPriorBaseline: startLog.date < firstMonthLog.date,
    };
  }, [events, selectedMonth, sortedLogs]);

  if (availableMonths.length === 0) return null;

  const maxContribution = Math.max(
    1,
    ...(report?.accountContributions.map((account) => Math.abs(account.investmentProfit)) ?? [])
  );

  return (
    <section className="mb-6 px-4 md:px-0" aria-label="월간 투자 리포트">
      <div className="overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332]">
        <div className="flex items-center justify-between gap-3 border-b border-[#e0e0e0] px-4 py-3 dark:border-[#2a3a4a]">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">월간 투자 리포트</h2>
            {report && <p className="mt-0.5 text-[11px] text-gray-400">{report.startDate} → {report.endDate}</p>}
          </div>
          <select
            aria-label="리포트 월 선택"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-md border border-[#d6d9e0] bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-gray-200"
          >
            {availableMonths.map((month) => {
              const [year, monthNumber] = month.split("-");
              return <option key={month} value={month}>{year}년 {Number(monthNumber)}월</option>;
            })}
          </select>
        </div>

        {!report ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">월간 데이터를 계산하는 중</p>
        ) : (
          <>
            <div className="grid grid-cols-3 divide-x divide-[#e0e0e0] border-b border-[#e0e0e0] dark:divide-[#2a3a4a] dark:border-[#2a3a4a]">
              <div className="min-w-0 px-3 py-4 md:px-4">
                <span className="block text-[11px] text-gray-400">투자손익</span>
                <strong className="mt-1 block text-sm md:text-base" style={{ color: rateColor(report.investmentProfit) }}>
                  {report.investmentProfit >= 0 ? "+" : ""}{formatKRW(report.investmentProfit)}
                </strong>
                <span className="mt-0.5 block text-[10px]" style={{ color: rateColor(report.returnRate) }}>
                  {formatRate(report.returnRate)}
                </span>
              </div>
              <div className="min-w-0 px-3 py-4 text-center md:px-4">
                <span className="block text-[11px] text-gray-400">순입출금</span>
                <strong className="mt-1 block text-sm text-gray-900 dark:text-white md:text-base">
                  {report.netFlow >= 0 ? "+" : ""}{formatKRW(report.netFlow)}
                </strong>
                {report.valuationAdjustment !== 0 && (
                  <span className="mt-0.5 block text-[10px] text-gray-400">조정 {formatKRW(report.valuationAdjustment)}</span>
                )}
              </div>
              <div className="min-w-0 px-3 py-4 text-right md:px-4">
                <span className="block text-[11px] text-gray-400">자산 증감</span>
                <strong className="mt-1 block text-sm text-gray-900 dark:text-white md:text-base">
                  {report.assetChange >= 0 ? "+" : ""}{formatKRW(report.assetChange)}
                </strong>
                <span className="mt-0.5 block text-[10px] text-gray-400">분류 {report.eventCount}건</span>
              </div>
            </div>

            {(!report.hasPriorBaseline || unreviewedCount > 0) && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                {!report.hasPriorBaseline ? "월 시작 전 기준 로그 없음" : `미분류 변동 ${unreviewedCount}건`}
              </div>
            )}

            <div className="px-4 py-3">
              <h3 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">계좌별 투자손익 기여</h3>
              {report.accountContributions.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">계좌별 로그가 없습니다.</p>
              ) : report.accountContributions.slice(0, 5).map((account) => (
                <div key={account.key} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-3 border-b border-[#f0f0f0] py-2.5 last:border-b-0 dark:border-[#2a3a4a]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-gray-900 dark:text-white">{account.accountName}</span>
                      <span className="shrink-0 text-[10px] text-gray-400">{account.category === "stocks" ? "주식" : "연금"}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden bg-gray-100 dark:bg-[#0f1923]">
                      <div
                        className={account.investmentProfit >= 0 ? "h-full bg-[#f44336]" : "h-full bg-[#1565c0]"}
                        style={{
                          width: account.investmentProfit === 0
                            ? "0%"
                            : `${Math.max(2, (Math.abs(account.investmentProfit) / maxContribution) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-right text-xs font-semibold" style={{ color: rateColor(account.investmentProfit) }}>
                    {account.investmentProfit >= 0 ? "+" : ""}{formatKRW(account.investmentProfit)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function PortfolioRiskPanel({ groups, logs, events }: { groups: AssetGroup[]; logs: DailyLogItem[]; events: PortfolioEvent[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const items = groups.flatMap((group) => group.items).sort((left, right) => right.currentValue - left.currentValue);
  const totalValue = items.reduce((sum, item) => sum + item.currentValue, 0);
  const largestWeight = totalValue > 0 ? ((items[0]?.currentValue ?? 0) / totalValue) * 100 : 0;
  const topFiveWeight = totalValue > 0
    ? (items.slice(0, 5).reduce((sum, item) => sum + item.currentValue, 0) / totalValue) * 100
    : 0;
  const sortedLogs = [...logs].sort((left, right) => left.date.localeCompare(right.date));
  let performanceIndex = 100;
  let peak = 100;
  let maxDrawdown = 0;
  sortedLogs.slice(1).forEach((log, index) => {
    const previousLog = sortedLogs[index];
    const intervalEvents = events.filter((event) => (
      event.date > previousLog.date && event.date <= log.date && event.eventType !== "ignored"
    ));
    const intervalFlow = intervalEvents.reduce((sum, event) => (
      event.eventType === "deposit" || event.eventType === "withdrawal" ? sum + event.amount : sum
    ), 0);
    const intervalAdjustment = intervalEvents.reduce((sum, event) => (
      event.eventType === "valuation_adjustment" ? sum + event.amount : sum
    ), 0);
    if (previousLog.total.total > 0) {
      performanceIndex *= 1 + ((log.total.total - intervalFlow - intervalAdjustment - previousLog.total.total) / previousLog.total.total);
      peak = Math.max(peak, performanceIndex);
      maxDrawdown = Math.min(maxDrawdown, ((performanceIndex - peak) / peak) * 100);
    }
  });
  const riskCount = Number(largestWeight >= 20) + Number(topFiveWeight >= 60) + Number(maxDrawdown <= -15);
  const stressScenarios = [-10, -20, -30].map((shock) => ({
    shock,
    loss: totalValue * (shock / 100),
    remaining: totalValue * (1 + shock / 100),
  }));

  if (totalValue <= 0) return null;

  return (
    <section className="mb-6 px-4 md:px-0" aria-label="포트폴리오 위험 분석">
      <div className="overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332]">
        <button type="button" onClick={() => setIsExpanded((previous) => !previous)} aria-expanded={isExpanded} className="flex w-full items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#f8f9fc] px-4 py-3 text-left dark:border-[#2a3a4a] dark:bg-[#0f1923]">
          <span><span className="block text-sm font-semibold text-[#3d47cf]">위험 분석</span><span className="mt-0.5 block text-[11px] text-gray-400">{riskCount > 0 ? `주의 지표 ${riskCount}개` : "집중도 안정"}</span></span>
          <span className="text-sm text-gray-400">{isExpanded ? "▲" : "▼"}</span>
        </button>
        {isExpanded && (
          <>
            <div className="grid grid-cols-3 divide-x divide-[#e0e0e0] border-b border-[#e0e0e0] dark:divide-[#2a3a4a] dark:border-[#2a3a4a]">
              <div className="px-3 py-4 md:px-4"><span className="block text-[11px] text-gray-400">최대 종목</span><strong className="mt-1 block truncate text-sm text-gray-900 dark:text-white">{items[0]?.name}</strong><span className={largestWeight >= 20 ? "text-[10px] text-amber-600" : "text-[10px] text-gray-400"}>{largestWeight.toFixed(1)}%</span></div>
              <div className="px-3 py-4 text-center md:px-4"><span className="block text-[11px] text-gray-400">상위 5종목</span><strong className="mt-1 block text-sm text-gray-900 dark:text-white">{topFiveWeight.toFixed(1)}%</strong><span className={topFiveWeight >= 60 ? "text-[10px] text-amber-600" : "text-[10px] text-gray-400"}>집중도</span></div>
              <div className="px-3 py-4 text-right md:px-4"><span className="block text-[11px] text-gray-400">최대 낙폭</span><strong className="mt-1 block text-sm text-[#1565c0]">{maxDrawdown.toFixed(1)}%</strong><span className="text-[10px] text-gray-400">입출금 보정</span></div>
            </div>
            <div className="px-4 py-3">
              <h3 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">단순 충격 시나리오</h3>
              {stressScenarios.map((scenario) => (
                <div key={scenario.shock} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#f0f0f0] py-2.5 text-xs last:border-b-0 dark:border-[#2a3a4a]">
                  <span className="font-semibold text-[#1565c0]">{scenario.shock}%</span>
                  <div className="h-1.5 overflow-hidden bg-gray-100 dark:bg-[#0f1923]"><div className="h-full bg-[#1565c0]" style={{ width: `${Math.abs(scenario.shock)}%` }} /></div>
                  <span className="text-right text-gray-600 dark:text-gray-300">{formatKRW(scenario.loss)} → {formatKRW(scenario.remaining)}</span>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-gray-400">전체 평가자산에 동일한 충격을 적용한 단순 계산</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
