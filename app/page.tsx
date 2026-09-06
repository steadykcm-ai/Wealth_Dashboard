"use client";

import { Fragment, useState, useRef, useEffect, useMemo } from "react";
import { useAssets } from "@/lib/useAssets";
import { useDashboardData } from "@/lib/useDashboardData";
import { formatKRW, formatRate } from "@/lib/number-format";
import { validatePortfolioSummary } from "@/lib/portfolio-validation";
import type { AssetUpdates, BulkAssetUpdate, EditableAssetField } from "@/lib/asset-updates";
import type {
  AssetCategory,
  AssetItem,
  AssetGroup,
  AssetSummary,
  PortfolioBreakdown,
  AccountGroup,
  DailyLogItem,
  PortfolioChangeCandidate,
  PortfolioEvent,
  PortfolioEventType,
  RebalanceCategory,
  RebalanceTarget,
} from "@/lib/types";

interface TodayQuote {
  price: number;
  changeAmount: number;
  changeRate: number;
}

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
import dynamic from "next/dynamic";
import { formatPriceUpdatedAt, rateColor } from "@/lib/dashboard-format";
import { DataSyncStatus, MobileHeader, NotificationCenter, PortfolioValidationPanel, Sidebar, SummaryCard } from "@/components/dashboard/dashboard-shell";

const DonutChart = dynamic(() => import("@/components/dashboard/portfolio-charts").then((module) => module.DonutChart));
const SmallDonutChart = dynamic(() => import("@/components/dashboard/portfolio-charts").then((module) => module.SmallDonutChart));
const AssetTrendChart = dynamic(() => import("@/components/dashboard/portfolio-charts").then((module) => module.AssetTrendChart));
const PerformanceAnalyticsPanel = dynamic(() => import("@/components/dashboard/performance-export-panels").then((module) => module.PerformanceAnalyticsPanel));
const ExportPanel = dynamic(() => import("@/components/dashboard/performance-export-panels").then((module) => module.ExportPanel));
const PrintablePortfolioReport = dynamic(() => import("@/components/dashboard/performance-export-panels").then((module) => module.PrintablePortfolioReport));
const RetirementPlanner = dynamic(() => import("@/components/dashboard/retirement-planner").then((module) => module.RetirementPlanner));
const BackupPanel = dynamic(() => import("@/components/dashboard/backup-panel").then((module) => module.BackupPanel));
const PortfolioAnalysisPanel = dynamic(() => import("@/components/dashboard/portfolio-analysis-panel").then((module) => module.PortfolioAnalysisPanel));
const MobileBulkEditor = dynamic(() => import("@/components/dashboard/mobile-bulk-editor").then((module) => module.MobileBulkEditor));
const MarketOverviewPanel = dynamic(() => import("@/components/dashboard/market-overview-panel").then((module) => module.MarketOverviewPanel));
const MonthlyInvestmentReport = dynamic(() => import("@/components/dashboard/portfolio-insight-panels").then((module) => module.MonthlyInvestmentReport));
const PortfolioRiskPanel = dynamic(() => import("@/components/dashboard/portfolio-insight-panels").then((module) => module.PortfolioRiskPanel));
const RebalancePanel = dynamic(() => import("@/components/dashboard/rebalance-panel").then((module) => module.RebalancePanel));

// ── 유틸 ────────────────────────────────────────────────
function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
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

interface DataQualityIssue {
  id: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
}

function summarizeAssetNames(items: AssetItem[]): string {
  const names = items.slice(0, 2).map((item) => item.name).join(", ");
  return items.length > 2 ? `${names} 외 ${items.length - 2}개` : names;
}

