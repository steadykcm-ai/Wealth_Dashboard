"use client";

import { useState, useRef, useEffect, useRouter } from "react";
import { useTheme } from "next-themes";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { useAssets } from "@/lib/useAssets";
import { useCrypto } from "@/lib/useCrypto";
import { formatKRW, formatRate } from "@/lib/profit-calculator";
import type { AssetCategory, AssetItem, AssetGroup, BreakdownItem, PortfolioBreakdown, ExchangeGroup, AccountGroup, DailyLogItem } from "@/lib/types";
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

const CATEGORY_COLORS: Record<AssetCategory, string> = {
  개별주식: "#3d47cf",
  개인연금: "#26a69a",
  IRP: "#4db8a8",
  암호화폐: "#ab47bc",
};

const TABS = [
  { id: "전체", label: "전체" },
  { id: "개별주식", label: "주식" },
  { id: "개인연금", label: "연금" },
  { id: "암호화폐", label: "코인" },
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload[0]) {
      const { name, value } = payload[0];
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload[0]) {
      const { label, value } = payload[0];
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

// ── 총자산 추이 차트 ──────────────────────────────────────
function TotalAssetChart({ logs }: { logs: DailyLogItem[] }) {
  const { resolvedTheme } = useTheme();
  const [period, setPeriod] = useState<"1month" | "3month" | "all">("all");

  console.log("차트 데이터:", logs);
  if (logs.length === 0) {
    console.log("차트 데이터 없음");
    return null;
  }

  // 기간 필터링
  const filteredLogs = (() => {
    if (period === "all") return logs;

    const now = new Date();
    const days = period === "1month" ? 30 : 90;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    return logs.filter(log => new Date(log.date) >= cutoff);
  })();

  const data = filteredLogs.map((log) => ({
    date: new Date(log.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
    total: log.total.total,
    stocks: log.stocks.total,
    pension: log.pension.total,
    crypto: log.crypto.total,
    fullDate: log.date,
  }));

  const textColor = resolvedTheme === "dark" ? "#d1d5db" : "#111827";
  const gridColor = resolvedTheme === "dark" ? "#2a3a4a" : "#f0f0f0";
  const axisColor = resolvedTheme === "dark" ? "#94a3b8" : "#6b7280";

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const { total, stocks, pension, irp, crypto, fullDate } = payload[0].payload;
      return (
        <div className="rounded-md bg-white/90 dark:bg-gray-900/90 px-3 py-2 border border-gray-200 dark:border-gray-700 shadow-md">
          <p className="text-xs font-semibold mb-2" style={{ color: textColor }}>
            {new Date(fullDate).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })}
          </p>
          <p className="text-xs" style={{ color: "#3d47cf" }}>총자산: {formatKRW(total)}</p>
          <p className="text-xs" style={{ color: "#26a69a" }}>주식: {formatKRW(stocks)}</p>
          <p className="text-xs" style={{ color: "#ff7043" }}>연금: {formatKRW(pension)}</p>
          <p className="text-xs" style={{ color: "#ab47bc" }}>IRP: {formatKRW(irp)}</p>
          <p className="text-xs" style={{ color: "#fbc02d" }}>암호화폐: {formatKRW(crypto)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mb-6 px-4 md:px-0">
      <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            총자산 추이
          </h2>
          <div className="flex gap-2">
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
              tickFormatter={(v) => formatKRW(v)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="total" stroke="#3d47cf" strokeWidth={2} fill="none" isAnimationActive={true} />
            <Area type="monotone" dataKey="stocks" stroke="#26a69a" strokeWidth={1.5} fill="none" isAnimationActive={true} />
            <Area type="monotone" dataKey="pension" stroke="#ff7043" strokeWidth={1.5} fill="none" isAnimationActive={true} />
            <Area type="monotone" dataKey="irp" stroke="#ab47bc" strokeWidth={1.5} fill="none" isAnimationActive={true} />
            <Area type="monotone" dataKey="crypto" stroke="#fbc02d" strokeWidth={1.5} fill="none" isAnimationActive={true} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
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

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#e0e0e0] bg-white px-4 py-4 dark:bg-[#1a2332] dark:border-[#2a3a4a]">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

// ── 로그아웃 버튼 ────────────────────────────────────
function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      const { createSupabaseBrowser } = await import("@/lib/supabase-browser");
      const supabase = createSupabaseBrowser();
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
function Sidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const items = [
    { id: "전체", label: "전체 자산" },
    { id: "개별주식", label: "개별주식" },
    { id: "개인연금", label: "개인연금" },
    { id: "암호화폐", label: "암호화폐" },
  ];
  return (
    <aside
      className="hidden md:flex flex-col w-56 min-h-screen px-4 py-8 shrink-0"
      style={{ background: "#1a2332" }}
    >
      <div className="mb-10 px-2 flex items-center justify-between">
        <span className="text-white text-xl font-bold tracking-tight">
          Wealth<span style={{ color: "#3d47cf" }}>.</span>
        </span>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-gray-400 hover:text-white transition-colors"
          title={theme === "dark" ? "라이트 모드" : "다크 모드"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
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
  onUpdateCrypto,
  updatingCrypto,
  refreshing,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
  onRefetch: () => void;
  onUpdateCrypto: () => Promise<void>;
  updatingCrypto: boolean;
  refreshing: boolean;
}) {
  const { theme, setTheme } = useTheme();

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
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-[#2a3a4a]"
            title={theme === "dark" ? "라이트 모드" : "다크 모드"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
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
}: {
  item: AssetItem;
  editable?: boolean;
  onSave?: (field: "quantity" | "avgPrice", value: number) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const canEdit = editable && !!item.id && !!onSave;
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
          <span className="font-medium text-sm text-gray-900 dark:text-white">{item.name}</span>
        </div>
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-500">
        {canEdit ? (
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
        {canEdit ? (
          <EditableCell
            value={item.avgPrice}
            display={formatKRW(item.avgPrice)}
            onSave={(v) => onSave!("avgPrice", v)}
          />
        ) : (
          formatKRW(item.avgPrice)
        )}
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-500">{formatKRW(item.currentPrice)}</td>
      <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900 dark:text-white">{formatKRW(item.currentValue)}</td>
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
function AssetCard({ item }: { item: AssetItem }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0] dark:border-[#2a3a4a]">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold text-white shrink-0"
          style={{ background: "#3d47cf" }}
        >
          {initials(item.name)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
          <p className="text-xs text-gray-400">
            {item.quantity.toLocaleString("ko-KR")}주 · 매입 {formatKRW(item.avgPrice)}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0 ml-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatKRW(item.currentValue)}</p>
        <div className="flex items-center justify-end gap-1.5 mt-0.5">
          <span className="text-xs font-medium" style={{ color: rateColor(item.profitLoss) }}>
            {item.profitLoss >= 0 ? "+" : ""}{formatKRW(item.profitLoss)}
          </span>
          <RateBadge rate={item.returnRate} />
        </div>
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
  sheetTab,
  assetCategory,
  onClose,
  onAdded,
}: {
  account: AccountGroup;
  sheetTab: string;
  assetCategory: AssetCategory;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [results, setResults] = useState<StockEntry[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isComposing = useRef(false);

  async function handleNameChange(value: string) {
    setName(value);
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
    const price = parseFloat(avgPrice.replace(/,/g, ""));
    if (!name.trim() || isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
      setError("종목명, 수량, 매입가를 올바르게 입력해주세요");
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
          accountName: account.name,
          sheetTab,
          afterRowIndex: account.insertRowIndex,
          name: name.trim(),
          code: code.trim(),
          quantity: qty,
          avgPrice: price,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "추가 실패");
      onAdded();
      setName("");
      setCode("");
      setQuantity("");
      setAvgPrice("");
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
            <p className="text-xs text-gray-400 mt-0.5">{account.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* 종목명 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              종목명
              {loadingStocks && <span className="ml-1 text-gray-400 font-normal">종목 목록 로드 중...</span>}
            </label>
            <input
              className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf]"
              placeholder="삼성전자"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onCompositionStart={() => { isComposing.current = true; }}
              onCompositionEnd={(e) => { isComposing.current = false; handleNameChange(e.currentTarget.value); }}
              autoComplete="off"
            />
          </div>

          {/* 검색 결과 드롭다운 */}
          {results.length > 0 && (
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
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">종목 코드 <span className="font-normal text-gray-400">(GOOGLEFINANCE 형식)</span></label>
            <input
              className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm font-mono outline-none focus:border-[#3d47cf]"
              placeholder="KRX:005930"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          {/* 수량 + 매입가 */}
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">평균 매입가</label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] px-3 py-2 text-sm outline-none focus:border-[#3d47cf]"
                placeholder="75000"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
              />
            </div>
          </div>

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
  editable,
  cashOverrides,
  onCashSave,
}: {
  accounts: AccountGroup[];
  totalCash: number;
  editable?: boolean;
  cashOverrides?: Record<string, number>;
  onCashSave?: (account: AccountGroup, value: number) => Promise<void>;
}) {
  if (accounts.length === 0 && totalCash <= 0) return null;

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            계좌별 현황
          </h3>
          {totalCash > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">전체 현금</span>
              <span className="text-sm font-bold text-gray-800 dark:text-white">{formatKRW(totalCash)}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map((acct) => {
            const cashKey = `${acct.sheetTab ?? ""}-${acct.cashRowIndex ?? ""}`;
            const displayCash = cashOverrides?.[cashKey] ?? acct.cash;
            const canEditCash = editable && !!acct.sheetTab && !!acct.cashRowIndex && !!onCashSave;
            return (
              <div
                key={acct.name}
                className="rounded-lg border border-[#e8e8e8] dark:border-[#2a3a4a] p-3 bg-[#f8f9fc] dark:bg-[#0f1923]"
              >
                <p className="text-xs font-bold text-[#3d47cf] truncate mb-2">{acct.name}</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{formatKRW(acct.totalValue)}</p>
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 거래소 암호화폐 섹션 ─────────────────────────────────
function ExchangeSection({ group }: { group: ExchangeGroup }) {
  return (
    <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-[#f0f0f0] dark:border-[#2a3a4a] flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {group.exchange}
          <span className="ml-1.5 text-gray-400 font-normal">({group.items.length}종목)</span>
        </span>
        {group.cash > 0 && (
          <span className="text-xs text-gray-400">현금 {formatKRW(group.cash)}</span>
        )}
      </div>

      {/* 모바일 */}
      <div className="md:hidden">
        {group.items.map((item, idx) => (
          <AssetCard key={`${group.exchange}-${idx}`} item={item} />
        ))}
        {group.items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">보유 종목 없음</p>
        )}
      </div>

      {/* 데스크톱 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
              {["종목", "수량", "평균매입가", "현재가", "현재가치", "평가손익", "수익률"].map((h) => (
                <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 text-right first:text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.items.map((item, idx) => (
              <AssetRow key={`${group.exchange}-${idx}`} item={item} editable={false} />
            ))}
            {group.items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-400">보유 종목 없음</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────
export default function DashboardPage() {
  const { data, loading, error, refreshing, refetch } = useAssets();
  const { data: cryptoData, loading: cryptoLoading, error: cryptoError, refetch: cryptoRefetch } = useCrypto();
  const [activeTab, setActiveTab] = useState<string>("전체");
  const [itemOverrides, setItemOverrides] = useState<Record<string, Partial<AssetItem>>>({});
  const [cashOverrides, setCashOverrides] = useState<Record<string, number>>({});
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
  const [addModalAccount, setAddModalAccount] = useState<AccountGroup | null>(null);
  const [profitLogs, setProfitLogs] = useState<DailyLogItem[]>([]);
  const [savingProfit, setSavingProfit] = useState(false);
  const [updatingCrypto, setUpdatingCrypto] = useState(false);

  async function updateCryptoLogTotal() {
    try {
      setUpdatingCrypto(true);
      const res = await fetch("/api/daily-snapshot");
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API 오류: ${res.status} ${body}`);
      }
      const data = await res.json();
      console.log("암호화폐 업데이트 완료:", data);
      await new Promise((r) => setTimeout(r, 500));
      // 페이지 새로고침 (암호화폐 데이터만 업데이트되었으므로)
      window.location.reload();
    } catch (err) {
      console.error("암호화폐 업데이트 에러:", err);
      alert(err instanceof Error ? err.message : "오류 발생");
      setUpdatingCrypto(false);
    }
  }

  async function saveItem(item: AssetItem, field: "quantity" | "avgPrice", value: number) {
    const res = await fetch("/api/assets/item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, field, value }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? "저장 실패");
    }
    const key = `${item.id ?? ""}`;
    setItemOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: value } }));
    // 대시보드 데이터 갱신
    await refetch();
  }

  async function saveCash(account: AccountGroup, value: number) {
    if (!account.sheetTab || !account.cashRowIndex) throw new Error("계좌 정보 부족");
    const res = await fetch("/api/assets/item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetTab: account.sheetTab, rowIndex: account.cashRowIndex, field: "cash", value }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? "저장 실패");
    }
    const key = `${account.sheetTab ?? ""}-${account.cashRowIndex ?? ""}`;
    setCashOverrides((prev) => ({ ...prev, [key]: value }));
    // 대시보드 데이터 갱신
    await refetch();
  }

  function handleItemAdded() {
    setItemOverrides({});
    setDeletedKeys(new Set());
    refetch();
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profits");
        if (res.ok) {
          const json = (await res.json()) as { data: DailyLogItem[] };
          console.log("수익 데이터 로드:", json.data);
          setProfitLogs(json.data);
        } else {
          console.error("수익 데이터 로드 실패:", res.status, res.statusText);
        }
      } catch (err) {
        console.error("수익 데이터 로드 에러:", err);
      }
    })();
  }, []);

  async function saveProfit() {
    if (!data?.summary || savingProfit) return;
    setSavingProfit(true);
    try {
      const summary = data.summary;
      const totalGroup = summary.groups.find((g) => g.category === "개별주식");
      const pensionGroup = summary.groups.find((g) => g.category === "개인연금");
      const irpGroup = summary.groups.find((g) => g.category === "IRP");

      const res = await fetch("/api/profits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: {
            invest: summary.totalInvest,
            value: summary.totalValue - summary.groups.reduce((s, g) => s + g.cash, 0),
            profit: summary.totalProfitLoss,
            total: summary.totalValue,
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
          crypto: cryptoData ? {
            invest: cryptoData.totalInvest,
            value: cryptoData.totalValue - cryptoData.exchanges.reduce((s, e) => s + e.cash, 0),
            profit: cryptoData.totalProfitLoss,
            total: cryptoData.totalValue,
          } : { invest: 0, value: 0, profit: 0, total: 0 },
        }),
      });

      if (res.ok) {
        const newRes = await fetch("/api/profits");
        if (newRes.ok) {
          const json = (await newRes.json()) as { data: DailyLogItem[] };
          setProfitLogs(json.data);
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
    refetch();
  }

  const summary = data?.summary;

  const isCryptoTab = activeTab === "암호화폐";

  // 전체 탭에서 암호화폐 그룹을 거래소 API 데이터로 추가/교체
  const adjustedGroups: AssetGroup[] = (() => {
    if (!summary) return [];

    let groups = summary.groups.map((g) => {
      if (g.category !== "암호화폐") return g;
      if (!cryptoData) return g;
      return {
        category: "암호화폐" as AssetCategory,
        items: cryptoData.exchanges.flatMap((e) => e.items),
        cash: cryptoData.exchanges.reduce((s, e) => s + e.cash, 0),
        totalInvest: cryptoData.totalInvest,
        totalValue: cryptoData.totalValue,
        totalProfitLoss: cryptoData.totalProfitLoss,
        returnRate: cryptoData.returnRate,
        accounts: [],
      };
    });

    // 암호화폐 그룹이 없고 cryptoData가 있으면 추가
    if (!groups.some((g) => g.category === "암호화폐") && cryptoData) {
      groups.push({
        category: "암호화폐" as AssetCategory,
        items: cryptoData.exchanges.flatMap((e) => e.items),
        cash: cryptoData.exchanges.reduce((s, e) => s + e.cash, 0),
        totalInvest: cryptoData.totalInvest,
        totalValue: cryptoData.totalValue,
        totalProfitLoss: cryptoData.totalProfitLoss,
        returnRate: cryptoData.returnRate,
        accounts: [],
      });
    }

    return groups;
  })();

  const isEditable = activeTab !== "전체" && !isCryptoTab;

  const displayItems: AssetItem[] = (() => {
    if (isCryptoTab) return [];  // 암호화폐 탭은 ExchangeSection으로 별도 렌더링
    if (!summary) return [];
    if (activeTab === "전체") {
      return adjustedGroups
        .flatMap((g) => g.items)
        .sort((a, b) => b.returnRate - a.returnRate);
    }
    const group = summary.groups.find(
      (g) => g.category === (activeTab as AssetCategory)
    );
    const rawItems = (group?.items ?? [])
      .filter((item) => !deletedKeys.has(`${item.sheetTab ?? ""}-${item.rowIndex ?? ""}`))
      .sort((a, b) => b.returnRate - a.returnRate);
    // 로컬 편집 오버라이드 적용
    return rawItems.map((item) => {
      const key = `${item.sheetTab ?? ""}-${item.rowIndex ?? ""}`;
      const ov = itemOverrides[key];
      if (!ov) return item;
      const quantity = ov.quantity ?? item.quantity;
      const avgPrice = ov.avgPrice ?? item.avgPrice;
      const investAmount = quantity * avgPrice;
      const profitLoss = item.currentValue - investAmount;
      const returnRate = investAmount > 0 ? (profitLoss / investAmount) * 100 : 0;
      return { ...item, quantity, avgPrice, investAmount, profitLoss, returnRate };
    });
  })();

  const tabSummary = (() => {
    if (isCryptoTab && cryptoData) {
      return {
        totalInvest: cryptoData.totalInvest,
        totalValue: cryptoData.totalValue,
        totalProfitLoss: cryptoData.totalProfitLoss,
        returnRate: cryptoData.returnRate,
      };
    }
    if (!summary) return null;
    if (activeTab === "전체") {
      const totalInvest = adjustedGroups.reduce((s, g) => s + g.totalInvest, 0);
      const totalValue = adjustedGroups.reduce((s, g) => s + g.totalValue, 0);
      const totalProfitLoss = adjustedGroups.reduce((s, g) => s + g.totalProfitLoss, 0);
      const returnRate = totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0;
      return { totalInvest, totalValue, totalProfitLoss, returnRate };
    }
    const g = summary.groups.find((g) => g.category === activeTab);
    if (!g) return null;
    return {
      totalInvest: g.totalInvest,
      totalValue: g.totalValue,
      totalProfitLoss: g.totalProfitLoss,
      returnRate: g.returnRate,
    };
  })();

  // 카테고리 탭에서 섹터별 그룹핑 (전체·암호화폐 탭 제외)
  const sectorGroups: { sector: string; items: AssetItem[]; totalValue: number; totalProfitLoss: number; returnRate: number }[] | null = (() => {
    if (activeTab === "전체" || isCryptoTab || loading) return null;
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
    if (activeTab === "전체" || isCryptoTab || loading) return null;
    const group = summary?.groups.find((g) => g.category === (activeTab as AssetCategory));
    if (!group || group.accounts.length === 0) return null;
    return group.accounts.map((acct) => {
      const items = acct.items
        .filter((item) => !deletedKeys.has(`${item.sheetTab ?? ""}-${item.rowIndex ?? ""}`))
        .map((item) => {
          const key = `${item.sheetTab ?? ""}-${item.rowIndex ?? ""}`;
          const ov = itemOverrides[key];
          if (!ov) return item;
          const quantity = ov.quantity ?? item.quantity;
          const avgPrice = ov.avgPrice ?? item.avgPrice;
          const investAmount = quantity * avgPrice;
          const profitLoss = item.currentValue - investAmount;
          const returnRate = investAmount > 0 ? (profitLoss / investAmount) * 100 : 0;
          return { ...item, quantity, avgPrice, investAmount, profitLoss, returnRate };
        });
      return { account: acct, items };
    });
  })();

  const title = activeTab === "전체" ? "전체 자산 현황" : activeTab;

  return (
    <div className="flex min-h-screen bg-[#f8f9fc] dark:bg-[#0f1923]">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <MobileHeader activeTab={activeTab} onTabChange={setActiveTab} onRefetch={refetch} onUpdateCrypto={updateCryptoLogTotal} updatingCrypto={updatingCrypto} refreshing={refreshing} />

      <main className="flex-1 overflow-auto pt-[88px] md:pt-0 md:px-8 md:py-8">
        {/* 데스크톱 헤더 */}
        <div className="hidden md:flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#3d47cf" }}
            >
              {refreshing ? "⏳ 새로고침 중..." : "↻ 새로고침"}
            </button>
            <button
              onClick={async () => {
                const { supabase } = await import("@/lib/supabase-browser");
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-colors hover:bg-[#2a3a4a]"
              title="로그아웃"
            >
              ⎋
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
            <TotalAssetChart logs={profitLogs} />
          </>
        )}

        {/* 암호화폐 탭: 현금 현황 + 거래소별 섹션 */}
        {isCryptoTab && (
          <div className="mx-4 md:mx-0">
            {cryptoError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                거래소 연결 오류: {cryptoError}
              </div>
            )}
            {cryptoLoading ? (
              <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] p-8 text-center text-sm text-gray-400 animate-pulse">
                거래소 데이터 불러오는 중...
              </div>
            ) : cryptoData ? (
              <>
                {/* 거래소별 현황 */}
                {cryptoData.exchanges.length > 0 && (
                  <div className="mb-4 rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        계좌별 현황
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">전체 현금</span>
                        <span className="text-sm font-bold text-gray-800 dark:text-white">
                          {formatKRW(cryptoData.exchanges.reduce((s, e) => s + e.cash, 0))}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {cryptoData.exchanges.map((ex) => (
                        <div key={ex.exchange} className="rounded-lg border border-[#e8e8e8] dark:border-[#2a3a4a] p-3 bg-[#f8f9fc] dark:bg-[#0f1923]">
                          <p className="text-xs font-bold text-[#3d47cf] mb-2">{ex.exchange}</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{formatKRW(ex.totalValue)}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-400">원금 {formatKRW(ex.totalInvest)}</span>
                            <RateBadge rate={ex.returnRate} />
                          </div>
                          {ex.cash > 0 && (
                            <div className="mt-2 pt-2 border-t border-[#e8e8e8] dark:border-[#2a3a4a] flex items-center justify-between">
                              <span className="text-xs text-gray-400">현금</span>
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{formatKRW(ex.cash)}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {cryptoData.exchanges.map((group) => (
                  <ExchangeSection key={group.exchange} group={group} />
                ))}
              </>
            ) : null}
          </div>
        )}

        {/* 계좌별 현황 (개별주식, 개인연금, IRP) */}
        {!isCryptoTab && activeTab !== "전체" && (() => {
          const group = summary?.groups.find((g) => g.category === activeTab);
          if (!group) return null;
          return (
            <AccountsOverview
              accounts={group.accounts}
              totalCash={group.cash}
              editable={isEditable}
              cashOverrides={cashOverrides}
              onCashSave={saveCash}
            />
          );
        })()}

        {/* 전체 탭: 카테고리별 계좌 현황 */}
        {activeTab === "전체" && summary && (
          <div className="mx-4 md:mx-0 mb-6">
            {summary.groups.map((group) => {
              if (group.category === "암호화폐") return null;
              if (group.accounts.length === 0 && group.cash <= 0) return null;
              return (
                <div key={group.category} className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    {group.category} 계좌
                  </h2>
                  <AccountsOverview
                    accounts={group.accounts}
                    totalCash={group.cash}
                    editable={false}
                    cashOverrides={cashOverrides}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* 전체 탭: 암호화폐 거래소 현황 */}
        {activeTab === "전체" && cryptoData && cryptoData.exchanges.length > 0 && (
          <div className="mx-4 md:mx-0 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 md:px-0 mb-3">
              암호화폐 거래소
            </h2>
            {cryptoData.exchanges.map((exchange) => (
              <ExchangeSection key={exchange.exchange} group={exchange} />
            ))}
          </div>
        )}

        {/* 자산 목록 (암호화폐 탭 제외) */}
        {!isCryptoTab && <div className="rounded-xl border border-[#e0e0e0] bg-white dark:bg-[#1a2332] dark:border-[#2a3a4a] overflow-hidden mx-4 md:mx-0 mb-6">
          {/* 섹션 제목 */}
          <div className="px-4 py-3 border-b border-[#f0f0f0] dark:border-[#2a3a4a]">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {activeTab === "전체" ? "전체 종목" : `${activeTab} 종목`}
              {!loading && (() => {
                const count = accountGroups
                  ? accountGroups.reduce((s, ag) => s + ag.items.length, 0)
                  : displayItems.length;
                return count > 0 ? <span className="ml-1.5 text-gray-400 font-normal">({count})</span> : null;
              })()}
            </span>
          </div>

          {/* 모바일: 카드 */}
          <div className="md:hidden">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : accountGroups ? (
              accountGroups.map(({ account, items }) => (
                <div key={account.name}>
                  <div className="flex items-center justify-between px-4 py-2 bg-[#f0f2f8] dark:bg-[#0f1923] border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
                    <span className="text-xs font-bold text-[#3d47cf] leading-tight">
                      {account.name}
                      <span className="ml-1.5 font-normal text-gray-400">({items.length})</span>
                    </span>
                    <div className="flex items-center gap-1.5 h-5">
                      <span className="text-xs text-gray-500 leading-tight">{formatKRW(account.totalValue)}</span>
                      <RateBadge rate={account.returnRate} />
                    </div>
                  </div>
                  {items.map((item, idx) => (
                    <AssetCard key={`${account.name}-${idx}`} item={item} />
                  ))}
                  {isEditable && (
                    <div className="px-4 py-3 border-t border-[#e0e0e0] dark:border-[#2a3a4a]">
                      <button
                        onClick={() => setAddModalAccount(account)}
                        className="text-xs font-semibold text-white px-2 py-0.5 rounded-full"
                        style={{ background: "#3d47cf" }}
                      >
                        + 추가
                      </button>
                    </div>
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
                    <AssetCard key={`${sector}-${idx}`} item={item} />
                  ))}
                </div>
              ))
            ) : displayItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">데이터가 없습니다.</p>
            ) : (
              displayItems.map((item, idx) => (
                <AssetCard key={`${activeTab}-${idx}`} item={item} />
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
                ) : accountGroups ? (
                  accountGroups.map(({ account, items }) => (
                    <>
                      <tr key={`acct-hd-${account.name}`} className="border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
                        <td colSpan={7} className="px-4 py-2 bg-[#f0f2f8] dark:bg-[#0f1923]">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#3d47cf] leading-tight">
                              {account.name}
                              <span className="ml-1.5 font-normal text-gray-400">({items.length}종목)</span>
                            </span>
                            <div className="flex items-center gap-1.5 h-5">
                              <span className="text-xs text-gray-500 leading-tight whitespace-nowrap">{formatKRW(account.totalValue)}</span>
                              <span
                                className="text-xs font-medium leading-tight whitespace-nowrap"
                                style={{ color: rateColor(account.totalProfitLoss) }}
                              >
                                {account.totalProfitLoss >= 0 ? "+" : ""}{formatKRW(account.totalProfitLoss)}
                              </span>
                              <RateBadge rate={account.returnRate} />
                            </div>
                          </div>
                        </td>
                      </tr>
                      {items.map((item, idx) => (
                        <AssetRow
                          key={`${account.name}-${idx}-${item.name}`}
                          item={item}
                          editable={isEditable}
                          onSave={(field, value) => saveItem(item, field, value)}
                          onDelete={() => deleteItem(item)}
                        />
                      ))}
                      {isEditable && (
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
                    </>
                  ))
                ) : sectorGroups ? (
                  sectorGroups.map(({ sector, items, totalValue, totalProfitLoss, returnRate }) => (
                    <>
                      <tr key={`sector-hd-${sector}`} className="border-b border-[#e0e0e0] dark:border-[#2a3a4a]">
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
                        />
                      ))}
                    </>
                  ))
                ) : (
                  displayItems.map((item, idx) => (
                    <AssetRow
                      key={`${activeTab}-${idx}-${item.name}`}
                      item={item}
                      editable={isEditable}
                      onSave={(field, value) => saveItem(item, field, value)}
                      onDelete={() => deleteItem(item)}
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

        {/* AI 분석 패널 (개별주식, 개인연금, IRP, 암호화폐 탭) */}
        {(activeTab === "개별주식" || activeTab === "개인연금" || activeTab === "IRP" || activeTab === "암호화폐") && summary && (
          (() => {
            const categoryKey = activeTab as AssetCategory;
            const group = activeTab === "암호화폐"
              ? adjustedGroups.find((g) => g.category === categoryKey)
              : summary.groups.find((g) => g.category === categoryKey);
            if (!group) return null;
            return (
              <PortfolioAnalysisPanel
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

      {/* 종목 추가 모달 */}
      {addModalAccount && isEditable && (
        <AddItemModal
          account={addModalAccount}
          sheetTab={SHEET_TABS[activeTab as AssetCategory]}
          assetCategory={activeTab as AssetCategory}
          onClose={() => setAddModalAccount(null)}
          onAdded={handleItemAdded}
        />
      )}
    </div>
  );
}
