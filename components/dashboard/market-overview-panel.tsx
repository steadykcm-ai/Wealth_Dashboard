"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MarketCategory, MarketInstrument, MarketOverviewResponse } from "@/lib/types";

type MarketFilter = "all" | MarketCategory;

const CATEGORY_META: Array<{ id: MarketCategory; label: string }> = [
  { id: "indices", label: "주요국 증시" },
  { id: "fx", label: "환율" },
  { id: "commodities", label: "원자재" },
  { id: "crypto", label: "암호화폐" },
];

function changeColor(value: number | null): string {
  if (value === null || value === 0) return "#6b7280";
  return value > 0 ? "#f44336" : "#1565c0";
}

function formatPrice(item: MarketInstrument): string {
  if (item.price === null) return "-";
  const maximumFractionDigits = item.unit === "원"
    ? (item.price >= 1000 ? 0 : 2)
    : item.price < 10
      ? 4
      : 2;
  return item.price.toLocaleString("ko-KR", { maximumFractionDigits });
}

function formatChange(item: MarketInstrument): string {
  if (item.changeAmount === null) return "-";
  const sign = item.changeAmount > 0 ? "+" : "";
  const digits = Math.abs(item.changeAmount) < 10 ? 4 : 2;
  return `${sign}${item.changeAmount.toLocaleString("ko-KR", { maximumFractionDigits: digits })}`;
}

function formatRate(rate: number | null): string {
  if (rate === null) return "-";
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기준 시각 확인 불가";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceShortLabel(item: MarketInstrument): string {
  if (item.source === "KIS") return "KIS";
  if (item.source === "Upbit") return "Upbit";
  return "보조";
}

function Sparkline({ item }: { item: MarketInstrument }) {
  const color = changeColor(item.changeRate);
  if (item.points.length < 2) {
    return <span className="text-[11px] text-gray-400">추이 없음</span>;
  }
  return (
    <div className="h-9 w-24" aria-hidden="true">
      <LineChart width={96} height={36} data={item.points.slice(-20)} margin={{ top: 4, right: 1, bottom: 4, left: 1 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.7} dot={false} isAnimationActive animationDuration={500} />
      </LineChart>
    </div>
  );
}

function DetailTooltip({ active, payload, label, item }: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  item: MarketInstrument;
}) {
  if (!active || !payload?.[0] || typeof payload[0].value !== "number") return null;
  return (
    <div className="rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-xs shadow-sm dark:border-[#3a4658] dark:bg-[#172231]">
      <p className="text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
        {payload[0].value.toLocaleString("ko-KR", { maximumFractionDigits: item.price && item.price < 10 ? 4 : 2 })} {item.unit}
      </p>
    </div>
  );
}