function buildDataQualityIssues(
  summary: AssetSummary | undefined,
  logs: DailyLogItem[],
  events: PortfolioEvent[],
  nowMs = Date.now()
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const items = summary?.groups.flatMap((group) => group.items) ?? [];
  const marketItems = items.filter((item) => item.valuationMode !== "manual");
  const missingPrices = marketItems.filter((item) => !item.priceUpdatedAt || item.currentPrice <= 0);
  const stalePrices = marketItems.filter((item) => {
    if (!item.priceUpdatedAt || item.currentPrice <= 0) return false;
    return nowMs - new Date(item.priceUpdatedAt).getTime() > 5 * 24 * 60 * 60 * 1000;
  });
  const staleValuations = items.filter((item) => {
    if (item.valuationMode !== "manual") return false;
    if (!item.valuationUpdatedAt) return true;
    return nowMs - new Date(item.valuationUpdatedAt).getTime() > 45 * 24 * 60 * 60 * 1000;
  });

  if (missingPrices.length > 0) {
    issues.push({
      id: "missing-prices",
      severity: "critical",
      title: `현재가 누락 ${missingPrices.length}종목`,
      detail: summarizeAssetNames(missingPrices),
    });
  }
  if (stalePrices.length > 0) {
    issues.push({
      id: "stale-prices",
      severity: "warning",
      title: `5일 넘은 현재가 ${stalePrices.length}종목`,
      detail: summarizeAssetNames(stalePrices),
    });
  }
  if (staleValuations.length > 0) {
    issues.push({
      id: "stale-valuations",
      severity: "warning",
      title: `45일 넘은 수동평가 ${staleValuations.length}종목`,
      detail: summarizeAssetNames(staleValuations),
    });
  }

  const sortedLogs = [...logs].sort((left, right) => left.date.localeCompare(right.date));
  const previousLog = sortedLogs.at(-2);
  const latestLog = sortedLogs.at(-1);
  if (previousLog && latestLog) {
    ([
      ["stocks", "개별주식", previousLog.stocks.total, latestLog.stocks.total],
      ["pension", "개인연금", previousLog.pension.total, latestLog.pension.total],
    ] as const).forEach(([category, label, previousValue, latestValue]) => {
      if (previousValue <= 0) return;
      const change = latestValue - previousValue;
      const changeRate = (change / previousValue) * 100;
      const hasClassifiedEvent = events.some((event) => (
        event.date === latestLog.date
        && event.category === category
        && event.eventType !== "ignored"
      ));
      if (Math.abs(change) >= 5_000_000 && Math.abs(changeRate) >= 10 && !hasClassifiedEvent) {
        issues.push({
          id: `abrupt-${category}-${latestLog.date}`,
          severity: "warning",
          title: `${label} 자산 급변`,
          detail: `${previousLog.date} 대비 ${change >= 0 ? "+" : ""}${formatKRW(change)} (${changeRate >= 0 ? "+" : ""}${changeRate.toFixed(1)}%)`,
        });
      }
    });
  }

  return issues;
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

interface AllocationDriftItem {
  category: "개별주식" | "개인연금";
  name: string;
  currentWeight: number;
  targetWeight: number;
  difference: number;
}

function useAllocationDriftItems(groups: AssetGroup[]): AllocationDriftItem[] {
  const [targets, setTargets] = useState<Record<RebalanceCategory, RebalanceTarget[]>>({ stocks: [], pension: [] });

  useEffect(() => {
    let cancelled = false;
    const loadTargets = () => {
      Promise.all((["stocks", "pension"] as RebalanceCategory[]).map(async (category) => {
        const response = await fetch(`/api/rebalance-targets?category=${category}`, { cache: "no-store" });
        if (!response.ok) return { category, targets: [] };
        const body = await response.json() as { targets: RebalanceTarget[] };
        return { category, targets: body.targets };
      })).then((results) => {
        if (cancelled) return;
        setTargets({
          stocks: results.find((result) => result.category === "stocks")?.targets ?? [],
          pension: results.find((result) => result.category === "pension")?.targets ?? [],
        });
      }).catch(() => undefined);
    };
    loadTargets();
    window.addEventListener("rebalance-targets-updated", loadTargets);
    return () => {
      cancelled = true;
      window.removeEventListener("rebalance-targets-updated", loadTargets);
    };
  }, []);

  return useMemo(() => ([
    { key: "stocks" as const, label: "개별주식" as const },
    { key: "pension" as const, label: "개인연금" as const },
  ]).flatMap(({ key, label }) => {
    const group = groups.find((candidate) => candidate.category === label);
    const categoryTargets = targets[key];
    const targetSum = categoryTargets.reduce((sum, target) => sum + target.targetWeight, 0);
    const holdingsTotal = group?.items.reduce((sum, item) => sum + item.currentValue, 0) ?? 0;
    if (!group || holdingsTotal <= 0 || Math.abs(targetSum - 100) > 0.05) return [];
    const targetById = new Map(categoryTargets.map((target) => [target.assetId, target.targetWeight]));
    return group.items.flatMap((item) => {
      if (!item.id) return [];
      const currentWeight = (item.currentValue / holdingsTotal) * 100;
      const targetWeight = targetById.get(item.id) ?? 0;
      const difference = currentWeight - targetWeight;
      return Math.abs(difference) >= 3
        ? [{ category: label, name: item.name, currentWeight, targetWeight, difference }]
        : [];
    });
  }).sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference)), [groups, targets]);
}

