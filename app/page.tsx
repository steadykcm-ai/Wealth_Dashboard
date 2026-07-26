"use client";

import { Fragment, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { useAssets } from "@/lib/useAssets";
import { formatKRW, formatRate } from "@/lib/profit-calculator";
import type {
  AssetCategory,
  AssetItem,
  AssetGroup,
  BreakdownItem,
  PortfolioBreakdown,
  AccountGroup,
  DailyLogItem,
  BenchmarkSeries,
  PortfolioChangeCandidate,
  PortfolioEvent,
  PortfolioEventType,
  SyncJob,
  SyncRun,
  RebalanceCategory,
  RebalanceTarget,
} from "@/lib/types";

type ProfitLogMeta = {
  basis: "daily_close";
  latestLogDate: string | null;
  isTodayConfirmed: boolean;
  today: string;
};

type ChartTooltipProps<TPayload extends object = Record<string, never>> = {
  active?: boolean;
  payload?: Array<{
    name?: string;
    label?: string;
    value?: number;
    payload?: TPayload;
  }>;
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

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

interface TodayQuote {
  price: number;
  changeAmount: number;
  changeRate: number;
}

type EditableAssetField = "quantity" | "avgPrice" | "manualInvestAmount" | "manualValue";
type AssetUpdates = Partial<Record<EditableAssetField, number>>;
type AccountSortMode = "value" | "return" | "name" | "freshness";

// 종목 데이터: [종목명, GOOGLEFINANCE 티커] 형식
type StockEntry = [string, string];
let _stocksCache: StockEntry[] | null = null;
async function loadStocks(): Promise<StockEntry[]> {
  if (_stocksCache) return _stocksCache;
  const res = await fetch("/stocks-kr.json");
  _stocksCache = await res.json() as StockEntry[];
  return _stocksCache;
}
import { SHEET_TABS } from "@/lib/sheetConfig";

// ── 유틸 ────────────────────────────────────────────────
function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function rateColor(rate: number): string {
  if (rate > 0) return "#f44336";
  if (rate < 0) return "#1565c0";
  return "#9e9e9e";
}

function formatPriceUpdatedAt(updatedAt?: string): string | undefined {
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

function formatValuationUpdatedAt(updatedAt?: string): string | undefined {
  if (!updatedAt) return undefined;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function latestPriceUpdatedAt(items: AssetItem[]): string | undefined {
  return items
    .map((item) => item.priceUpdatedAt)
    .filter((updatedAt): updatedAt is string => Boolean(updatedAt))
    .sort()
    .at(-1);
}

function assetKey(item: AssetItem): string {
  return item.id ? `${item.id}` : `${item.sheetTab ?? ""}-${item.rowIndex ?? ""}`;
}

function itemDataUpdatedAt(item: AssetItem): string | undefined {
  return item.valuationMode === "manual" ? item.valuationUpdatedAt : item.priceUpdatedAt;
}

function accountDataUpdatedAt(account: AccountGroup): string | undefined {
  const timestamps = account.items.map(itemDataUpdatedAt);
  if (timestamps.length === 0 || timestamps.some((timestamp) => !timestamp)) return undefined;
  return (timestamps as string[]).sort().at(0);
}

function isAccountStale(account: AccountGroup, nowMs = Date.now()): boolean {
  if (account.items.length === 0) return true;
  return account.items.some((item) => {
    const timestamp = itemDataUpdatedAt(item);
    if (!timestamp) return true;
    const updatedMs = new Date(timestamp).getTime();
    if (!Number.isFinite(updatedMs)) return true;
    const staleDays = item.valuationMode === "manual" ? 45 : 5;
    return nowMs - updatedMs > staleDays * 24 * 60 * 60 * 1000;
  });
}

function accountValueWithCashOverride(
  account: AccountGroup,
  cashOverrides?: Record<string, number>
): number {
  const displayCash = cashOverrides?.[account.name] ?? account.cash;
  return account.totalValue - account.cash + displayCash;
}

const CATEGORY_COLORS: Record<AssetCategory, string> = {
  개별주식: "#3d47cf",
  개인연금: "#26a69a",
  IRP: "#4db8a8",
};

const TABS = [
  { id: "전체", label: "전체" },
  { id: "개별주식", label: "주식" },
  { id: "개인연금", label: "연금" },
];

// ── 파이 차트 (recharts) ─────────────────────────────────
function DonutChart({ groups }: { groups: AssetGroup[] }) {
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
function SmallDonutChart({ title, items }: { title: string; items: BreakdownItem[] }) {
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
function AssetTrendChart({
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

// ── 리밸런싱 패널 ────────────────────────────────────────
function RebalancePanel({
  group,
  category,
}: {
  group: AssetGroup;
  category: RebalanceCategory;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [targetInputs, setTargetInputs] = useState<Record<number, string>>({});
  const [contribution, setContribution] = useState("1000000");
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const items = useMemo(
    () => group.items
      .filter((item): item is AssetItem & { id: number } => Number.isInteger(item.id))
      .slice()
      .sort((left, right) => right.currentValue - left.currentValue),
    [group.items]
  );
  const accountByAssetId = useMemo(() => {
    const accountMap: Record<number, string> = {};
    group.accounts.forEach((account) => {
      account.items.forEach((item) => {
        if (item.id) accountMap[item.id] = account.name;
      });
    });
    return accountMap;
  }, [group.accounts]);
  const holdingsTotal = items.reduce((sum, item) => sum + item.currentValue, 0);
  const targetSum = items.reduce((sum, item) => sum + Number(targetInputs[item.id] || 0), 0);
  const targetSumIsZero = Math.abs(targetSum) < 0.005;
  const targetSumIsValid = Math.abs(targetSum - 100) <= 0.05;
  const contributionAmount = Math.max(0, Number(contribution) || 0);

  const planRows = useMemo(() => {
    const finalPortfolioValue = holdingsTotal + contributionAmount;
    const rows = items.map((item) => {
      const currentWeight = holdingsTotal > 0 ? (item.currentValue / holdingsTotal) * 100 : 0;
      const targetWeight = Number(targetInputs[item.id] || 0);
      const targetValue = (targetWeight / 100) * finalPortfolioValue;
      const gapValue = targetSumIsValid ? Math.max(0, targetValue - item.currentValue) : 0;
      return {
        item,
        currentWeight,
        targetWeight,
        difference: targetWeight - currentWeight,
        gapValue,
        recommendedBuy: 0,
      };
    });
    const totalGap = rows.reduce((sum, row) => sum + row.gapValue, 0);
    if (totalGap <= 0) return rows;

    const roundedBudget = Math.round(contributionAmount);
    const rawBuys = rows.map((row) => (roundedBudget * row.gapValue) / totalGap);
    const integerBuys = rawBuys.map((amount) => Math.floor(amount));
    let remainder = roundedBudget - integerBuys.reduce((sum, amount) => sum + amount, 0);
    const remainderOrder = rawBuys
      .map((amount, index) => ({ index, fraction: amount - Math.floor(amount) }))
      .sort((left, right) => right.fraction - left.fraction);
    remainderOrder.forEach(({ index }) => {
      if (remainder <= 0) return;
      integerBuys[index] += 1;
      remainder -= 1;
    });

    return rows.map((row, index) => ({ ...row, recommendedBuy: integerBuys[index] }));
  }, [contributionAmount, holdingsTotal, items, targetInputs, targetSumIsValid]);

  const orderPlan = useMemo(() => {
    const roundedContribution = Math.round(contributionAmount);
    const finalPortfolioValue = holdingsTotal + roundedContribution;
    const rows = planRows.map((row) => {
      const supportsUnitOrder = row.item.valuationMode !== "manual"
        && Boolean(row.item.code)
        && row.item.currentPrice > 0;
      const orderQuantity = supportsUnitOrder
        ? Math.floor(row.recommendedBuy / row.item.currentPrice)
        : null;
      const orderAmount = orderQuantity === null
        ? row.recommendedBuy
        : Math.round(orderQuantity * row.item.currentPrice);
      const projectedWeight = finalPortfolioValue > 0
        ? ((row.item.currentValue + orderAmount) / finalPortfolioValue) * 100
        : 0;

      return {
        ...row,
        supportsUnitOrder,
        orderQuantity,
        orderAmount,
        projectedWeight,
        projectedDifference: row.targetWeight - projectedWeight,
      };
    });
    const totalOrderAmount = rows.reduce((sum, row) => sum + row.orderAmount, 0);
    const remainingCash = Math.max(0, roundedContribution - totalOrderAmount);
    const currentDrift = rows.reduce((sum, row) => sum + Math.abs(row.difference), 0) / 2;
    const projectedDrift = rows.reduce((sum, row) => sum + Math.abs(row.projectedDifference), 0) / 2;

    return { rows, totalOrderAmount, remainingCash, currentDrift, projectedDrift };
  }, [contributionAmount, holdingsTotal, planRows]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTargets(true);
    setTargetError(null);
    fetch(`/api/rebalance-targets?category=${category}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json() as { error?: string };
          throw new Error(body.error ?? "목표 비중을 불러오지 못했습니다.");
        }
        return response.json() as Promise<{ targets: RebalanceTarget[] }>;
      })
      .then(({ targets }) => {
        if (cancelled) return;
        const nextInputs: Record<number, string> = {};
        targets.forEach((target) => {
          nextInputs[target.assetId] = `${target.targetWeight}`;
        });
        setTargetInputs(nextInputs);
        const latestUpdatedAt = targets.map((target) => target.updatedAt).filter(Boolean).sort().at(-1);
        setSavedAt(latestUpdatedAt ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setTargetError(error instanceof Error ? error.message : "목표 비중을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTargets(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category]);

  function applyCurrentWeights() {
    if (holdingsTotal <= 0 || items.length === 0) return;
    const nextInputs: Record<number, string> = {};
    let roundedTotal = 0;
    items.forEach((item) => {
      const weight = Math.round((item.currentValue / holdingsTotal) * 10000) / 100;
      nextInputs[item.id] = weight.toFixed(2);
      roundedTotal += weight;
    });
    const adjustment = Math.round((100 - roundedTotal) * 100) / 100;
    nextInputs[items[0].id] = (Number(nextInputs[items[0].id]) + adjustment).toFixed(2);
    setTargetInputs(nextInputs);
    setTargetError(null);
    setSavedAt(null);
  }

  async function saveTargets() {
    if (savingTargets || (!targetSumIsZero && !targetSumIsValid)) return;
    setSavingTargets(true);
    setTargetError(null);
    try {
      const response = await fetch("/api/rebalance-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          targets: items.map((item) => ({
            assetId: item.id,
            targetWeight: Number(targetInputs[item.id] || 0),
          })),
        }),
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "목표 비중을 저장하지 못했습니다.");
      }
      const body = await response.json() as { targets: RebalanceTarget[] };
      const latestUpdatedAt = body.targets.map((target) => target.updatedAt).filter(Boolean).sort().at(-1);
      setSavedAt(latestUpdatedAt ?? new Date().toISOString());
    } catch (error: unknown) {
      setTargetError(error instanceof Error ? error.message : "목표 비중을 저장하지 못했습니다.");
    } finally {
      setSavingTargets(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <section className="mx-4 mb-6 overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0">
      <button
        type="button"
        onClick={() => setIsExpanded((previous) => !previous)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#f8f9fc] px-4 py-3 text-left dark:border-[#2a3a4a] dark:bg-[#0f1923]"
      >
        <span>
          <span className="block text-sm font-semibold text-[#3d47cf]">리밸런싱</span>
          <span className="mt-0.5 block text-[11px] text-gray-400">
            목표 {targetSum.toFixed(2)}%{savedAt ? ` · 저장 ${formatPriceUpdatedAt(savedAt)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm text-gray-400">{isExpanded ? "▲" : "▼"}</span>
      </button>

      {isExpanded && (
        <div>
          <div className="grid gap-3 border-b border-[#e0e0e0] px-4 py-4 dark:border-[#2a3a4a] md:grid-cols-[minmax(180px,1fr)_auto] md:items-end">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              추가 투자금
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="10000"
                value={contribution}
                onChange={(event) => setContribution(event.target.value)}
                className="mt-1 block w-full rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-right text-sm font-semibold text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white md:max-w-56"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={applyCurrentWeights} disabled={loadingTargets} className="rounded-md border border-[#d6d9e0] px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40 dark:border-[#3a4658] dark:text-gray-300">
                현재 비중
              </button>
              <button type="button" onClick={() => { setTargetInputs({}); setSavedAt(null); }} disabled={loadingTargets} className="rounded-md border border-[#d6d9e0] px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40 dark:border-[#3a4658] dark:text-gray-300">
                초기화
              </button>
              <button type="button" onClick={saveTargets} disabled={loadingTargets || savingTargets || (!targetSumIsZero && !targetSumIsValid)} className="rounded-md bg-[#3d47cf] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {savingTargets ? "저장 중" : "저장"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-[#e0e0e0] px-4 py-2.5 text-xs dark:border-[#2a3a4a]">
            <span className="text-gray-500">목표 합계</span>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${targetSumIsValid || targetSumIsZero ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>
              {targetSum.toFixed(2)}%
            </span>
          </div>

          {targetSumIsValid && contributionAmount > 0 && (
            <div className="grid grid-cols-3 gap-3 border-b border-[#e0e0e0] px-4 py-3 text-xs dark:border-[#2a3a4a]">
              <div>
                <span className="block text-[11px] text-gray-400">주문 예정</span>
                <strong className="mt-0.5 block text-gray-900 dark:text-white">{formatKRW(orderPlan.totalOrderAmount)}</strong>
              </div>
              <div className="text-center">
                <span className="block text-[11px] text-gray-400">남는 현금</span>
                <strong className="mt-0.5 block text-gray-900 dark:text-white">{formatKRW(orderPlan.remainingCash)}</strong>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-gray-400">목표 격차</span>
                <strong className="mt-0.5 block text-[#3d47cf]">{orderPlan.currentDrift.toFixed(2)} → {orderPlan.projectedDrift.toFixed(2)}%p</strong>
              </div>
            </div>
          )}

          {targetError && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{targetError}</p>}

          <div className="hidden grid-cols-[minmax(220px,1fr)_90px_100px_90px_120px] gap-3 border-b border-[#e0e0e0] bg-[#f8f9fc] px-4 py-2 text-right text-[11px] font-semibold text-gray-400 dark:border-[#2a3a4a] dark:bg-[#0f1923] md:grid">
            <span className="text-left">종목</span>
            <span>현재 비중</span>
            <span>목표 비중</span>
            <span>차이</span>
            <span>주문 제안</span>
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            {loadingTargets ? (
              <p className="py-10 text-center text-sm text-gray-400">목표 비중 불러오는 중</p>
            ) : orderPlan.rows.map((row) => (
              <div key={row.item.id} className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-x-3 gap-y-2 border-b border-[#f0f0f0] px-4 py-3 last:border-b-0 dark:border-[#2a3a4a] md:grid-cols-[minmax(220px,1fr)_90px_100px_90px_120px]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{row.item.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-400">{accountByAssetId[row.item.id] ?? "계좌 미확인"} · {formatKRW(row.item.currentValue)}</p>
                </div>
                <div className="hidden text-right text-xs font-medium text-gray-600 dark:text-gray-300 md:block">{row.currentWeight.toFixed(2)}%</div>
                <label className="text-right text-[11px] text-gray-400 md:text-xs">
                  <span className="md:hidden">목표</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    aria-label={`${row.item.name} 목표 비중`}
                    value={targetInputs[row.item.id] ?? ""}
                    onChange={(event) => {
                      setTargetInputs((previous) => ({ ...previous, [row.item.id]: event.target.value }));
                      setSavedAt(null);
                    }}
                    className="ml-1 w-16 rounded-md border border-[#d6d9e0] bg-white px-2 py-1.5 text-right text-xs font-semibold text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white md:ml-0 md:w-20"
                  />
                  <span className="ml-1">%</span>
                </label>
                <div className="text-xs text-gray-500 md:text-right">
                  <span className="md:hidden">현재 {row.currentWeight.toFixed(2)}% · 차이 </span>
                  <span className={row.difference > 0.005 ? "font-semibold text-[#3d47cf]" : row.difference < -0.005 ? "text-gray-400" : "text-gray-500"}>
                    {row.difference > 0 ? "+" : ""}{row.difference.toFixed(2)}%p
                  </span>
                </div>
                <div className="text-right text-xs font-semibold text-gray-900 dark:text-white md:col-auto">
                  <span className="mr-1 font-normal text-gray-400 md:hidden">주문</span>
                  {targetSumIsValid && contributionAmount > 0 ? (
                    <>
                      <span className="block">
                        {row.supportsUnitOrder ? `${row.orderQuantity?.toLocaleString("ko-KR")}주` : formatKRW(row.orderAmount)}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-normal text-gray-400">
                        {row.supportsUnitOrder ? `${formatKRW(row.orderAmount)} · ` : "금액 주문 · "}
                        주문 후 {row.projectedWeight.toFixed(2)}%
                      </span>
                    </>
                  ) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── AI 포트폴리오 분석 패널 ──────────────────────────────
function PortfolioAnalysisPanel({
  group,
  logs,
  category,
}: {
  group: AssetGroup;
  logs: DailyLogItem[];
  category: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  async function handleAnalyze() {
    if (isAnalyzing || analysisText) return;
    setIsAnalyzing(true);
    setAnalysisText("");

    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          group,
          logs,
        }),
      });

      if (!res.ok) {
        const error = await res.json() as { error?: string };
        setAnalysisText(`오류: ${error.error || "분석 생성 실패"}`);
        setIsAnalyzing(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setAnalysisText(accumulated);
      }

      setIsAnalyzing(false);
    } catch (err) {
      setAnalysisText(`오류: ${err instanceof Error ? err.message : "요청 실패"}`);
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="mt-6 px-4 md:px-0">
      <div
        className="rounded-xl border border-[#e0e0e0] dark:border-[#2a3a4a] bg-white dark:bg-[#1a2332] overflow-hidden"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-[#f8f9fc] dark:bg-[#0f1923] border-b border-[#e0e0e0] dark:border-[#2a3a4a] cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "#3d47cf" }}>
            🤖 AI 포트폴리오 분석
          </h3>
          <span className="text-lg" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            ▼
          </span>
        </div>

        {/* 본문 */}
        {isExpanded && (
          <div className="px-4 py-4 space-y-3">
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !!analysisText}
              className="px-3 py-1.5 text-xs font-semibold rounded text-white"
              style={{
                background: isAnalyzing || analysisText ? "#ccc" : "#3d47cf",
                cursor: isAnalyzing || analysisText ? "not-allowed" : "pointer",
              }}
            >
              {isAnalyzing ? "⏳ 분석 중..." : analysisText ? "분석 완료" : "분석 요청"}
            </button>

            {analysisText && (
              <div
                className="mt-3 p-3 rounded-md bg-[#f0f2f8] dark:bg-[#0f1923] text-xs leading-relaxed whitespace-pre-wrap"
                style={{ color: "#333", maxHeight: "600px", overflowY: "auto" }}
              >
                <MarkdownContent text={analysisText} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 간단한 마크다운 렌더러
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-2" />;
        }
        if (line.startsWith("###")) {
          const title = line.replace(/^#+\s*/, "");
          return (
            <h3 key={idx} className="text-xs font-bold mt-3 mb-1" style={{ color: "#3d47cf" }}>
              {title}
            </h3>
          );
        }
        if (line.startsWith("##")) {
          const title = line.replace(/^#+\s*/, "");
          return (
            <h2 key={idx} className="text-xs font-bold mt-2 mb-1" style={{ color: "#3d47cf" }}>
              {title}
            </h2>
          );
        }
        // **bold** 처리
        const styled = line
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/- /g, "• ");
        return (
          <div key={idx} className="text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: styled }} />
        );
      })}
    </>
  );
}

// ── 카테고리 카드 ────────────────────────────────────────
function CategoryCard({
  group,
  onClick,
}: {
  group: AssetGroup;
  onClick: () => void;
}) {
  const color = CATEGORY_COLORS[group.category];
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] px-4 py-4 transition-shadow hover:shadow-md active:opacity-80 w-full"
    >
      {/* 카테고리명 + 아이콘 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: color }}
          />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {group.category}
          </span>
        </div>
        <span className="text-xs text-gray-400">{group.items.length}종목</span>
      </div>
      {/* 현재가치 */}
      <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
        {formatKRW(group.totalValue)}
      </p>
      {/* 평가손익 + 수익률 */}
      <div className="flex items-center justify-between mt-1.5">
        <span
          className="text-xs font-medium"
          style={{ color: rateColor(group.totalProfitLoss) }}
        >
          {group.totalProfitLoss >= 0 ? "+" : ""}
          {formatKRW(group.totalProfitLoss)}
        </span>
        <span
          className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{
            color: rateColor(group.returnRate),
            background:
              group.returnRate > 0
                ? "#e8f5e9"
                : group.returnRate < 0
                ? "#ffebee"
                : "#f5f5f5",
          }}
        >
          {formatRate(group.returnRate)}
        </span>
      </div>
      {/* 현금 잔고 */}
      {group.cash > 0 && (
        <p className="text-xs text-gray-400 mt-1.5">
          현금 {formatKRW(group.cash)}
        </p>
      )}
    </button>
  );
}

// ── 공통 컴포넌트 ────────────────────────────────────────
function RateBadge({ rate }: { rate: number }) {
  const color = rateColor(rate);
  const bg = rate > 0 ? "#e8f5e9" : rate < 0 ? "#ffebee" : "#f5f5f5";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ color, background: bg }}
    >
      {formatRate(rate)}
    </span>
  );
}

function TodayChangeBadge({ quote }: { quote?: TodayQuote }) {
  if (!quote) return null;

  const bg = quote.changeRate > 0 ? "#ffebee" : quote.changeRate < 0 ? "#e3f2fd" : "#f5f5f5";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ color: rateColor(quote.changeRate), background: bg }}
      title={`전일 대비 ${quote.changeAmount >= 0 ? "+" : ""}${formatKRW(quote.changeAmount)}`}
    >
      오늘 {formatRate(quote.changeRate)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  const valueSizeClass = value.length >= 10
    ? "text-[13px] sm:text-base md:text-xl"
    : "text-xl";

  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-[#e0e0e0] bg-white px-4 py-4 dark:bg-[#1a2332] dark:border-[#2a3a4a]">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`${valueSizeClass} max-w-full font-bold leading-tight text-gray-900 dark:text-white`}>
        {value}
      </span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

type DataSyncState = "ok" | "loading" | "error" | "stale" | "empty";

interface DataSyncItem {
  job: SyncJob;
  label: string;
  value: string;
  state: DataSyncState;
  message?: string;
}

function formatLogDate(dateKey?: string | null): string | undefined {
  if (!dateKey) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return undefined;
  return `${match[1]}. ${Number(match[2])}. ${Number(match[3])}.`;
}

function formatSyncRunTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncJobLabel(job: SyncJob): string {
  if (job === "prices") return "현재가";
  if (job === "daily_log") return "자산 로그";
  return "벤치마크";
}

function syncRunDetail(run: SyncRun): string {
  if (run.errorMessage) return run.errorMessage;
  if (run.job === "prices") {
    const updated = typeof run.details.updated === "number" ? run.details.updated : 0;
    const totalCodes = typeof run.details.totalCodes === "number" ? run.details.totalCodes : 0;
    const tokenSource = typeof run.details.tokenSource === "string" ? run.details.tokenSource : "unknown";
    const tokenLabels: Record<string, string> = {
      memory: "메모리 캐시",
      database: "DB 캐시",
      issued: "신규 발급",
      unused: "토큰 미사용",
      unknown: "토큰 상태 미확인",
    };
    return `${updated}/${totalCodes}종목 · ${tokenLabels[tokenSource] ?? tokenSource}`;
  }
  if (run.job === "daily_log") {
    return typeof run.details.date === "string" ? run.details.date : "저장 완료";
  }
  const kospi = typeof run.details.KOSPI === "number" ? run.details.KOSPI : 0;
  const spx = typeof run.details.SPX === "number" ? run.details.SPX : 0;
  return `KOSPI ${kospi}건 · S&P 500 ${spx}건`;
}

function DataSyncStatus({
  priceUpdatedAt,
  latestLogDate,
  latestBenchmarkDate,
  assetsError,
  performanceError,
  assetsLoading,
  performanceLoading,
  runs,
  runsLoading,
  runsError,
  retryingJob,
  onRetry,
}: {
  priceUpdatedAt?: string;
  latestLogDate?: string | null;
  latestBenchmarkDate?: string;
  assetsError: string | null;
  performanceError: string | null;
  assetsLoading: boolean;
  performanceLoading: boolean;
  runs: SyncRun[];
  runsLoading: boolean;
  runsError: string | null;
  retryingJob: SyncJob | null;
  onRetry: (job: SyncJob) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const buildItem = (
    job: SyncJob,
    label: string,
    value: string | undefined,
    loading: boolean,
    error: string | null
  ): DataSyncItem => {
    if (loading || runsLoading) return { job, label, value: "확인 중", state: "loading" };
    if (error) return { job, label, value: "조회 실패", state: "error", message: error };

    const latestRun = runs.find((run) => run.job === job);
    const lastSuccessfulRun = runs.find(
      (run) => run.job === job && (run.status === "success" || run.status === "partial")
    );
    if (latestRun?.status === "failed") {
      return {
        job,
        label,
        value: "갱신 실패",
        state: "error",
        message: latestRun.errorMessage,
      };
    }
    if (!value) return { job, label, value: "기록 없음", state: "empty" };
    if (!lastSuccessfulRun) {
      return { job, label, value, state: "stale", message: runsError ?? "실행 이력이 없습니다." };
    }

    const staleHours = job === "daily_log" ? 36 : 72;
    const elapsed = Date.now() - new Date(lastSuccessfulRun.finishedAt).getTime();
    if (latestRun?.status === "partial" || elapsed > staleHours * 60 * 60 * 1000) {
      return { job, label, value, state: "stale", message: "마지막 정상 갱신이 오래되었습니다." };
    }
    return { job, label, value, state: "ok" };
  };

  const items = [
    buildItem("prices", "현재가", formatPriceUpdatedAt(priceUpdatedAt), assetsLoading, assetsError),
    buildItem("daily_log", "자산 로그", formatLogDate(latestLogDate), performanceLoading, performanceError),
    buildItem("benchmarks", "벤치마크", formatLogDate(latestBenchmarkDate), performanceLoading, performanceError),
  ];

  const dotColors: Record<DataSyncState, string> = {
    ok: "#16a34a",
    loading: "#9ca3af",
    error: "#dc2626",
    stale: "#d97706",
    empty: "#d97706",
  };

  return (
    <section
      aria-label="데이터 갱신 상태"
      className="mx-4 mb-4 border-y border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0 md:mb-6"
    >
      <div className="grid grid-cols-3">
        {items.map((item) => (
          <div
            key={item.job}
            className="relative min-w-0 border-r border-[#e0e0e0] px-3 py-2.5 last:border-r-0 dark:border-[#2a3a4a] md:px-4"
            title={item.message}
          >
            <div className="flex items-center gap-1.5 pr-5">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: dotColors[item.state] }}
              />
              <span className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
                {item.label}
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
              {item.value}
            </p>
            {(item.state === "error" || item.state === "stale" || item.state === "empty") && (
              <button
                type="button"
                onClick={() => onRetry(item.job)}
                disabled={retryingJob !== null}
                className="absolute right-2 top-2 text-sm text-gray-400 hover:text-[#3d47cf] disabled:opacity-40"
                title={`${item.label} 다시 실행`}
                aria-label={`${item.label} 다시 실행`}
              >
                {retryingJob === item.job ? "…" : "↻"}
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setHistoryOpen((open) => !open)}
        className="flex w-full items-center justify-between border-t border-[#e0e0e0] px-3 py-2 text-left text-[11px] font-medium text-gray-500 hover:bg-[#f8f9fc] dark:border-[#2a3a4a] dark:text-gray-400 dark:hover:bg-[#202a38] md:px-4"
      >
        <span>최근 동기화 이력</span>
        <span aria-hidden="true">{historyOpen ? "▲" : "▼"}</span>
      </button>
      {historyOpen && (
        <div className="border-t border-[#e0e0e0] dark:border-[#2a3a4a]">
          {runs.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">기록된 실행 이력이 없습니다.</p>
          ) : (
            runs.slice(0, 9).map((run) => (
              <div
                key={run.id}
                className="grid grid-cols-[72px_72px_minmax(0,1fr)] gap-2 border-b border-[#f0f0f0] px-3 py-2 text-xs last:border-b-0 dark:border-[#2a3a4a] md:grid-cols-[90px_100px_minmax(0,1fr)] md:px-4"
              >
                <span className="font-medium text-gray-700 dark:text-gray-200">{syncJobLabel(run.job)}</span>
                <span className={run.status === "failed" ? "text-red-600" : run.status === "partial" ? "text-amber-600" : "text-green-600"}>
                  {run.status === "failed" ? "실패" : run.status === "partial" ? "일부 완료" : "완료"}
                </span>
                <span className="min-w-0 truncate text-gray-500 dark:text-gray-400" title={syncRunDetail(run)}>
                  {formatSyncRunTime(run.finishedAt)} · {syncRunDetail(run)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

// ── 로그아웃 버튼 ────────────────────────────────────
function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase-browser");
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      alert(err instanceof Error ? err.message : "로그아웃 실패");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-[#2a3a4a] transition-colors disabled:opacity-50"
      title="로그아웃"
    >
      {loading ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}

// ── 사이드바 (데스크톱) ──────────────────────────────────
function ThemeToggle({ className }: { className: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const isDark = resolvedTheme === "dark";
  const title = mounted
    ? isDark
      ? "현재: 다크 모드. 라이트 모드로 전환"
      : "현재: 라이트 모드. 다크 모드로 전환"
    : "테마 불러오는 중";
  const ariaLabel = mounted
    ? isDark
      ? "현재 다크 모드, 라이트 모드로 전환"
      : "현재 라이트 모드, 다크 모드로 전환"
    : "테마 불러오는 중";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      disabled={!mounted}
      className={`${className} disabled:cursor-default`}
      title={title}
      aria-label={ariaLabel}
    >
      <span className={mounted ? "" : "invisible"} aria-hidden="true">
        {mounted ? (isDark ? "🌙" : "☀️") : "☀️"}
      </span>
    </button>
  );
}

function Sidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
}) {
  const items = [
    { id: "전체", label: "전체 자산" },
    { id: "개별주식", label: "개별주식" },
    { id: "개인연금", label: "개인연금" },
  ];
  return (
    <aside
      className="hidden md:flex flex-col w-56 min-h-screen px-4 py-8 shrink-0 fixed top-0 left-0"
      style={{ background: "#1a2332" }}
    >
      <div className="mb-10 px-2 flex items-center justify-between">
        <span className="text-white text-xl font-bold tracking-tight">
          Wealth<span style={{ color: "#3d47cf" }}>.</span>
        </span>
        <ThemeToggle className="text-gray-400 hover:text-white transition-colors" />
      </div>
      <nav className="flex flex-col gap-1 flex-1">
        {items.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className="text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              color: activeTab === t.id ? "#fff" : "#94a3b8",
              background: activeTab === t.id ? "#3d47cf" : "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="border-t border-[#2a3a4a] pt-4 mt-4">
        <LogoutButton />
      </div>
    </aside>
  );
}

// ── 모바일 헤더 ──────────────────────────────────────────
function MobileHeader({
  activeTab,
  onTabChange,
  onRefetch,
  refreshing,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
  onRefetch: () => void;
  refreshing: boolean;
}) {
  async function handleLogout() {
    const { supabase } = await import("@/lib/supabase-browser");
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-50"
      style={{ background: "#1a2332" }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-white text-lg font-bold tracking-tight">
          Wealth<span style={{ color: "#3d47cf" }}>.</span>
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#2a3a4a] hover:text-white" />
          <button
            onClick={onRefetch}
            disabled={refreshing}
            className="text-xs font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            style={{ background: "#3d47cf" }}
            title="가격 새로고침"
          >
            {refreshing ? "⏳" : "↻"}
          </button>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-[#2a3a4a]"
            title="로그아웃"
          >
            ⎋
          </button>
        </div>
      </div>
      <div className="flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              color: activeTab === t.id ? "#fff" : "#94a3b8",
              background: activeTab === t.id ? "#3d47cf" : "#243044",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </header>
  );
}

// ── 인라인 편집 셀 ───────────────────────────────────────
function EditableCell({
  value,
  display,
  onSave,
  onDelete,
}: {
  value: number;
  display: string;
  onSave: (v: number) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function commit() {
    const num = parseFloat(input.replace(/,/g, ""));
    setEditing(false);
    if (isNaN(num) || num === value) return;

    if (num === 0 && onDelete) {
      const confirmed = window.confirm("모두 매도하셨나요? 이 종목을 목록에서 삭제합니다.");
      if (!confirmed) return;
      setSaving(true);
      try {
        await onDelete();
      } catch {
        setHasError(true);
        setTimeout(() => setHasError(false), 2000);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (num <= 0) return;
    setSaving(true);
    try {
      await onSave(num);
    } catch {
      setHasError(true);
      setTimeout(() => setHasError(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (saving) {
    return <span className="text-xs text-gray-400">저장 중...</span>;
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="w-24 text-right bg-[#f0f4ff] dark:bg-[#1e2c3a] border border-[#3d47cf] rounded px-1.5 py-0.5 text-sm outline-none"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      className={`text-right transition-colors cursor-text ${hasError ? "text-red-500" : "hover:text-[#3d47cf] hover:underline"}`}
      onClick={() => { setInput(String(value)); setEditing(true); setHasError(false); }}
      title="클릭하여 수정"
    >
      {hasError ? "오류" : display}
    </button>
  );
}

// ── 테이블 행 (데스크톱) ─────────────────────────────────
function AssetRow({
  item,
  editable,
  onSave,
  onDelete,
  todayQuote,
}: {
  item: AssetItem;
  editable?: boolean;
  onSave?: (field: EditableAssetField, value: number) => Promise<void>;
  onDelete?: () => Promise<void>;
  todayQuote?: TodayQuote;
}) {
  const canEdit = editable && !!item.id && !!onSave;
  const isManual = item.valuationMode === "manual";
  const canEditMarket = canEdit && !isManual;
  const valuationDate = formatValuationUpdatedAt(item.valuationUpdatedAt);
  return (
    <tr className="border-b border-[#f0f0f0] dark:border-[#2a3a4a] hover:bg-[#f8f9fc] dark:hover:bg-[#1e2c3a] transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <span
            className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0"
            style={{ background: "#3d47cf" }}
          >
            {initials(item.name)}
          </span>
          <div className="min-w-0">
            <span className="font-medium text-sm text-gray-900 dark:text-white break-words">{item.name}</span>
            {isManual && (
              <div className="mt-1">
                <span className="inline-flex rounded-full bg-[#eef0ff] dark:bg-[#25304a] px-2 py-0.5 text-[11px] font-medium text-[#3d47cf] dark:text-[#aeb5ff]">
                  수동 평가{valuationDate ? ` · ${valuationDate}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-500">
        {canEditMarket ? (
          <EditableCell
            value={item.quantity}
            display={item.quantity.toLocaleString("ko-KR")}
            onSave={(v) => onSave!("quantity", v)}
            onDelete={onDelete}
          />
        ) : (
          item.quantity.toLocaleString("ko-KR")
        )}
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-500">
        {canEditMarket ? (
          <EditableCell
            value={item.avgPrice}
            display={formatKRW(item.avgPrice)}
            onSave={(v) => onSave!("avgPrice", v)}
          />
        ) : (
          formatKRW(item.avgPrice)
        )}
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-500">
        <div className="flex items-center justify-end gap-1.5">
          <span>{formatKRW(item.currentPrice)}</span>
          {!isManual && <TodayChangeBadge quote={todayQuote} />}
        </div>
      </td>
      <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900 dark:text-white">
        {canEdit && isManual ? (
          <EditableCell
            value={item.currentValue}
            display={formatKRW(item.currentValue)}
            onSave={(v) => onSave!("manualValue", v)}
          />
        ) : (
          formatKRW(item.currentValue)
        )}
      </td>
      <td
        className="py-3 px-4 text-right text-sm font-medium"
        style={{ color: rateColor(item.profitLoss) }}
      >
        {item.profitLoss >= 0 ? "+" : ""}{formatKRW(item.profitLoss)}
      </td>
      <td className="py-3 px-4 text-right">
        <RateBadge rate={item.returnRate} />
      </td>
    </tr>
  );
}

// ── 카드 행 (모바일) ─────────────────────────────────────
function AssetCard({
  item,
  editable,
  onEdit,
  todayQuote,
}: {
  item: AssetItem;
  editable?: boolean;
  onEdit?: () => void;
  todayQuote?: TodayQuote;
}) {
  const canEdit = editable && !!item.id && !!onEdit;
  const isManual = item.valuationMode === "manual";
  const valuationDate = formatValuationUpdatedAt(item.valuationUpdatedAt);
  return (
    <div className="px-4 py-3 border-b border-[#f0f0f0] dark:border-[#2a3a4a]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{item.name}</p>
          {isManual && (
            <span className="mt-1 inline-flex rounded-full bg-[#eef0ff] dark:bg-[#25304a] px-2 py-0.5 text-[11px] font-medium text-[#3d47cf] dark:text-[#aeb5ff]">
              수동 평가{valuationDate ? ` · ${valuationDate}` : ""}
            </span>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-400">
            <span>{item.quantity.toLocaleString("ko-KR")}</span>
            <span>{isManual ? "수량 · 매입" : "주 · 매입"}</span>
            <span>{formatKRW(item.avgPrice)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="mb-1 text-xs font-semibold text-[#3d47cf]"
            >
              수정
            </button>
          )}
          <div className="text-base font-bold text-gray-900 dark:text-white leading-tight">
            {formatKRW(item.currentPrice)}
          </div>
          <div className="mt-1 flex justify-end">
            {!isManual && <TodayChangeBadge quote={todayQuote} />}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400">평가금액</span>
          <span className="font-semibold text-gray-900 dark:text-white">{formatKRW(item.currentValue)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400">평가손익</span>
          <span className="font-semibold" style={{ color: rateColor(item.profitLoss) }}>
            {item.profitLoss >= 0 ? "+" : ""}{formatKRW(item.profitLoss)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400">수익률</span>
          <RateBadge rate={item.returnRate} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400">보유수량</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {item.quantity.toLocaleString("ko-KR")}{isManual ? "" : "주"}
          </span>
        </div>
      </div>
    </div>
  );
}

function MobileAssetEditModal({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: AssetItem | null;
  onClose: () => void;
  onSave: (item: AssetItem, updates: AssetUpdates) => Promise<void>;
  onDelete: (item: AssetItem) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [manualInvestAmount, setManualInvestAmount] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setQuantity(`${item.quantity}`);
    setAvgPrice(`${item.avgPrice}`);
    setManualInvestAmount(`${item.manualInvestAmount ?? item.investAmount}`);
    setManualValue(`${item.manualValue ?? item.currentValue}`);
    setModalError(null);
  }, [item]);

  if (!item) return null;
  const currentItem = item;
  const isManual = item.valuationMode === "manual";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updates: AssetUpdates = isManual
      ? {
          manualInvestAmount: Number(manualInvestAmount),
          manualValue: Number(manualValue),
        }
      : {
          quantity: Number(quantity),
          avgPrice: Number(avgPrice),
        };
    if (Object.values(updates).some((value) => !Number.isFinite(value) || (value ?? 0) <= 0)) {
      setModalError("0보다 큰 숫자를 입력해 주세요.");
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      await onSave(currentItem, updates);
      onClose();
    } catch (error: unknown) {
      setModalError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("이 종목을 목록에서 삭제할까요?")) return;
    setSaving(true);
    setModalError(null);
    try {
      await onDelete(currentItem);
      onClose();
    } catch (error: unknown) {
      setModalError(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45 md:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-asset-edit-title"
        className="w-full rounded-t-xl border-t border-[#e0e0e0] bg-white px-4 pb-6 pt-4 shadow-xl dark:border-[#2a3a4a] dark:bg-[#1a2332]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="mobile-asset-edit-title" className="min-w-0 truncate text-base font-bold text-gray-900 dark:text-white">
            {item.name}
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="h-8 w-8 text-xl text-gray-500">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {isManual ? (
              <>
                <label className="text-xs font-medium text-gray-500">
                  투자원금
                  <input type="number" inputMode="decimal" value={manualInvestAmount} onChange={(event) => setManualInvestAmount(event.target.value)} className="mt-1 w-full rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-right text-sm text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white" />
                </label>
                <label className="text-xs font-medium text-gray-500">
                  평가금액
                  <input type="number" inputMode="decimal" value={manualValue} onChange={(event) => setManualValue(event.target.value)} className="mt-1 w-full rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-right text-sm text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white" />
                </label>
              </>
            ) : (
              <>
                <label className="text-xs font-medium text-gray-500">
                  수량
                  <input type="number" inputMode="decimal" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 w-full rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-right text-sm text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white" />
                </label>
                <label className="text-xs font-medium text-gray-500">
                  평균 매입가
                  <input type="number" inputMode="decimal" step="0.01" value={avgPrice} onChange={(event) => setAvgPrice(event.target.value)} className="mt-1 w-full rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-right text-sm text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white" />
                </label>
              </>
            )}
          </div>
          {modalError && <p role="alert" className="text-xs text-red-600">{modalError}</p>}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={handleDelete} disabled={saving} className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">삭제</button>
            <button type="submit" disabled={saving} className="rounded-md bg-[#3d47cf] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 스켈레톤 ────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-[#f0f0f0]">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div className="h-4 rounded bg-gray-200 animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-24 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="space-y-1.5 text-right">
        <div className="h-3.5 w-20 rounded bg-gray-200 animate-pulse ml-auto" />
        <div className="h-3 w-16 rounded bg-gray-200 animate-pulse ml-auto" />
      </div>
    </div>
  );
}

// ── 전체 탭 포트폴리오 섹션 ──────────────────────────────
function PortfolioOverview({
  groups,
  breakdown,
  loading,
  onTabChange,
}: {
  groups: AssetGroup[];
  breakdown: PortfolioBreakdown | null;
  loading: boolean;
  onTabChange: (t: string) => void;
}) {
  if (loading) {
    return (
      <div className="mb-6 px-4 md:px-0">
        <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] p-5">
          <div className="h-5 w-28 rounded bg-gray-200 animate-pulse mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[#e0e0e0] p-4 space-y-2">
                <div className="h-3.5 w-20 rounded bg-gray-200 animate-pulse" />
                <div className="h-5 w-24 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 px-4 md:px-0">
      <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] p-5">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          포트폴리오 구성
        </h2>

        {/* 데스크톱: 가로 배치 (차트 + 카드) */}
        <div className="hidden md:flex items-start gap-8">
          <div className="shrink-0">
            <DonutChart groups={groups} />
          </div>
          <div className="flex-1 grid grid-cols-2 gap-3 content-start">
            {groups.map((g) => (
              <CategoryCard
                key={g.category}
                group={g}
                onClick={() => onTabChange(g.category)}
              />
            ))}
          </div>
        </div>

        {/* 모바일: 세로 배치 (차트 위, 카드 아래) */}
        <div className="md:hidden">
          <DonutChart groups={groups} />
          <div className="grid grid-cols-2 gap-3 mt-5">
            {groups.map((g) => (
              <CategoryCard
                key={g.category}
                group={g}
                onClick={() => onTabChange(g.category)}
              />
            ))}
          </div>
        </div>

        {/* 지역별 · 자산유형별 분류 차트 */}
        {breakdown && (breakdown.region.length > 0 || breakdown.assetType.length > 0) && (
          <div className="mt-6 pt-5 border-t border-[#f0f0f0] dark:border-[#2a3a4a]">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
              포트폴리오 분류
            </h3>
            <div className="flex justify-around gap-6">
              {breakdown.region.length > 0 && (
                <div className="flex-1 max-w-[160px]">
                  <SmallDonutChart title="지역별" items={breakdown.region} />
                </div>
              )}
              {breakdown.assetType.length > 0 && (
                <div className="flex-1 max-w-[160px]">
                  <SmallDonutChart title="자산유형별" items={breakdown.assetType} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 종목 추가 모달 ────────────────────────────────────────
function AddItemModal({
  account,
  allAccounts,
  sheetTab,
  assetCategory,
  onClose,
  onAdded,
}: {
  account: AccountGroup | null;
  allAccounts: AccountGroup[];
  sheetTab: string;
  assetCategory: AssetCategory;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [valuationMode, setValuationMode] = useState<"market" | "manual">("market");
  const [manualInvestAmount, setManualInvestAmount] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [results, setResults] = useState<StockEntry[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountName, setAccountName] = useState(account?.name ?? "");
  const [showNewAccountInput, setShowNewAccountInput] = useState(!account);
  const isComposing = useRef(false);

  async function handleNameChange(value: string) {
    setName(value);
    if (valuationMode === "manual") {
      setResults([]);
      return;
    }
    if (isComposing.current) return;
    const q = value.trim();
    if (q.length < 1) { setResults([]); return; }

    if (!_stocksCache) {
      setLoadingStocks(true);
      await loadStocks().catch(() => null);
      setLoadingStocks(false);
    }

    const stocks = _stocksCache ?? [];
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const nq = norm(q);
    const matched = stocks
      .filter(([n, t]) => norm(n).includes(nq) || norm(t).includes(nq))
      .slice(0, 8);
    setResults(matched);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(quantity.replace(/,/g, ""));
    const enteredPrice = parseFloat(avgPrice.replace(/,/g, ""));
    const investAmount = parseFloat(manualInvestAmount.replace(/,/g, ""));
    const currentValue = parseFloat(manualValue.replace(/,/g, ""));
    const price = valuationMode === "manual" && qty > 0 ? investAmount / qty : enteredPrice;
    const invalidMarket = valuationMode === "market" && (isNaN(enteredPrice) || enteredPrice <= 0);
    const invalidManual = valuationMode === "manual" && (
      isNaN(investAmount) || investAmount <= 0 || isNaN(currentValue) || currentValue <= 0
    );
    if (!name.trim() || isNaN(qty) || qty <= 0 || invalidMarket || invalidManual) {
      setError(valuationMode === "manual"
        ? "자산명, 수량, 투자원금, 평가금액을 올바르게 입력해주세요"
        : "종목명, 수량, 매입가를 올바르게 입력해주세요");
      return;
    }
    if (!accountName.trim()) {
      setError("계좌명을 입력해주세요");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/assets/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType: assetCategory,
          accountName: accountName.trim(),
          sheetTab,
          afterRowIndex: account?.insertRowIndex ?? 0,
          name: name.trim(),
          code: code.trim(),
          quantity: qty,
          avgPrice: price,
          valuationMode,
          manualInvestAmount: valuationMode === "manual" ? investAmount : undefined,
          manualValue: valuationMode === "manual" ? currentValue : undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "추가 실패");
      onAdded();
      setName("");
      setCode("");
      setQuantity("");
      setAvgPrice("");
      setManualInvestAmount("");
      setManualValue("");
      setAccountName("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 오류");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm mx-4 rounded-2xl bg-white dark:bg-[#1a2332] border border-[#e0e0e0] dark:border-[#2a3a4a] shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">종목 추가</h2>
            {account && <p className="text-xs text-gray-400 mt-0.5">{account.name}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 rounded-lg bg-[#f0f1f5] dark:bg-[#0f1923] p-1" role="group" aria-label="평가 방식">
            {(["market", "manual"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setValuationMode(mode);
                  setResults([]);
                  setCode("");
                  setError(null);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  valuationMode === mode
                    ? "bg-white text-[#3d47cf] shadow-sm dark:bg-[#243044] dark:text-[#aeb5ff]"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {mode === "market" ? "시장가격" : "수동 평가"}
              </button>
            ))}
          </div>
          {/* 계좌 선택/입력 (기존 계좌 없을 때) */}
          {!account && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">계좌명</label>
              {allAccounts.length > 0 && !showNewAccountInput && (
                <>
                  <select
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf] mb-2"
                  >
                    <option value="">— 계좌 선택 —</option>
                    {allAccounts.map((acc) => (
                      <option key={acc.name} value={acc.name}>{acc.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setShowNewAccountInput(true); setAccountName(""); }}
                    className="text-xs text-[#3d47cf] hover:underline"
                  >
                    + 새로운 계좌 추가
                  </button>
                </>
              )}
              {(allAccounts.length === 0 || showNewAccountInput) && (
                <>
                  <input
                    className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf]"
                    placeholder="예: NH_CMA(7187)"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                  {showNewAccountInput && allAccounts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setShowNewAccountInput(false); setAccountName(""); }}
                      className="text-xs text-gray-400 hover:underline mt-1"
                    >
                      ← 기존 계좌 선택
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {/* 종목명 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              종목명
              {valuationMode === "market" && loadingStocks && <span className="ml-1 text-gray-400 font-normal">종목 목록 로드 중...</span>}
            </label>
            <input
              className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf]"
              placeholder={valuationMode === "manual" ? "예: 퇴직연금 펀드" : "삼성전자"}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onCompositionStart={() => { isComposing.current = true; }}
              onCompositionEnd={(e) => { isComposing.current = false; handleNameChange(e.currentTarget.value); }}
              autoComplete="off"
            />
          </div>

          {/* 검색 결과 드롭다운 */}
          {valuationMode === "market" && results.length > 0 && (
            <div className="rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] overflow-hidden -mt-1">
              {results.map(([n, ticker]) => (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => { setName(n); setCode(ticker); setResults([]); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#f0f4ff] dark:hover:bg-[#1e2c3a] border-b border-[#f0f0f0] dark:border-[#2a3a4a] last:border-0 flex items-center justify-between"
                >
                  <span className="text-gray-800 dark:text-gray-200 truncate">{n}</span>
                  <span className="text-xs text-[#3d47cf] ml-2 shrink-0 font-mono">{ticker}</span>
                </button>
              ))}
            </div>
          )}

          {/* 종목 코드 */}
          {valuationMode === "market" && <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">종목 코드 <span className="font-normal text-gray-400">(GOOGLEFINANCE 형식)</span></label>
            <input
              className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm font-mono outline-none focus:border-[#3d47cf]"
              placeholder="KRX:005930"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>}

          {/* 수량 + 평가 기준 */}
          <div className={`grid gap-3 ${valuationMode === "manual" ? "grid-cols-1" : "grid-cols-2"}`}>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">수량</label>
              <input
                type="number"
                step="0.0001"
                className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf]"
                placeholder="100"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            {valuationMode === "market" && <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">평균 매입가</label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf]"
                placeholder="75000"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
              />
            </div>}
          </div>

          {valuationMode === "manual" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">투자원금</label>
                <input
                  type="number"
                  step="1"
                  className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf]"
                  placeholder="10000000"
                  value={manualInvestAmount}
                  onChange={(e) => setManualInvestAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">평가금액</label>
                <input
                  type="number"
                  step="1"
                  className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf]"
                  placeholder="12000000"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-medium border border-[#e0e0e0] dark:border-[#2a3a4a] text-gray-600 dark:text-gray-400 hover:bg-[#f0f0f0] dark:hover:bg-[#243044]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "#3d47cf" }}
            >
              {submitting ? "추가 중..." : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 계좌별 현황 ──────────────────────────────────────────
function AccountsOverview({
  accounts,
  totalCash,
  categoryTotalValue,
  editable,
  cashOverrides,
  onCashSave,
  onAddAccount,
}: {
  accounts: AccountGroup[];
  totalCash: number;
  categoryTotalValue: number;
  editable?: boolean;
  cashOverrides?: Record<string, number>;
  onCashSave?: (account: AccountGroup, value: number) => Promise<void>;
  onAddAccount?: () => void;
}) {
  if (accounts.length === 0 && totalCash <= 0) return null;
  const displayTotalCash = accounts.reduce(
    (sum, acct) => sum + (cashOverrides?.[acct.name] ?? acct.cash),
    0
  );

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            계좌별 현황
          </h3>
          <div className="flex items-center gap-2">
            {editable && onAddAccount && (
              <button
                onClick={onAddAccount}
                className="text-xs font-semibold text-white px-2 py-1 rounded-full"
                style={{ background: "#3d47cf" }}
                title="새로운 계좌 추가"
              >
                + 계좌
              </button>
            )}
            {displayTotalCash > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">전체 현금</span>
                <span className="text-sm font-bold text-gray-800 dark:text-white">{formatKRW(displayTotalCash)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map((acct) => {
            const displayCash = cashOverrides?.[acct.name] ?? acct.cash;
            const displayTotalValue = accountValueWithCashOverride(acct, cashOverrides);
            const canEditCash = editable && !!onCashSave;
            const updatedAt = accountDataUpdatedAt(acct);
            const stale = isAccountStale(acct);
            const allocation = categoryTotalValue > 0 ? (displayTotalValue / categoryTotalValue) * 100 : 0;
            return (
              <div
                key={acct.name}
                className="rounded-lg border border-[#e8e8e8] dark:border-[#2a3a4a] p-3 bg-[#f8f9fc] dark:bg-[#0f1923]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-bold text-[#3d47cf]">{acct.name}</p>
                  <span className="shrink-0 text-[11px] font-medium text-gray-400">{allocation.toFixed(1)}%</span>
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{formatKRW(displayTotalValue)}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-400">원금 {formatKRW(acct.totalInvest)}</span>
                  <RateBadge rate={acct.returnRate} />
                </div>
                {displayCash > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#e8e8e8] dark:border-[#2a3a4a] flex items-center justify-between">
                    <span className="text-xs text-gray-400">현금</span>
                    {canEditCash ? (
                      <EditableCell
                        value={displayCash}
                        display={formatKRW(displayCash)}
                        onSave={(v) => onCashSave!(acct, v)}
                      />
                    ) : (
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {formatKRW(displayCash)}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-2 border-t border-[#e8e8e8] pt-2 text-[11px] dark:border-[#2a3a4a]">
                  <span className={stale ? "font-medium text-amber-600" : "text-gray-400"}>
                    {updatedAt
                      ? `${stale ? "오래됨 · " : ""}갱신 ${formatPriceUpdatedAt(updatedAt)}`
                      : "갱신일 미확인"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AccountManagementToolbar({
  query,
  sortMode,
  hideInactive,
  visibleCount,
  totalCount,
  allCollapsed,
  onQueryChange,
  onSortChange,
  onHideInactiveChange,
  onToggleAll,
}: {
  query: string;
  sortMode: AccountSortMode;
  hideInactive: boolean;
  visibleCount: number;
  totalCount: number;
  allCollapsed: boolean;
  onQueryChange: (value: string) => void;
  onSortChange: (value: AccountSortMode) => void;
  onHideInactiveChange: (value: boolean) => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="mx-4 mb-3 border-y border-[#e0e0e0] bg-white px-3 py-3 dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0">
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 md:grid-cols-[minmax(220px,1fr)_150px_auto_auto] md:items-center">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="계좌 검색"
          aria-label="계좌 검색"
          className="min-w-0 rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#3d47cf] dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white"
        />
        <select
          value={sortMode}
          onChange={(event) => onSortChange(event.target.value as AccountSortMode)}
          aria-label="계좌 정렬"
          className="rounded-md border border-[#d6d9e0] bg-white px-2 py-2 text-xs text-gray-700 outline-none dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-gray-200"
        >
          <option value="value">자산금액순</option>
          <option value="return">수익률순</option>
          <option value="name">이름순</option>
          <option value="freshness">최근 갱신순</option>
        </select>
        <label className="col-span-2 flex items-center gap-2 text-xs text-gray-500 md:col-span-1 dark:text-gray-400">
          <input type="checkbox" checked={hideInactive} onChange={(event) => onHideInactiveChange(event.target.checked)} />
          오래된·빈 계좌 숨김
        </label>
        <button type="button" onClick={onToggleAll} disabled={visibleCount === 0} className="col-span-2 rounded-md border border-[#d6d9e0] px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40 md:col-span-1 dark:border-[#3a4658] dark:text-gray-300">
          {allCollapsed ? "모두 펼치기" : "모두 접기"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">{visibleCount}/{totalCount}개 계좌</p>
    </div>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────
function changeCandidateKey(candidate: PortfolioChangeCandidate): string {
  return `${candidate.date}|${candidate.category}|${candidate.accountName}`;
}

function PortfolioEventReviewModal({
  open,
  candidates,
  savingKey,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  candidates: PortfolioChangeCandidate[];
  savingKey: string | null;
  error: string | null;
  onClose: () => void;
  onSave: (
    candidate: PortfolioChangeCandidate,
    eventType: PortfolioEventType,
    amount: number
  ) => Promise<void>;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    setAmounts((previous) => {
      const next = { ...previous };
      candidates.forEach((candidate) => {
        const key = changeCandidateKey(candidate);
        if (next[key] === undefined) next[key] = `${candidate.detectedAmount}`;
      });
      return next;
    });
  }, [candidates]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-event-review-title"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[#e0e0e0] bg-white shadow-xl dark:border-[#2a3a4a] dark:bg-[#1a2332]"
      >
        <div className="flex items-center justify-between border-b border-[#e0e0e0] px-4 py-3 dark:border-[#2a3a4a]">
          <h2 id="portfolio-event-review-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            변동 확인
          </h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-xl text-gray-500 hover:text-gray-900 dark:hover:text-white"
          >
            ×
          </button>
        </div>

        {error && (
          <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="max-h-[70vh] overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">확인할 변동이 없습니다.</p>
          ) : candidates.map((candidate) => {
            const key = changeCandidateKey(candidate);
            const amount = Number(amounts[key] ?? candidate.detectedAmount);
            const isSaving = savingKey === key;
            return (
              <div key={key} className="border-b border-[#f0f0f0] px-4 py-4 last:border-b-0 dark:border-[#2a3a4a]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{candidate.accountName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(candidate.date).toLocaleDateString("ko-KR")} · {candidate.category === "stocks" ? "개별주식" : "개인연금"}
                    </p>
                  </div>
                  <input
                    type="number"
                    value={amounts[key] ?? `${candidate.detectedAmount}`}
                    onChange={(event) => setAmounts((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))}
                    aria-label={`${candidate.accountName} 변동 금액`}
                    className="w-36 rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-right text-sm font-semibold text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-gray-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {([
                    ["deposit", "입금"],
                    ["withdrawal", "출금"],
                    ["transfer_in", "이체 받음"],
                    ["transfer_out", "이체 보냄"],
                    ["valuation_adjustment", "평가액 수정"],
                    ["ignored", "무시"],
                  ] as const).map(([eventType, label]) => (
                    <button
                      key={eventType}
                      type="button"
                      disabled={isSaving || (eventType !== "ignored" && (!Number.isFinite(amount) || amount === 0))}
                      onClick={() => onSave(candidate, eventType, eventType === "ignored" ? 0 : amount)}
                      className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        eventType === "valuation_adjustment"
                          ? "border-[#3d47cf] bg-[#eef1ff] text-[#3d47cf] dark:bg-[#202a48]"
                          : "border-[#d6d9e0] text-gray-700 hover:bg-gray-50 dark:border-[#3a4658] dark:text-gray-200 dark:hover:bg-[#243044]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, refreshing, refetch, reload } = useAssets();
  const [activeTab, setActiveTab] = useState<string>("전체");
  const [itemOverrides, setItemOverrides] = useState<Record<string, Partial<AssetItem>>>({});
  const [cashOverrides, setCashOverrides] = useState<Record<string, number>>({});
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
  const [addModalAccount, setAddModalAccount] = useState<AccountGroup | "new" | null>(null);
  const [profitLogs, setProfitLogs] = useState<DailyLogItem[]>([]);
  const [benchmarkSeries, setBenchmarkSeries] = useState<BenchmarkSeries[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [portfolioEvents, setPortfolioEvents] = useState<PortfolioEvent[]>([]);
  const [changeCandidates, setChangeCandidates] = useState<PortfolioChangeCandidate[]>([]);
  const [eventReviewOpen, setEventReviewOpen] = useState(false);
  const [savingEventKey, setSavingEventKey] = useState<string | null>(null);
  const [eventSaveError, setEventSaveError] = useState<string | null>(null);
  const [profitLogMeta, setProfitLogMeta] = useState<ProfitLogMeta | null>(null);
  const [savingProfit, setSavingProfit] = useState(false);
  const [todayQuotes, setTodayQuotes] = useState<Record<string, TodayQuote>>({});
  const [todayQuotesLoading, setTodayQuotesLoading] = useState(false);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [syncRunsLoading, setSyncRunsLoading] = useState(true);
  const [syncRunsError, setSyncRunsError] = useState<string | null>(null);
  const [retryingJob, setRetryingJob] = useState<SyncJob | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountSort, setAccountSort] = useState<AccountSortMode>("value");
  const [hideInactiveAccounts, setHideInactiveAccounts] = useState(false);
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);

  const fetchSyncRuns = useCallback(async () => {
    setSyncRunsLoading(true);
    setSyncRunsError(null);
    try {
      const res = await fetch("/api/sync-runs", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as { runs: SyncRun[] };
      setSyncRuns(json.runs);
    } catch (syncError: unknown) {
      setSyncRunsError(syncError instanceof Error ? syncError.message : "동기화 이력을 불러오지 못했습니다.");
    } finally {
      setSyncRunsLoading(false);
    }
  }, []);

  const fetchPerformanceData = useCallback(async () => {
    setPerformanceLoading(true);
    setPerformanceError(null);
    try {
      const res = await fetch("/api/profits", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        data: DailyLogItem[];
        benchmarks?: BenchmarkSeries[];
        portfolioEvents?: PortfolioEvent[];
        changeCandidates?: PortfolioChangeCandidate[];
        meta?: ProfitLogMeta;
      };
      setProfitLogs(json.data);
      setBenchmarkSeries(json.benchmarks ?? []);
      setPortfolioEvents(json.portfolioEvents ?? []);
      setChangeCandidates(json.changeCandidates ?? []);
      setProfitLogMeta(json.meta ?? null);
    } catch (performanceFetchError: unknown) {
      setPerformanceError(
        performanceFetchError instanceof Error
          ? performanceFetchError.message
          : "성과 데이터를 불러오지 못했습니다."
      );
    } finally {
      setPerformanceLoading(false);
    }
  }, []);

  async function saveItemUpdates(item: AssetItem, updates: AssetUpdates) {
    const res = await fetch("/api/assets/item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, updates }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? "저장 실패");
    }
    const key = assetKey(item);
    setItemOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...updates } }));
    // 대시보드 데이터 갱신
    await reload();
  }

  async function saveItem(item: AssetItem, field: EditableAssetField, value: number) {
    const updates: AssetUpdates = { [field]: value };
    await saveItemUpdates(item, updates);
  }

  async function saveCash(account: AccountGroup, value: number) {
    try {
      // Supabase에 직접 업데이트 (계좌명 기반)
      const res = await fetch("/api/cash-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: account.name, amount: value }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "저장 실패");
      }

      const key = `${account.name}`;
      setCashOverrides((prev) => ({ ...prev, [key]: value }));
      // 대시보드 데이터 갱신
      await reload();
    } catch (err) {
      throw err instanceof Error ? err : new Error("현금 저장 실패");
    }
  }

  function handleItemAdded() {
    setItemOverrides({});
    setDeletedKeys(new Set());
    void reload();
  }

  useEffect(() => {
    fetchPerformanceData();
    fetchSyncRuns();
  }, [fetchPerformanceData, fetchSyncRuns]);

  useEffect(() => {
    setAccountQuery("");
    setCollapsedAccounts(new Set());
    setEditingAsset(null);
  }, [activeTab]);

  async function retrySyncJob(job: SyncJob) {
    if (retryingJob) return;
    setRetryingJob(job);
    setSyncRunsError(null);
    try {
      const res = await fetch("/api/sync-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "동기화 재시도에 실패했습니다.");
      }

      if (job === "prices") await reload();
      if (job === "daily_log" || job === "benchmarks") await fetchPerformanceData();
      await fetchSyncRuns();
    } catch (syncError: unknown) {
      setSyncRunsError(syncError instanceof Error ? syncError.message : "동기화 재시도에 실패했습니다.");
      await fetchSyncRuns();
    } finally {
      setRetryingJob(null);
    }
  }

  async function refreshDashboard() {
    await refetch();
    await fetchSyncRuns();
  }

  async function savePortfolioEvent(
    candidate: PortfolioChangeCandidate,
    eventType: PortfolioEventType,
    amount: number
  ) {
    const key = changeCandidateKey(candidate);
    setSavingEventKey(key);
    setEventSaveError(null);
    try {
      const res = await fetch("/api/portfolio-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...candidate, eventType, amount }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "변동 저장 실패");
      }

      const refreshed = await fetch("/api/profits", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("성과 데이터 갱신 실패");
      const json = (await refreshed.json()) as {
        data: DailyLogItem[];
        benchmarks?: BenchmarkSeries[];
        portfolioEvents?: PortfolioEvent[];
        changeCandidates?: PortfolioChangeCandidate[];
        meta?: ProfitLogMeta;
      };
      setProfitLogs(json.data);
      setBenchmarkSeries(json.benchmarks ?? []);
      setPortfolioEvents(json.portfolioEvents ?? []);
      setChangeCandidates(json.changeCandidates ?? []);
      setProfitLogMeta(json.meta ?? null);
      if ((json.changeCandidates ?? []).length === 0) setEventReviewOpen(false);
    } catch (error) {
      setEventSaveError(error instanceof Error ? error.message : "변동 저장 실패");
    } finally {
      setSavingEventKey(null);
    }
  }

  async function saveProfit() {
    if (!data?.summary || savingProfit) return;
    setSavingProfit(true);
    try {
      const summary = data.summary;
      const portfolioGroups = summary.groups;
      const portfolioInvest = portfolioGroups.reduce((s, g) => s + g.totalInvest, 0);
      const portfolioValue = portfolioGroups.reduce((s, g) => s + g.totalValue, 0);
      const portfolioCash = portfolioGroups.reduce((s, g) => s + g.cash, 0);
      const portfolioProfit = portfolioGroups.reduce((s, g) => s + g.totalProfitLoss, 0);
      const totalGroup = summary.groups.find((g) => g.category === "개별주식");
      const pensionGroup = summary.groups.find((g) => g.category === "개인연금");
      const irpGroup = summary.groups.find((g) => g.category === "IRP");

      const res = await fetch("/api/profits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: {
            invest: portfolioInvest,
            value: portfolioValue - portfolioCash,
            profit: portfolioProfit,
            total: portfolioValue,
          },
          stocks: totalGroup ? {
            invest: totalGroup.totalInvest,
            value: totalGroup.totalValue - totalGroup.cash,
            profit: totalGroup.totalProfitLoss,
            total: totalGroup.totalValue,
          } : { invest: 0, value: 0, profit: 0, total: 0 },
          pension: pensionGroup ? {
            invest: pensionGroup.totalInvest,
            value: pensionGroup.totalValue - pensionGroup.cash,
            profit: pensionGroup.totalProfitLoss,
            total: pensionGroup.totalValue,
          } : { invest: 0, value: 0, profit: 0, total: 0 },
          blockchain: irpGroup ? {
            invest: irpGroup.totalInvest,
            value: irpGroup.totalValue - irpGroup.cash,
            profit: irpGroup.totalProfitLoss,
            total: irpGroup.totalValue,
          } : { invest: 0, value: 0, profit: 0, total: 0 },
          crypto: { invest: 0, value: 0, profit: 0, total: 0 },
        }),
      });

      if (res.ok) {
        const newRes = await fetch("/api/profits");
        if (newRes.ok) {
          const json = (await newRes.json()) as {
            data: DailyLogItem[];
            benchmarks?: BenchmarkSeries[];
            portfolioEvents?: PortfolioEvent[];
            changeCandidates?: PortfolioChangeCandidate[];
            meta?: ProfitLogMeta;
          };
          setProfitLogs(json.data);
          setBenchmarkSeries(json.benchmarks ?? []);
          setPortfolioEvents(json.portfolioEvents ?? []);
          setChangeCandidates(json.changeCandidates ?? []);
          setProfitLogMeta(json.meta ?? null);
        }
      }
    } catch {
      // 오류 무시
    } finally {
      setSavingProfit(false);
    }
  }

  async function deleteItem(item: AssetItem) {
    const res = await fetch("/api/assets/item", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? "삭제 실패");
    }
    setItemOverrides({});
    setDeletedKeys(new Set());
    void reload();
  }

  const summary = data?.summary;

  const adjustedGroups: AssetGroup[] = (() => {
    if (!summary) return [];
    return summary.groups;
  })();

  const isEditable = activeTab !== "전체";

  const displayItems: AssetItem[] = (() => {
    if (!summary) return [];
    if (activeTab === "전체") {
      return adjustedGroups
        .filter((g) => g.category !== "개별주식")
        .flatMap((g) => g.items)
        .sort((a, b) => b.returnRate - a.returnRate);
    }
    const group = summary.groups.find(
      (g) => g.category === (activeTab as AssetCategory)
    );
    const rawItems = (group?.items ?? [])
      .filter((item) => !deletedKeys.has(assetKey(item)))
      .sort((a, b) => b.returnRate - a.returnRate);
    // 로컬 편집 오버라이드 적용
    return rawItems.map((item) => {
      const key = assetKey(item);
      const ov = itemOverrides[key];
      if (!ov) return item;
      const quantity = ov.quantity ?? item.quantity;
      const avgPrice = ov.avgPrice ?? item.avgPrice;
      const currentValue = ov.manualValue ?? item.currentValue;
      const investAmount = item.valuationMode === "manual"
        ? ov.manualInvestAmount ?? item.manualInvestAmount ?? item.investAmount
        : quantity * avgPrice;
      const profitLoss = currentValue - investAmount;
      const returnRate = investAmount > 0 ? (profitLoss / investAmount) * 100 : 0;
      return { ...item, quantity, avgPrice, currentValue, investAmount, profitLoss, returnRate };
    });
  })();

  const tabSummary = (() => {
    if (!summary) return null;
    if (activeTab === "전체") {
      const totalInvest = adjustedGroups.reduce((s, g) => s + g.totalInvest, 0);
      const totalValue = adjustedGroups.reduce((sum, group) => {
        const displayCash = group.accounts.reduce(
          (cashSum, account) => cashSum + (cashOverrides[account.name] ?? account.cash),
          0
        );
        return sum + group.totalValue - group.cash + displayCash;
      }, 0);
      const totalProfitLoss = adjustedGroups.reduce((sum, group) => sum + group.totalProfitLoss, 0);
      const returnRate = totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0;
      return {
        totalInvest,
        totalValue,
        totalProfitLoss,
        returnRate,
        priceUpdatedAt: summary.priceUpdatedAt,
      };
    }
    const g = summary.groups.find((g) => g.category === activeTab);
    if (!g) return null;
    const displayCash = g.accounts.reduce(
      (sum, account) => sum + (cashOverrides[account.name] ?? account.cash),
      0
    );
    const totalValue = g.totalValue - g.cash + displayCash;
    const totalProfitLoss = g.totalProfitLoss;
    return {
      totalInvest: g.totalInvest,
      totalValue,
      totalProfitLoss,
      returnRate: g.totalInvest > 0 ? (totalProfitLoss / g.totalInvest) * 100 : 0,
      priceUpdatedAt: latestPriceUpdatedAt(g.items),
    };
  })();
  const todayQuoteCodes = useMemo(
    () =>
      activeTab === "전체" || loading
        ? []
        : Array.from(
            new Set(displayItems.map((item) => item.code).filter((code): code is string => Boolean(code)))
          ),
    [activeTab, displayItems, loading]
  );
  const todayQuoteCodesKey = todayQuoteCodes.join("|");

  useEffect(() => {
    const codes = todayQuoteCodesKey ? todayQuoteCodesKey.split("|") : [];
    if (codes.length === 0) {
      setTodayQuotes({});
      setTodayQuotesLoading(false);
      return;
    }

    let cancelled = false;
    setTodayQuotesLoading(true);

    fetch("/api/market-today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { quotes?: Record<string, TodayQuote> };
      })
      .then((json) => {
        if (!cancelled) {
          setTodayQuotes(json.quotes ?? {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTodayQuotes({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTodayQuotesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [todayQuoteCodesKey]);

  // 카테고리 탭에서 섹터별 그룹핑
  const sectorGroups: { sector: string; items: AssetItem[]; totalValue: number; totalProfitLoss: number; returnRate: number }[] | null = (() => {
    if (activeTab === "전체" || loading) return null;
    if (!displayItems.some((i) => i.sector)) return null;
    const map: Record<string, AssetItem[]> = {};
    for (const item of displayItems) {
      const key = item.sector ?? "기타";
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return Object.entries(map)
      .map(([sector, items]) => {
        const totalValue = items.reduce((s, i) => s + i.currentValue, 0);
        const totalInvest = items.reduce((s, i) => s + i.investAmount, 0);
        const totalProfitLoss = items.reduce((s, i) => s + i.profitLoss, 0);
        const returnRate = totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0;
        return { sector, items, totalValue, totalProfitLoss, returnRate };
      })
      .sort((a, b) => b.totalValue - a.totalValue);
  })();

  // 계좌별 그룹핑 (개별주식·개인연금·IRP, 계좌 정보 있을 때)
  const accountGroups: { account: AccountGroup; items: AssetItem[] }[] | null = (() => {
    if (activeTab === "전체" || loading) return null;
    const group = summary?.groups.find((g) => g.category === (activeTab as AssetCategory));
    if (!group || group.accounts.length === 0) return null;
    return group.accounts.map((acct) => {
      const items = acct.items
        .filter((item) => !deletedKeys.has(assetKey(item)))
        .map((item) => {
          const key = assetKey(item);
          const ov = itemOverrides[key];
          if (!ov) return item;
          const quantity = ov.quantity ?? item.quantity;
          const avgPrice = ov.avgPrice ?? item.avgPrice;
          const currentValue = ov.manualValue ?? item.currentValue;
          const investAmount = item.valuationMode === "manual"
            ? ov.manualInvestAmount ?? item.manualInvestAmount ?? item.investAmount
            : quantity * avgPrice;
          const profitLoss = currentValue - investAmount;
          const returnRate = investAmount > 0 ? (profitLoss / investAmount) * 100 : 0;
          return { ...item, quantity, avgPrice, currentValue, investAmount, profitLoss, returnRate };
        });
      return { account: { ...acct, items }, items };
    });
  })();

  const managedAccountGroups = accountGroups
    ? accountGroups
        .filter(({ account }) => account.name.toLocaleLowerCase("ko-KR").includes(accountQuery.trim().toLocaleLowerCase("ko-KR")))
        .filter(({ account }) => (
          !hideInactiveAccounts
          || (accountValueWithCashOverride(account, cashOverrides) > 0 && !isAccountStale(account))
        ))
        .sort((left, right) => {
          if (accountSort === "name") return left.account.name.localeCompare(right.account.name, "ko-KR");
          if (accountSort === "return") return right.account.returnRate - left.account.returnRate;
          if (accountSort === "freshness") {
            const leftTime = new Date(accountDataUpdatedAt(left.account) ?? 0).getTime();
            const rightTime = new Date(accountDataUpdatedAt(right.account) ?? 0).getTime();
            return rightTime - leftTime;
          }
          return accountValueWithCashOverride(right.account, cashOverrides)
            - accountValueWithCashOverride(left.account, cashOverrides);
        })
    : null;
  const visibleAccountNames = managedAccountGroups?.map(({ account }) => account.name) ?? [];
  const allVisibleAccountsCollapsed = visibleAccountNames.length > 0
    && visibleAccountNames.every((name) => collapsedAccounts.has(name));

  function toggleAccount(accountName: string) {
    setCollapsedAccounts((previous) => {
      const next = new Set(previous);
      if (next.has(accountName)) next.delete(accountName);
      else next.add(accountName);
      return next;
    });
  }

  function toggleAllAccounts() {
    setCollapsedAccounts((previous) => {
      const next = new Set(previous);
      if (allVisibleAccountsCollapsed) visibleAccountNames.forEach((name) => next.delete(name));
      else visibleAccountNames.forEach((name) => next.add(name));
      return next;
    });
  }

  const rebalanceGroup = activeTab === "개별주식" || activeTab === "개인연금"
    ? summary?.groups.find((candidate) => candidate.category === activeTab) ?? null
    : null;
  const rebalanceCategory: RebalanceCategory | null = activeTab === "개별주식"
    ? "stocks"
    : activeTab === "개인연금"
      ? "pension"
      : null;

  const title = activeTab === "전체" ? "전체 자산 현황" : activeTab;
  const latestBenchmarkDate = benchmarkSeries
    .flatMap((series) => series.points.map((point) => point.date))
    .sort()
    .at(-1);

  return (
    <div className="flex min-h-screen bg-[#f8f9fc] dark:bg-[#0f1923]">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <MobileHeader activeTab={activeTab} onTabChange={setActiveTab} onRefetch={refreshDashboard} refreshing={refreshing} />

      <main className="flex-1 overflow-auto pt-[88px] md:pt-0 md:px-8 md:py-8 md:ml-56">
        {/* 데스크톱 헤더 */}
        <div className="hidden md:flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshDashboard}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#3d47cf" }}
            >
              {refreshing ? "⏳ 새로고침 중..." : "↻ 새로고침"}
            </button>
          </div>
        </div>

        {/* 모바일 타이틀 */}
        <div className="md:hidden px-4 pt-2 pb-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h1>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mx-4 md:mx-0 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            데이터를 불러오지 못했습니다: {error}
          </div>
        )}

        <DataSyncStatus
          priceUpdatedAt={data?.summary.priceUpdatedAt}
          latestLogDate={profitLogMeta?.latestLogDate}
          latestBenchmarkDate={latestBenchmarkDate}
          assetsError={error}
          performanceError={performanceError}
          assetsLoading={loading}
          performanceLoading={performanceLoading}
          runs={syncRuns}
          runsLoading={syncRunsLoading}
          runsError={syncRunsError}
          retryingJob={retryingJob}
          onRetry={retrySyncJob}
        />

        {/* Summary 카드 */}
        <div className="grid grid-cols-3 gap-2 px-4 md:px-0 mb-4 md:mb-6 md:gap-4">
          <SummaryCard
            label="현재가치"
            value={loading ? "—" : formatKRW(tabSummary?.totalValue ?? 0)}
          />
          <SummaryCard
            label="평가손익"
            value={
              loading
                ? "—"
                : `${(tabSummary?.totalProfitLoss ?? 0) >= 0 ? "+" : ""}${formatKRW(tabSummary?.totalProfitLoss ?? 0)}`
            }
            sub={
              loading || !tabSummary
                ? undefined
                : `원금 ${formatKRW(tabSummary.totalInvest)}`
            }
          />
          <SummaryCard
            label="수익률"
            value={loading ? "—" : formatRate(tabSummary?.returnRate ?? 0)}
          />
        </div>

        {changeCandidates.length > 0 && (
          <div className="mx-4 mb-4 flex items-center justify-between gap-3 border-y border-amber-200 bg-amber-50 px-3 py-2.5 md:mx-0 dark:border-amber-900/60 dark:bg-amber-950/30">
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">변동 확인</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">{changeCandidates.length}건</p>
            </div>
            <button
              type="button"
              onClick={() => setEventReviewOpen(true)}
              className="rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
            >
              확인
            </button>
          </div>
        )}

        {/* 전체 탭: 포트폴리오 구성 섹션 */}
        {activeTab === "전체" && (
          <>
            <PortfolioOverview
              groups={adjustedGroups}
              breakdown={data?.breakdown ?? null}
              loading={loading}
              onTabChange={setActiveTab}
            />
            {/* 총자산 추이 차트 */}
            <AssetTrendChart logs={profitLogs} benchmarks={benchmarkSeries} events={portfolioEvents} meta={profitLogMeta} category="전체" />
          </>
        )}

        {activeTab !== "전체" && accountGroups && (
          <AccountManagementToolbar
            query={accountQuery}
            sortMode={accountSort}
            hideInactive={hideInactiveAccounts}
            visibleCount={managedAccountGroups?.length ?? 0}
            totalCount={accountGroups.length}
            allCollapsed={allVisibleAccountsCollapsed}
            onQueryChange={setAccountQuery}
            onSortChange={setAccountSort}
            onHideInactiveChange={setHideInactiveAccounts}
            onToggleAll={toggleAllAccounts}
          />
        )}

        {/* 계좌별 현황 (개별주식, 개인연금, IRP) */}
        {activeTab !== "전체" && (() => {
          const group = summary?.groups.find((g) => g.category === activeTab);
          if (!group) return null;
          return (
            <AccountsOverview
              accounts={managedAccountGroups?.map(({ account }) => account) ?? group.accounts}
              totalCash={managedAccountGroups
                ? managedAccountGroups.reduce((sum, { account }) => sum + account.cash, 0)
                : group.cash}
              categoryTotalValue={tabSummary?.totalValue ?? group.totalValue}
              editable={isEditable}
              cashOverrides={cashOverrides}
              onCashSave={saveCash}
              onAddAccount={() => setAddModalAccount("new")}
            />
          );
        })()}

        {(activeTab === "개별주식" || activeTab === "개인연금") && (
          <AssetTrendChart
            logs={profitLogs}
            benchmarks={benchmarkSeries}
            events={portfolioEvents}
            meta={profitLogMeta}
            category={activeTab}
          />
        )}

        {rebalanceGroup && rebalanceCategory && (
          <RebalancePanel group={rebalanceGroup} category={rebalanceCategory} />
        )}

        {/* 전체 탭: 카테고리별 계좌 현황 */}
        {activeTab === "전체" && summary && (
          <div className="mx-4 md:mx-0 mb-6">
            {summary.groups.map((group) => {
              if (group.category === "개별주식" || group.category === "개인연금" || group.category === "IRP") return null;
              if (group.accounts.length === 0 && group.cash <= 0) return null;
              return (
                <div key={group.category} className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    {group.category} 계좌
                  </h2>
                  <AccountsOverview
                    accounts={group.accounts}
                    totalCash={group.cash}
                    categoryTotalValue={group.totalValue}
                    editable={isEditable}
                    cashOverrides={cashOverrides}
                    onCashSave={saveCash}
                    onAddAccount={undefined}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* 자산 목록 (전체 탭 제외) */}
        {activeTab !== "전체" && <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] overflow-hidden mx-4 md:mx-0 mb-6">
          {/* 섹션 제목 */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#f0f0f0] dark:border-[#2a3a4a]">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {activeTab === "전체" ? "전체 종목" : `${activeTab} 종목`}
              {!loading && (() => {
                const count = accountGroups
                  ? (managedAccountGroups ?? []).reduce((s, ag) => s + ag.items.length, 0)
                  : displayItems.length;
                return count > 0 ? <span className="ml-1.5 text-gray-400 font-normal">({count})</span> : null;
              })()}
            </span>
            {!loading && tabSummary?.priceUpdatedAt && (
              <span className="shrink-0 text-[11px] font-medium text-gray-400">
                현재가 기준 {formatPriceUpdatedAt(tabSummary.priceUpdatedAt)}
                {todayQuotesLoading ? " · 등락률 조회 중" : ""}
              </span>
            )}
          </div>

          {/* 모바일: 카드 */}
          <div className="md:hidden">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : managedAccountGroups ? (
              managedAccountGroups.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">조건에 맞는 계좌가 없습니다.</p>
              ) : managedAccountGroups.map(({ account, items }) => (
                <div key={account.name}>
                  <button
                    type="button"
                    onClick={() => toggleAccount(account.name)}
                    aria-expanded={!collapsedAccounts.has(account.name)}
                    className="flex w-full items-center justify-between gap-2 border-b border-[#e0e0e0] bg-[#f0f2f8] px-4 py-2 text-left dark:border-[#2a3a4a] dark:bg-[#0f1923]"
                  >
                    <span className="min-w-0 truncate text-xs font-bold leading-tight text-[#3d47cf]">
                      {collapsedAccounts.has(account.name) ? "▸" : "▾"} {account.name}
                      <span className="ml-1.5 font-normal text-gray-400">({items.length})</span>
                    </span>
                    <span className="flex h-5 shrink-0 items-center gap-1.5">
                      <span className="text-xs leading-tight text-gray-500">
                        {formatKRW(accountValueWithCashOverride(account, cashOverrides))}
                      </span>
                      <RateBadge rate={account.returnRate} />
                    </span>
                  </button>
                  {!collapsedAccounts.has(account.name) && (
                    <>
                      {items.map((item) => (
                        <AssetCard
                          key={assetKey(item)}
                          item={item}
                          editable={isEditable}
                          onEdit={() => setEditingAsset(item)}
                          todayQuote={item.code ? todayQuotes[item.code] : undefined}
                        />
                      ))}
                      {isEditable && (
                        <div className="border-t border-[#e0e0e0] px-4 py-3 dark:border-[#2a3a4a]">
                          <button
                            onClick={() => setAddModalAccount(account)}
                            className="rounded-md bg-[#3d47cf] px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            + 추가
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            ) : sectorGroups ? (
              sectorGroups.map(({ sector, items, totalValue, returnRate }) => (
                <div key={sector}>
                  <div className="flex items-center justify-between px-4 py-2 bg-[#f0f2f8] dark:bg-[#0f1923] border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
                    <span className="text-xs font-bold text-[#3d47cf] leading-tight">
                      {sector}
                      <span className="ml-1.5 font-normal text-gray-400">({items.length})</span>
                    </span>
                    <div className="flex items-center gap-1.5 h-5">
                      <span className="text-xs text-gray-500 leading-tight">{formatKRW(totalValue)}</span>
                      <RateBadge rate={returnRate} />
                    </div>
                  </div>
                  {items.map((item, idx) => (
                    <AssetCard
                      key={`${sector}-${idx}`}
                      item={item}
                      editable={isEditable}
                      onEdit={() => setEditingAsset(item)}
                      todayQuote={item.code ? todayQuotes[item.code] : undefined}
                    />
                  ))}
                </div>
              ))
            ) : displayItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">데이터가 없습니다.</p>
            ) : (
              displayItems.map((item, idx) => (
                <AssetCard
                  key={`${activeTab}-${idx}`}
                  item={item}
                  editable={isEditable}
                  onEdit={() => setEditingAsset(item)}
                  todayQuote={item.code ? todayQuotes[item.code] : undefined}
                />
              ))
            )}
          </div>

          {/* 데스크톱: 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
                  {["종목", "수량", "평균매입가", "현재가", "현재가치", "평가손익", "수익률"].map((h) => (
                    <th
                      key={h}
                      className="py-3 px-4 text-xs font-semibold text-gray-500 text-right first:text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : managedAccountGroups ? (
                  managedAccountGroups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm text-gray-400">조건에 맞는 계좌가 없습니다.</td>
                    </tr>
                  ) : managedAccountGroups.map(({ account, items }) => (
                    <Fragment key={account.name}>
                      <tr className="border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
                        <td colSpan={7} className="px-4 py-2 bg-[#f0f2f8] dark:bg-[#0f1923]">
                          <button
                            type="button"
                            onClick={() => toggleAccount(account.name)}
                            aria-expanded={!collapsedAccounts.has(account.name)}
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <span className="text-xs font-bold leading-tight text-[#3d47cf]">
                              {collapsedAccounts.has(account.name) ? "▸" : "▾"} {account.name}
                              <span className="ml-1.5 font-normal text-gray-400">({items.length}종목)</span>
                            </span>
                            <div className="flex items-center gap-1.5 h-5">
                              <span className="text-xs text-gray-500 leading-tight whitespace-nowrap">
                                {formatKRW(accountValueWithCashOverride(account, cashOverrides))}
                              </span>
                              <span
                                className="text-xs font-medium leading-tight whitespace-nowrap"
                                style={{ color: rateColor(account.totalProfitLoss) }}
                              >
                                {account.totalProfitLoss >= 0 ? "+" : ""}{formatKRW(account.totalProfitLoss)}
                              </span>
                              <RateBadge rate={account.returnRate} />
                            </div>
                          </button>
                        </td>
                      </tr>
                      {!collapsedAccounts.has(account.name) && items.map((item, idx) => (
                        <AssetRow
                          key={`${account.name}-${idx}-${item.name}`}
                          item={item}
                          editable={isEditable}
                          onSave={(field, value) => saveItem(item, field, value)}
                          onDelete={() => deleteItem(item)}
                          todayQuote={item.code ? todayQuotes[item.code] : undefined}
                        />
                      ))}
                      {!collapsedAccounts.has(account.name) && isEditable && (
                        <tr key={`acct-add-${account.name}`} className="border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
                          <td colSpan={7} className="px-4 py-2">
                            <button
                              onClick={() => setAddModalAccount(account)}
                              className="text-xs font-semibold text-white px-2 py-0.5 rounded-full"
                              style={{ background: "#3d47cf" }}
                              title="종목 추가"
                            >
                              + 추가
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                ) : sectorGroups ? (
                  sectorGroups.map(({ sector, items, totalValue, totalProfitLoss, returnRate }) => (
                    <Fragment key={sector}>
                      <tr className="border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
                        <td colSpan={7} className="px-4 py-2 bg-[#f0f2f8] dark:bg-[#0f1923]">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#3d47cf]">
                              {sector}
                              <span className="ml-1.5 font-normal text-gray-400">({items.length}종목)</span>
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500">{formatKRW(totalValue)}</span>
                              <span
                                className="text-xs font-medium"
                                style={{ color: rateColor(totalProfitLoss) }}
                              >
                                {totalProfitLoss >= 0 ? "+" : ""}{formatKRW(totalProfitLoss)}
                              </span>
                              <RateBadge rate={returnRate} />
                            </div>
                          </div>
                        </td>
                      </tr>
                      {items.map((item, idx) => (
                        <AssetRow
                          key={`${sector}-${idx}-${item.name}`}
                          item={item}
                          editable={isEditable}
                          onSave={(field, value) => saveItem(item, field, value)}
                          onDelete={() => deleteItem(item)}
                          todayQuote={item.code ? todayQuotes[item.code] : undefined}
                        />
                      ))}
                    </Fragment>
                  ))
                ) : (
                  displayItems.map((item, idx) => (
                    <AssetRow
                      key={`${activeTab}-${idx}-${item.name}`}
                      item={item}
                      editable={isEditable}
                      onSave={(field, value) => saveItem(item, field, value)}
                      onDelete={() => deleteItem(item)}
                      todayQuote={item.code ? todayQuotes[item.code] : undefined}
                    />
                  ))
                )}
                {!loading && !sectorGroups && displayItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-gray-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>}

        {/* AI 분석 패널 (개별주식, 개인연금, IRP 탭) */}
        {(activeTab === "개별주식" || activeTab === "개인연금" || activeTab === "IRP") && summary && (
          (() => {
            const categoryKey = activeTab as AssetCategory;
            const group = summary.groups.find((g) => g.category === categoryKey);
            if (!group) return null;
            return (
              <PortfolioAnalysisPanel
                key={categoryKey}
                group={group}
                logs={profitLogs}
                category={activeTab}
              />
            );
          })()
        )}

        {data?.updatedAt && (
          <p className="px-4 md:px-0 mb-6 text-xs text-gray-400 text-right">
            마지막 업데이트: {new Date(data.updatedAt).toLocaleString("ko-KR")}
          </p>
        )}
      </main>

      <PortfolioEventReviewModal
        open={eventReviewOpen}
        candidates={changeCandidates}
        savingKey={savingEventKey}
        error={eventSaveError}
        onClose={() => {
          setEventReviewOpen(false);
          setEventSaveError(null);
        }}
        onSave={savePortfolioEvent}
      />

      <MobileAssetEditModal
        item={editingAsset}
        onClose={() => setEditingAsset(null)}
        onSave={saveItemUpdates}
        onDelete={deleteItem}
      />

      {/* 종목 추가 모달 */}
      {addModalAccount !== null && isEditable && (() => {
        const group = summary?.groups.find((g) => g.category === (activeTab as AssetCategory));
        const allAccounts = group?.accounts ?? [];
        const account = addModalAccount === "new" ? null : addModalAccount;
        return (
          <AddItemModal
            account={account}
            allAccounts={allAccounts}
            sheetTab={SHEET_TABS[activeTab as AssetCategory]}
            assetCategory={activeTab as AssetCategory}
            onClose={() => setAddModalAccount(null)}
            onAdded={handleItemAdded}
          />
        );
      })()}
    </div>
  );
}