function MarketDetail({ item }: { item: MarketInstrument }) {
  const color = changeColor(item.changeRate);
  const minimum = Math.min(...item.points.map((point) => point.value));
  const maximum = Math.max(...item.points.map((point) => point.value));
  const padding = Number.isFinite(minimum) && Number.isFinite(maximum)
    ? Math.max((maximum - minimum) * 0.12, maximum * 0.005)
    : 0;

  return (
    <section className="mx-4 mb-4 border-y border-[#e0e0e0] bg-white py-4 dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0 md:mb-6 md:rounded-lg md:border">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{item.name}</h2>
            <span className="text-xs text-gray-400">{item.symbol}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{formatPrice(item)}</span>
            <span className="text-xs text-gray-500">{item.unit}</span>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color, backgroundColor: `${color}12` }}>
              {formatRate(item.changeRate)}
            </span>
          </div>
        </div>
        <div className="text-right text-[11px] text-gray-400">
          <p>{item.sourceLabel}</p>
          <p>{item.asOfDate ? `${item.asOfDate} 기준` : "현재 시세"}</p>
        </div>
      </div>
      <div className="mt-4 h-52 w-full px-1 md:h-60 md:px-4">
        {item.points.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">기간 추이 데이터가 없습니다.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={item.points.slice(-30)} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={`market-fill-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d6d9e0" opacity={0.45} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} minTickGap={36} tickFormatter={(date) => date.slice(5)} />
              <YAxis domain={[minimum - padding, maximum + padding]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={54} tickFormatter={(value) => Number(value).toLocaleString("ko-KR", { notation: "compact", maximumFractionDigits: 1 })} />
              <Tooltip content={<DetailTooltip item={item} />} />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#market-fill-${item.id})`} dot={false} isAnimationActive animationDuration={650} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function MarketSection({
  category,
  items,
  selectedId,
  onSelect,
}: {
  category: { id: MarketCategory; label: string };
  items: MarketInstrument[];
  selectedId: string | null;
  onSelect: (item: MarketInstrument) => void;
}) {
  return (
    <section className="mx-4 mb-4 overflow-hidden border-y border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0 md:mb-6 md:rounded-lg md:border">
      <div className="flex items-center justify-between border-b border-[#e8e8e8] px-4 py-3 dark:border-[#2a3a4a]">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{category.label}</h2>
        <span className="text-[11px] text-gray-400">{items.length}개 지표</span>
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-[minmax(150px,1.3fr)_minmax(100px,1fr)_110px_110px_110px] border-b border-[#eeeeee] px-4 py-2 text-[11px] font-semibold text-gray-400 dark:border-[#2a3a4a]">
          <span>지표</span><span className="text-right">현재가</span><span className="text-right">등락</span><span className="text-right">등락률</span><span className="text-center">30일 추이</span>
        </div>
        {items.map((item) => {
          const color = changeColor(item.changeRate);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={`grid w-full grid-cols-[minmax(150px,1.3fr)_minmax(100px,1fr)_110px_110px_110px] items-center border-b border-[#eeeeee] px-4 py-2.5 text-left last:border-b-0 hover:bg-[#f8f9fc] dark:border-[#2a3a4a] dark:hover:bg-[#202c3d] ${selectedId === item.id ? "bg-[#f3f5ff] dark:bg-[#202a48]" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                  {item.symbol}
                  <span className={`rounded-full px-1.5 py-0.5 ${item.status === "fallback" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-gray-100 dark:bg-[#253247]"}`}>
                    {sourceShortLabel(item)}
                  </span>
                </span>
              </span>
              <span className="text-right text-sm font-semibold text-gray-900 dark:text-white">{formatPrice(item)} <span className="text-[10px] font-normal text-gray-400">{item.unit}</span></span>
              <span className="text-right text-xs font-medium" style={{ color }}>{formatChange(item)}</span>
              <span className="text-right"><span className="inline-block min-w-[68px] rounded-full px-2 py-1 text-center text-xs font-semibold" style={{ color, backgroundColor: `${color}12` }}>{formatRate(item.changeRate)}</span></span>
              <span className="flex justify-center"><Sparkline item={item} /></span>
            </button>
          );
        })}
      </div>

      <div className="md:hidden">
        {items.map((item) => {
          const color = changeColor(item.changeRate);
          return (
            <button key={item.id} type="button" onClick={() => onSelect(item)} className={`flex w-full items-center gap-3 border-b border-[#eeeeee] px-4 py-3 text-left last:border-b-0 dark:border-[#2a3a4a] ${selectedId === item.id ? "bg-[#f3f5ff] dark:bg-[#202a48]" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.name}</span>
                  {item.status === "fallback" && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">보조</span>}
                </span>
                <span className="mt-1 block text-[10px] text-gray-400">{item.symbol} · {item.asOfDate ?? "기준일 확인 중"}</span>
              </span>
              <Sparkline item={item} />
              <span className="w-[92px] shrink-0 text-right">
                <span className="block text-sm font-bold text-gray-900 dark:text-white">{formatPrice(item)}</span>
                <span className="mt-0.5 block text-xs font-semibold" style={{ color }}>{formatRate(item.changeRate)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="mx-4 space-y-4 md:mx-0">
      {Array.from({ length: 3 }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="overflow-hidden rounded-lg border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332]">
          <div className="h-11 animate-pulse border-b border-[#eeeeee] bg-gray-50 dark:border-[#2a3a4a] dark:bg-[#202c3d]" />
          {Array.from({ length: 4 }).map((__, rowIndex) => <div key={rowIndex} className="h-14 animate-pulse border-b border-[#eeeeee] last:border-b-0 dark:border-[#2a3a4a]" />)}
        </div>
      ))}
    </div>
  );
}

export function MarketOverviewPanel() {
  const [data, setData] = useState<MarketOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchMarkets = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/markets", {
        method: force ? "POST" : "GET",
        cache: "no-store",
      });
      const body = await response.json() as MarketOverviewResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "시장 시세를 불러오지 못했습니다.");
      setData(body);
      setSelectedId((current) => current && body.items.some((item) => item.id === current) ? current : body.items[0]?.id ?? null);
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : "시장 시세를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchMarkets(); }, [fetchMarkets]);

  const selectedItem = data?.items.find((item) => item.id === selectedId) ?? null;
  const fallbackCount = data?.items.filter((item) => item.status === "fallback").length ?? 0;
  const breadth = useMemo(() => {
    const indices = data?.items.filter((item) => item.category === "indices" && item.changeRate !== null) ?? [];
    return {
      rising: indices.filter((item) => (item.changeRate ?? 0) > 0).length,
      falling: indices.filter((item) => (item.changeRate ?? 0) < 0).length,
      flat: indices.filter((item) => item.changeRate === 0).length,
    };
  }, [data]);
  const stale = data ? Date.now() - new Date(data.updatedAt).getTime() > 15 * 60 * 1000 : false;

  function selectFilter(nextFilter: MarketFilter) {
    setFilter(nextFilter);
    if (nextFilter !== "all") {
      const first = data?.items.find((item) => item.category === nextFilter);
      if (first) setSelectedId(first.id);
    }
  }

  if (loading && !data) return <LoadingState />;

  return (
    <div className="pb-8">
      <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-[#e0e0e0] bg-white px-4 py-3 dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0 md:mb-6 md:rounded-lg md:border">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[11px] font-medium text-gray-400">주요국 증시 방향</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
              <span className="text-[#f44336]">상승 {breadth.rising}</span>
              <span className="mx-1.5 text-gray-300">·</span>
              <span className="text-[#1565c0]">하락 {breadth.falling}</span>
              {breadth.flat > 0 && <><span className="mx-1.5 text-gray-300">·</span><span className="text-gray-500">보합 {breadth.flat}</span></>}
            </p>
          </div>
          <div className="hidden h-8 w-px bg-[#e0e0e0] dark:bg-[#2a3a4a] sm:block" />
          <div className="hidden sm:block">
            <p className="text-[11px] font-medium text-gray-400">데이터 상태</p>
            <p className={`mt-0.5 text-sm font-semibold ${data?.partial || stale ? "text-amber-600" : "text-emerald-600"}`}>
              {stale ? "갱신 필요" : data?.partial ? `${data.unavailableCount}개 확인 필요` : "정상"}
              {fallbackCount > 0 ? ` · 보조 ${fallbackCount}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-right text-[11px] text-gray-400">{data ? `${formatUpdatedAt(data.updatedAt)} 수집` : "-"}<br />KIS 지수는 지연·종가 시세</span>
          <button type="button" onClick={() => void fetchMarkets(true)} disabled={refreshing} aria-label="시장 시세 새로고침" title="시장 시세 새로고침" className="flex h-9 w-9 items-center justify-center rounded-md bg-[#3d47cf] text-lg text-white disabled:opacity-50">
            {refreshing ? "…" : "↻"}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mx-4 mb-4 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 md:mx-0 md:rounded-lg md:border">{error}</p>}

      <div className="mb-4 flex gap-1 overflow-x-auto px-4 pb-1 md:px-0">
        {[{ id: "all" as const, label: "전체" }, ...CATEGORY_META].map((category) => (
          <button key={category.id} type="button" onClick={() => selectFilter(category.id)} className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold ${filter === category.id ? "bg-[#3d47cf] text-white" : "border border-[#d6d9e0] bg-white text-gray-600 dark:border-[#3a4658] dark:bg-[#1a2332] dark:text-gray-300"}`}>
            {category.label}
          </button>
        ))}
      </div>

      {selectedItem && <MarketDetail item={selectedItem} />}

      {CATEGORY_META.filter((category) => filter === "all" || filter === category.id).map((category) => (
        <MarketSection
          key={category.id}
          category={category}
          items={data?.items.filter((item) => item.category === category.id) ?? []}
          selectedId={selectedId}
          onSelect={(item) => setSelectedId(item.id)}
        />
      ))}
    </div>
  );
}