// ── 리밸런싱 패널 ────────────────────────────────────────
// ── AI 포트폴리오 분석 패널 ──────────────────────────────
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
  const {
    profitLogs,
    benchmarkSeries,
    performanceLoading,
    performanceError,
    portfolioEvents,
    changeCandidates,
    profitLogMeta,
    syncRuns,
    syncRunsLoading,
    syncRunsError,
    retryingJob,
    fetchPerformanceData,
    retrySyncJob,
    refreshDashboard,
  } = useDashboardData({ reloadAssets: reload, refetchAssets: refetch });
  const [activeTab, setActiveTab] = useState<string>("전체");
  const [itemOverrides, setItemOverrides] = useState<Record<string, Partial<AssetItem>>>({});
  const [cashOverrides, setCashOverrides] = useState<Record<string, number>>({});
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
  const [addModalAccount, setAddModalAccount] = useState<AccountGroup | "new" | null>(null);
  const [eventReviewOpen, setEventReviewOpen] = useState(false);
  const [savingEventKey, setSavingEventKey] = useState<string | null>(null);
  const [eventSaveError, setEventSaveError] = useState<string | null>(null);
  const [todayQuotes, setTodayQuotes] = useState<Record<string, TodayQuote>>({});
  const [todayQuotesLoading, setTodayQuotesLoading] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountSort, setAccountSort] = useState<AccountSortMode>("value");
  const [hideInactiveAccounts, setHideInactiveAccounts] = useState(false);
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [bulkEditingAccount, setBulkEditingAccount] = useState<{ accountName: string; items: AssetItem[] } | null>(null);

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

  async function saveBulkItemUpdates(items: BulkAssetUpdate[]) {
    const res = await fetch("/api/assets/item", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? "일괄 저장 실패");
    }
    setItemOverrides({});
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
    setAccountQuery("");
    setCollapsedAccounts(new Set());
    setEditingAsset(null);
  }, [activeTab]);

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

      const refreshed = await fetchPerformanceData();
      if (!refreshed) throw new Error("성과 데이터 갱신 실패");
      if ((refreshed.changeCandidates ?? []).length === 0) setEventReviewOpen(false);
    } catch (error) {
      setEventSaveError(error instanceof Error ? error.message : "변동 저장 실패");
    } finally {
      setSavingEventKey(null);
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

  const adjustedGroups: AssetGroup[] = useMemo(() => {
    if (!summary) return [];
    return summary.groups;
  }, [summary]);

  const isEditable = activeTab !== "전체";

  const displayItems: AssetItem[] = useMemo(() => {
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
  }, [activeTab, adjustedGroups, deletedKeys, itemOverrides, summary]);

  const tabSummary = useMemo(() => {
    if (!summary) return null;
    if (activeTab === "전체") {
      const totalInvest = adjustedGroups.reduce((s, g) => s + g.totalInvest, 0);
      const groupedTotalValue = adjustedGroups.reduce((sum, group) => {
        const displayCash = group.accounts.reduce(
          (cashSum, account) => cashSum + (cashOverrides[account.name] ?? account.cash),
          0
        );
        return sum + group.totalValue - group.cash + displayCash;
      }, 0);
      const totalValue = groupedTotalValue + (summary.unallocatedCash ?? 0);
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
  }, [activeTab, adjustedGroups, cashOverrides, summary]);
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
  const sectorGroups: { sector: string; items: AssetItem[]; totalValue: number; totalProfitLoss: number; returnRate: number }[] | null = useMemo(() => {
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
  }, [activeTab, displayItems, loading]);

  // 계좌별 그룹핑 (개별주식·개인연금·IRP, 계좌 정보 있을 때)
  const accountGroups: { account: AccountGroup; items: AssetItem[] }[] | null = useMemo(() => {
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
  }, [activeTab, deletedKeys, itemOverrides, loading, summary]);

  const managedAccountGroups = useMemo(() => accountGroups
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
    : null, [accountGroups, accountQuery, accountSort, cashOverrides, hideInactiveAccounts]);
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

  const title = activeTab === "전체" ? "전체 자산 현황" : activeTab === "시장" ? "시장 동향" : activeTab;
  const latestBenchmarkDate = benchmarkSeries
    .flatMap((series) => series.points.map((point) => point.date))
    .sort()
    .at(-1);
  const portfolioValidation = useMemo(
    () => summary ? validatePortfolioSummary(summary) : null,
    [summary]
  );
  const dataQualityIssues = useMemo(() => {
    const existingIssues = buildDataQualityIssues(summary, profitLogs, portfolioEvents);
    const calculationIssues: DataQualityIssue[] = (portfolioValidation?.issues ?? [])
      .filter((issue) => issue.kind === "calculation")
      .map((issue) => ({
        id: `validation-${issue.id}`,
        severity: issue.severity,
        title: issue.title,
        detail: issue.detail,
      }));
    return [...calculationIssues, ...existingIssues];
  }, [portfolioEvents, portfolioValidation, profitLogs, summary]);
  const allocationDriftItems = useAllocationDriftItems(adjustedGroups);
  const retirementStockAssets = adjustedGroups.find((group) => group.category === "개별주식")?.totalValue ?? 0;
  const retirementPensionAssets = adjustedGroups.find((group) => group.category === "개인연금")?.totalValue ?? 0;

  return (
    <div className="dashboard-app flex min-h-screen bg-[#f8f9fc] dark:bg-[#0f1923]">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <MobileHeader activeTab={activeTab} onTabChange={setActiveTab} onRefetch={refreshDashboard} refreshing={refreshing} showRefresh={activeTab !== "시장"} />

      <main className="flex-1 overflow-auto pt-[88px] md:pt-0 md:px-8 md:py-8 md:ml-56">
        {/* 데스크톱 헤더 */}
        <div className="hidden md:flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <div className="flex items-center gap-2">
            {activeTab !== "시장" && (
              <button
                onClick={refreshDashboard}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "#3d47cf" }}
              >
                {refreshing ? "⏳ 새로고침 중..." : "↻ 새로고침"}
              </button>
            )}
          </div>
        </div>

        {/* 모바일 타이틀 */}
        <div className="md:hidden px-4 pt-2 pb-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h1>
        </div>

        {activeTab === "시장" ? (
          <MarketOverviewPanel />
        ) : (
          <>
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

        <NotificationCenter
          issues={dataQualityIssues}
          runs={syncRuns}
          changeCandidates={changeCandidates}
          driftItems={allocationDriftItems}
          onOpenChanges={() => setEventReviewOpen(true)}
          onTabChange={setActiveTab}
        />

        {activeTab === "전체" && portfolioValidation && (
          <PortfolioValidationPanel report={portfolioValidation} />
        )}

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
            <MonthlyInvestmentReport
              logs={profitLogs}
              events={portfolioEvents}
              unreviewedCount={changeCandidates.length}
            />
            <PerformanceAnalyticsPanel logs={profitLogs} events={portfolioEvents} benchmarks={benchmarkSeries} />
            <RetirementPlanner
              stockAssets={retirementStockAssets}
              pensionAssets={retirementPensionAssets}
            />
            <PortfolioRiskPanel groups={adjustedGroups} logs={profitLogs} events={portfolioEvents} />
            <BackupPanel onRestored={async () => {
              await reload();
              await fetchPerformanceData();
            }} />
            <ExportPanel groups={adjustedGroups} logs={profitLogs} events={portfolioEvents} />
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
                  <div className="flex items-center border-b border-[#e0e0e0] bg-[#f0f2f8] px-2 py-1.5 dark:border-[#2a3a4a] dark:bg-[#0f1923]">
                    <button
                      type="button"
                      onClick={() => toggleAccount(account.name)}
                      aria-expanded={!collapsedAccounts.has(account.name)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1 text-left"
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
                    {isEditable && items.some((item) => Number.isInteger(item.id)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAsset(null);
                          setBulkEditingAccount({ accountName: account.name, items });
                        }}
                        className="ml-1 shrink-0 rounded-md border border-[#b9c0d0] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#3d47cf] dark:border-[#3a4658] dark:bg-[#172231]"
                      >
                        일괄 수정
                      </button>
                    )}
                  </div>
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
          </>
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

      <MobileBulkEditor
        account={bulkEditingAccount}
        onClose={() => setBulkEditingAccount(null)}
        onSave={saveBulkItemUpdates}
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
      <PrintablePortfolioReport groups={adjustedGroups} logs={profitLogs} events={portfolioEvents} />
    </div>
  );
}
