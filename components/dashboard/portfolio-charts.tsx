"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AssetGroup, BenchmarkSeries, BreakdownItem, DailyLogItem, PortfolioEvent } from "@/lib/types";
import { formatKRW, formatRate } from "@/lib/number-format";
import { rateColor } from "@/lib/dashboard-format";

type ChartTooltipProps<TPayload extends object = Record<string, never>> = {
  active?: boolean;
  payload?: Array<{
    name?: string;
    label?: string;
    value?: number;
    payload?: TPayload;
  }>;
};

type ProfitLogMeta = {
  basis: "daily_close";
  latestLogDate: string | null;
  isTodayConfirmed: boolean;
  today: string;
};

const CATEGORY_COLORS = {
  개별주식: "#3d47cf",
  개인연금: "#26a69a",
  IRP: "#4db8a8",
};

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);
  return prefersReducedMotion;
}

export function DonutChart({ groups }: { groups: AssetGroup[] }) {
  const { resolvedTheme } = useTheme();
  const total = groups.reduce((s, g) => s + g.totalValue, 0);
  if (total <= 0) return null;

  const data = groups
    .filter((g) => g.totalValue > 0)
    .map((g) => ({
      name: g.category,
      value: g.totalValue,
      color: CATEGORY_COLORS[g.category],
    }));

  const textColor = resolvedTheme === "dark" ? "#d1d5db" : "#111827";
  const labelColor = resolvedTheme === "dark" ? "#9ca3af" : "#6b7280";

  const CustomTooltip = ({ active, payload }: ChartTooltipProps) => {
    if (active && payload && payload[0]) {
      const { name, value = 0 } = payload[0];
      const pct = ((value / total) * 100).toFixed(1);
      return (
        <div className="rounded-md bg-white/90 dark:bg-gray-900/90 px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
          <p className="text-xs font-semibold" style={{ color: textColor }}>{name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{formatKRW(value)}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{pct}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: 220, height: 220 }}>
        <ResponsiveContainer width={220} height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={90}
              paddingAngle={1}
              dataKey="value"
              animationDuration={600}
            >
              {data.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={entry.color} opacity={0.92} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
          </PieChart>
        </ResponsiveContainer>
        {/* 중앙 텍스트 오버레이 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-xs font-normal" style={{ color: labelColor }}>총 자산</p>
          <p className="text-lg font-bold" style={{ color: textColor }}>{formatKRW(total)}</p>
        </div>
      </div>
      {/* 범례 */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((item) => {
          const pct = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={item.name} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: item.color }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {item.name} <span className="font-semibold text-gray-700 dark:text-gray-200">{pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 소형 분류 도넛 차트 ──────────────────────────────────
export function SmallDonutChart({ title, items }: { title: string; items: BreakdownItem[] }) {
  const { resolvedTheme } = useTheme();
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return null;

  const data = items
    .filter((i) => i.value > 0)
    .map((item) => ({
      ...item,
      value: item.value,
    }));

  const textColor = resolvedTheme === "dark" ? "#d1d5db" : "#111827";

  const CustomTooltip = ({ active, payload }: ChartTooltipProps) => {
    if (active && payload && payload[0]) {
      const { label, value = 0 } = payload[0];
      const pct = ((value / total) * 100).toFixed(1);
      return (
        <div className="rounded-md bg-white/90 dark:bg-gray-900/90 px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
          <p className="text-xs font-semibold" style={{ color: textColor }}>{label}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{formatKRW(value)}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{pct}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {title}
      </p>
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={34}
            outerRadius={52}
            paddingAngle={0.5}
            dataKey="value"
            animationDuration={600}
          >
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.color} opacity={0.9} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1 w-full">
        {data.map((item) => {
          const pct = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={item.label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: item.color }}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.label}</span>
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 shrink-0">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 자산 추이 차트 ────────────────────────────────────────
export function AssetTrendChart({
  logs,
  benchmarks,
  events,
  meta,
  category,
}: {
  logs: DailyLogItem[];
  benchmarks: BenchmarkSeries[];
  events: PortfolioEvent[];
  meta: ProfitLogMeta | null;
  category: "전체" | "개별주식" | "개인연금";
}) {
  const { resolvedTheme } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [period, setPeriod] = useState<"1month" | "3month" | "all">("all");
  const [selectedAccount, setSelectedAccount] = useState("전체");
  const [chartMode, setChartMode] = useState<"assets" | "performance" | "benchmark">("assets");
  const [benchmarkSymbol, setBenchmarkSymbol] = useState<"KOSPI" | "SPX">(
    category === "개별주식" ? "KOSPI" : "SPX"
  );

  useEffect(() => {
    setSelectedAccount("전체");
    setChartMode("assets");
    setBenchmarkSymbol(category === "개별주식" ? "KOSPI" : "SPX");
  }, [category]);

  const accountCategory = category === "개별주식" ? "stocks" : "pension";
  const accountOptions = useMemo(() => {
    if (category === "전체") return [];
    const latestTotals = new Map<string, number>();
    logs.forEach((log) => {
      log.accounts
        .filter((account) => account.category === accountCategory)
        .forEach((account) => {
          if (!latestTotals.has(account.accountName)) {
            latestTotals.set(account.accountName, account.total);
          }
        });
    });
    return Array.from(latestTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [accountCategory, category, logs]);

  if (logs.length === 0) {
    return null;
  }

  // 기간 필터링
  const filteredLogs = (() => {
    let result = logs;
    if (period !== "all") {
      const now = new Date();
      const days = period === "1month" ? 30 : 90;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      result = logs.filter(log => new Date(log.date) >= cutoff);
    }
    // 오름차순으로 정렬 (왼쪽=이전, 오른쪽=최신)
    return [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  })();

  const isTotal = category === "전체";
  const rawData = filteredLogs.map((log) => ({
    date: new Date(log.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
    total: log.total.total,
    stocks: log.stocks.total,
    pension: log.pension.total,
    selected: isTotal
      ? log.total.total
      : selectedAccount === "전체"
        ? (category === "개별주식" ? log.stocks.total : log.pension.total)
      : log.accounts.find(
        (account) => account.category === accountCategory && account.accountName === selectedAccount
      )?.total ?? null,
    fullDate: log.date,
  }));

  const title = isTotal ? "총자산 추이" : `${category} 자산 추이`;
  const selectedLabel = category === "개별주식" ? "주식" : "연금";
  const selectedColor = category === "개별주식" ? "#26a69a" : "#ff7043";
  const activeBenchmark = benchmarks.find((benchmark) => benchmark.symbol === benchmarkSymbol);
  const benchmarkData = (() => {
    const points = [...(activeBenchmark?.points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    let pointIndex = 0;
    let latestBenchmark: number | null = null;
    const aligned = rawData.map((row) => {
      while (pointIndex < points.length && points[pointIndex].date <= row.fullDate) {
        latestBenchmark = points[pointIndex].value;
        pointIndex += 1;
      }
      return { ...row, benchmarkValue: latestBenchmark };
    });
    const base = aligned.find((row) => row.selected !== null && row.selected > 0 && row.benchmarkValue !== null);
    const portfolioBase = base?.selected ?? null;
    const benchmarkBase = base?.benchmarkValue ?? null;

    return aligned.map((row) => ({
      ...row,
      portfolioIndex: portfolioBase && row.selected !== null ? (row.selected / portfolioBase) * 100 : null,
      benchmarkIndex: benchmarkBase && row.benchmarkValue !== null ? (row.benchmarkValue / benchmarkBase) * 100 : null,
    }));
  })();
  const performanceData = (() => {
    const relevantEvents = events
      .filter((event) => event.eventType !== "ignored")
      .filter((event) => isTotal || event.category === accountCategory)
      .filter((event) => selectedAccount === "전체" || event.accountName === selectedAccount)
      .sort((a, b) => a.date.localeCompare(b.date));
    let eventIndex = 0;
    let cumulativeNetFlow = 0;
    let cumulativeValuationAdjustment = 0;

    const aligned = rawData.map((row) => {
      let periodNetFlow = 0;
      let periodValuationAdjustment = 0;
      while (eventIndex < relevantEvents.length && relevantEvents[eventIndex].date <= row.fullDate) {
        const event = relevantEvents[eventIndex];
        const isTransfer = event.eventType === "transfer_in" || event.eventType === "transfer_out";
        if (
          event.eventType === "deposit"
          || event.eventType === "withdrawal"
          || isTransfer
        ) {
          const flowAmount = isTotal && isTransfer ? 0 : event.amount;
          cumulativeNetFlow += flowAmount;
          periodNetFlow += flowAmount;
        } else if (event.eventType === "valuation_adjustment") {
          cumulativeValuationAdjustment += event.amount;
          periodValuationAdjustment += event.amount;
        }
        eventIndex += 1;
      }
      return {
        ...row,
        cumulativeNetFlow,
        cumulativeValuationAdjustment,
        periodNetFlow,
        periodValuationAdjustment,
      };
    });

    const base = aligned.find((row) => row.selected !== null);
    const baseValue = base?.selected ?? null;
    const baseNetFlow = base?.cumulativeNetFlow ?? 0;
    const baseValuationAdjustment = base?.cumulativeValuationAdjustment ?? 0;

    let previousValue: number | null = null;
    let cumulativeReturnFactor = 1;

    return aligned.map((row) => {
      const assetChange = baseValue !== null && row.selected !== null
        ? row.selected - baseValue
        : null;
      const netFlow = row.cumulativeNetFlow - baseNetFlow;
      const valuationAdjustment = row.cumulativeValuationAdjustment - baseValuationAdjustment;
      let periodReturn: number | null = null;
      if (row.selected !== null && previousValue !== null && previousValue !== 0) {
        const adjustedEndValue = row.selected - row.periodNetFlow - row.periodValuationAdjustment;
        periodReturn = (adjustedEndValue - previousValue) / previousValue;
        cumulativeReturnFactor *= 1 + periodReturn;
      }
      if (row.selected !== null) previousValue = row.selected;

      return {
        ...row,
        assetChange,
        netFlow,
        valuationAdjustment,
        periodReturn: periodReturn === null ? null : periodReturn * 100,
        cashFlowAdjustedReturn: (cumulativeReturnFactor - 1) * 100,
        investmentProfit: assetChange === null
          ? null
          : assetChange - netFlow - valuationAdjustment,
      };
    });
  })();
  const data = chartMode === "performance"
    ? performanceData
    : chartMode === "benchmark" && !isTotal
      ? benchmarkData
      : rawData;
  const latestInvestmentProfit = performanceData
    .map((row) => row.investmentProfit)
    .filter((value): value is number => value !== null)
    .at(-1) ?? 0;
  const latestCashFlowAdjustedReturn = performanceData
    .map((row) => row.cashFlowAdjustedReturn)
    .filter((value): value is number => Number.isFinite(value))
    .at(-1) ?? 0;
  const investmentProfitColor = latestInvestmentProfit >= 0 ? "#f44336" : "#1565c0";

  const textColor = resolvedTheme === "dark" ? "#d1d5db" : "#111827";
  const gridColor = resolvedTheme === "dark" ? "#2a3a4a" : "#f0f0f0";
  const axisColor = resolvedTheme === "dark" ? "#94a3b8" : "#6b7280";

  const CustomTooltip = ({ active, payload }: ChartTooltipProps<{
    total: number;
    stocks: number;
    pension: number;
    selected: number | null;
    portfolioIndex?: number | null;
    benchmarkIndex?: number | null;
    assetChange?: number | null;
    netFlow?: number;
    valuationAdjustment?: number;
    periodReturn?: number | null;
    cashFlowAdjustedReturn?: number;
    investmentProfit?: number | null;
    fullDate: string;
  }>) => {
    if (active && payload && payload.length > 0) {
      const chartPayload = payload[0].payload;
      if (!chartPayload) return null;
      const {
        total,
        stocks,
        pension,
        selected,
        portfolioIndex,
        benchmarkIndex,
        assetChange,
        netFlow,
        valuationAdjustment,
        periodReturn,
        cashFlowAdjustedReturn,
        investmentProfit,
        fullDate,
      } = chartPayload;
      return (
        <div className="rounded-md bg-white/90 dark:bg-gray-900/90 px-3 py-2 border border-gray-200 dark:border-gray-700 shadow-md">
          <p className="text-xs font-semibold mb-2" style={{ color: textColor }}>
            {new Date(fullDate).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })}
          </p>
          {chartMode === "performance" ? (
            <>
              <p className="text-xs text-[#3d47cf]">자산 증감: {formatKRW(assetChange ?? 0)}</p>
              <p className="text-xs text-[#26a69a]">순입출금: {formatKRW(netFlow ?? 0)}</p>
              <p className="text-xs text-gray-500">평가조정: {formatKRW(valuationAdjustment ?? 0)}</p>
              <p className="text-xs" style={{ color: investmentProfitColor }}>
                투자수익: {formatKRW(investmentProfit ?? 0)}
              </p>
              <p className="text-xs font-semibold" style={{ color: rateColor(cashFlowAdjustedReturn ?? 0) }}>
                보정 수익률: {formatRate(cashFlowAdjustedReturn ?? 0)}
                {periodReturn !== null && periodReturn !== undefined ? ` · 일간 ${formatRate(periodReturn)}` : ""}
              </p>
            </>
          ) : !isTotal && chartMode === "benchmark" ? (
            <>
              {portfolioIndex !== null && portfolioIndex !== undefined && (
                <p className="text-xs" style={{ color: selectedColor }}>
                  {selectedAccount === "전체" ? `${selectedLabel} 포트폴리오` : selectedAccount}: {portfolioIndex.toFixed(1)} ({portfolioIndex >= 100 ? "+" : ""}{(portfolioIndex - 100).toFixed(2)}%)
                </p>
              )}
              {benchmarkIndex !== null && benchmarkIndex !== undefined && (
                <p className="text-xs text-[#3d47cf]">
                  {activeBenchmark?.name ?? benchmarkSymbol}: {benchmarkIndex.toFixed(1)} ({benchmarkIndex >= 100 ? "+" : ""}{(benchmarkIndex - 100).toFixed(2)}%)
                </p>
              )}
            </>
          ) : isTotal ? (
            <>
              <p className="text-xs" style={{ color: "#3d47cf" }}>총자산: {formatKRW(total)}</p>
              <p className="text-xs" style={{ color: "#26a69a" }}>주식 총자산: {formatKRW(stocks)}</p>
              <p className="text-xs" style={{ color: "#ff7043" }}>연금 총자산: {formatKRW(pension)}</p>
            </>
          ) : (
            selected !== null && (
              <p className="text-xs" style={{ color: selectedColor }}>
                {selectedAccount === "전체" ? `${selectedLabel} 총자산` : selectedAccount}: {formatKRW(selected)}
              </p>
            )
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="asset-chart-enter mb-6 px-4 md:px-0">
      <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {title}
          </h2>
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:mx-4">
            <span className="rounded-full bg-[#eef1ff] px-2 py-0.5 text-xs font-medium text-[#3d47cf] dark:bg-[#202a48]">
              {isTotal
                ? chartMode === "performance" ? "기준일 이후 증감" : "종가 확정 로그 기준"
                : chartMode === "benchmark"
                  ? "기준일 100 · 근사 성과"
                  : chartMode === "performance"
                    ? "입출금·평가조정 제외"
                  : "현금 포함 총자산 · 종가 기준"}
            </span>
            {meta?.latestLogDate && (
              <span className="text-xs text-gray-400">
                최신 로그 {new Date(meta.latestLogDate).toLocaleDateString("ko-KR")}
              </span>
            )}
            {meta && !meta.isTodayConfirmed && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                오늘 확정 전
              </span>
            )}
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <button
              onClick={() => setPeriod("1month")}
              className="px-3 py-1 text-xs font-medium rounded-lg transition-colors"
              style={{
                background: period === "1month" ? "#3d47cf" : "#f0f0f0",
                color: period === "1month" ? "#fff" : "#666",
              }}
            >
              1개월
            </button>
            <button
              onClick={() => setPeriod("3month")}
              className="px-3 py-1 text-xs font-medium rounded-lg transition-colors"
              style={{
                background: period === "3month" ? "#3d47cf" : "#f0f0f0",
                color: period === "3month" ? "#fff" : "#666",
              }}
            >
              3개월
            </button>
            <button
              onClick={() => setPeriod("all")}
              className="px-3 py-1 text-xs font-medium rounded-lg transition-colors"
              style={{
                background: period === "all" ? "#3d47cf" : "#f0f0f0",
                color: period === "all" ? "#fff" : "#666",
              }}
            >
              전체
            </button>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className={`inline-grid ${isTotal ? "grid-cols-2" : "grid-cols-3"} rounded-lg bg-[#f0f1f5] p-1 dark:bg-[#0f1923]`} role="group" aria-label="차트 모드">
              {(isTotal
                ? (["assets", "performance"] as const)
                : (["assets", "performance", "benchmark"] as const)
              ).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    chartMode === mode
                      ? "bg-white text-[#3d47cf] shadow-sm dark:bg-[#243044] dark:text-[#aeb5ff]"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {mode === "assets" ? "자산금액" : mode === "performance" ? "성과분리" : "벤치마크"}
                </button>
              ))}
            </div>
            {chartMode === "benchmark" && (
              <div className="flex gap-2" role="group" aria-label="벤치마크 지수">
                {benchmarks.map((benchmark) => (
                  <button
                    key={benchmark.symbol}
                    type="button"
                    onClick={() => setBenchmarkSymbol(benchmark.symbol)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      benchmarkSymbol === benchmark.symbol
                        ? "border-[#3d47cf] bg-[#eef1ff] text-[#3d47cf] dark:bg-[#202a48]"
                        : "border-[#e0e0e0] text-gray-500 dark:border-[#2a3a4a] dark:text-gray-400"
                    }`}
                  >
                    {benchmark.name}
                  </button>
                ))}
              </div>
            )}
        </div>
        {!isTotal && accountOptions.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="계좌 선택">
            {["전체", ...accountOptions].map((accountName) => (
              <button
                key={accountName}
                type="button"
                onClick={() => setSelectedAccount(accountName)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedAccount === accountName
                    ? "border-[#3d47cf] bg-[#3d47cf] text-white"
                    : "border-[#e0e0e0] bg-white text-gray-600 dark:border-[#2a3a4a] dark:bg-[#0f1923] dark:text-gray-300"
                }`}
              >
                {accountName}
              </button>
            ))}
          </div>
        )}
        {chartMode === "performance" && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
            <span><span className="mr-1 inline-block h-2 w-2 bg-[#3d47cf]" />자산 증감</span>
            <span><span className="mr-1 inline-block h-2 w-2 bg-[#26a69a]" />{isTotal ? "순입출금" : "순유입"}</span>
            <span><span className="mr-1 inline-block h-2 w-2 bg-[#9e9e9e]" />평가조정</span>
            <span><span className="mr-1 inline-block h-2 w-2" style={{ background: investmentProfitColor }} />투자수익</span>
            <span
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{
                color: rateColor(latestCashFlowAdjustedReturn),
                background: latestCashFlowAdjustedReturn >= 0 ? "#ffebee" : "#e3f2fd",
              }}
            >
              보정 수익률 {formatRate(latestCashFlowAdjustedReturn)}
            </span>
          </div>
        )}
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="date"
              stroke={axisColor}
              style={{ fontSize: "12px" }}
              tick={{ fill: axisColor }}
            />
            <YAxis
              stroke={axisColor}
              style={{ fontSize: "12px" }}
              tick={{ fill: axisColor }}
              tickFormatter={(v) => chartMode === "benchmark" && !isTotal ? Number(v).toFixed(0) : formatKRW(v)}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: axisColor, strokeDasharray: "4 4", strokeWidth: 1 }}
            />
            {chartMode === "performance" ? (
              <>
                <Area key={`${category}-${selectedAccount}-${period}-asset-change`} type="monotone" dataKey="assetChange" stroke="#3d47cf" strokeWidth={2} fill="none" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
                <Area key={`${category}-${selectedAccount}-${period}-net-flow`} type="monotone" dataKey="netFlow" stroke="#26a69a" strokeWidth={1.5} fill="none" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
                <Area key={`${category}-${selectedAccount}-${period}-valuation-adjustment`} type="monotone" dataKey="valuationAdjustment" stroke="#9e9e9e" strokeWidth={1.5} strokeDasharray="3 3" fill="none" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
                <Area key={`${category}-${selectedAccount}-${period}-investment-profit`} type="monotone" dataKey="investmentProfit" stroke={investmentProfitColor} strokeWidth={2} fill="none" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
              </>
            ) : isTotal ? (
              <>
                <Area key={`${period}-total`} type="monotone" dataKey="total" stroke="#3d47cf" strokeWidth={2} fill="none" activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
                <Area key={`${period}-stocks`} type="monotone" dataKey="stocks" stroke="#26a69a" strokeWidth={1.5} fill="none" activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
                <Area key={`${period}-pension`} type="monotone" dataKey="pension" stroke="#ff7043" strokeWidth={1.5} fill="none" activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
              </>
            ) : chartMode === "benchmark" ? (
              <>
                <Area
                  key={`${category}-${selectedAccount}-${benchmarkSymbol}-${period}-portfolio`}
                  type="monotone"
                  dataKey="portfolioIndex"
                  stroke={selectedColor}
                  strokeWidth={2}
                  fill="none"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
                <Area
                  key={`${benchmarkSymbol}-${period}`}
                  type="monotone"
                  dataKey="benchmarkIndex"
                  stroke="#3d47cf"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  fill="none"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              </>
            ) : (
              <Area
                key={`${category}-${selectedAccount}-${period}`}
                type="monotone"
                dataKey="selected"
                stroke={selectedColor}
                strokeWidth={2}
                fill="none"
                dot={selectedAccount === "전체" ? false : { r: 3, strokeWidth: 1 }}
                activeDot={{ r: 4, strokeWidth: 2 }}
                isAnimationActive={!prefersReducedMotion}
                animationDuration={600}
                animationEasing="ease-out"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 월간 투자 리포트 ────────────────────────────────────
