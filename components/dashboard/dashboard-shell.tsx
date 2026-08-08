"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { formatKRW } from "@/lib/number-format";
import { formatPriceUpdatedAt } from "@/lib/dashboard-format";
import type { PortfolioValidationReport } from "@/lib/portfolio-validation";
import type { PortfolioChangeCandidate, SyncJob, SyncRun } from "@/lib/types";

interface DataQualityIssue {
  id: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
}

interface AllocationDriftItem {
  category: "개별주식" | "개인연금";
  name: string;
  currentWeight: number;
  targetWeight: number;
  difference: number;
}

const TABS = [
  { id: "전체", label: "전체" },
  { id: "개별주식", label: "주식" },
  { id: "개인연금", label: "연금" },
  { id: "시장", label: "시장" },
];

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function SummaryCard({
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

interface NotificationItem {
  key: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
  action?: "changes" | "stocks" | "pension";
}

export function NotificationCenter({
  issues,
  runs,
  changeCandidates,
  driftItems,
  onOpenChanges,
  onTabChange,
}: {
  issues: DataQualityIssue[];
  runs: SyncRun[];
  changeCandidates: PortfolioChangeCandidate[];
  driftItems: AllocationDriftItem[];
  onOpenChanges: () => void;
  onTabChange: (tab: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notification-reads", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("알림 확인 기록 조회 실패");
        return response.json() as Promise<{ keys: string[] }>;
      })
      .then((body) => {
        if (!cancelled) setReadKeys(new Set(body.keys));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = issues.map((issue) => ({
      key: `quality:${issue.id}`,
      severity: issue.severity,
      title: issue.title,
      detail: issue.detail,
    }));
    (["prices", "daily_log", "benchmarks"] as SyncJob[]).forEach((job) => {
      const latest = runs.find((run) => run.job === job);
      const latestSuccess = runs.find((run) => run.job === job && run.status !== "failed");
      const staleHours = job === "daily_log" ? 36 : 72;
      const stale = !latestSuccess || Date.now() - new Date(latestSuccess.finishedAt).getTime() > staleHours * 60 * 60 * 1000;
      if (latest?.status === "failed" || latest?.status === "partial" || stale) {
        const timestamp = latest?.finishedAt ?? "none";
        items.push({
          key: `sync:${job}:${timestamp}:${latest?.status ?? "missing"}`,
          severity: latest?.status === "failed" ? "critical" : "warning",
          title: `${syncJobLabel(job)} 갱신 ${latest?.status === "failed" ? "실패" : "확인 필요"}`,
          detail: latest?.errorMessage ?? (latest ? `${formatSyncRunTime(latest.finishedAt)} · ${syncRunDetail(latest)}` : "실행 이력이 없습니다."),
        });
      }
    });
    if (changeCandidates.length > 0) {
      const latestDate = [...changeCandidates].sort((left, right) => right.date.localeCompare(left.date))[0]?.date ?? "unknown";
      items.push({
        key: `changes:${latestDate}:${changeCandidates.length}`,
        severity: "warning",
        title: "자산 변동 확인",
        detail: `${changeCandidates.length}건의 입출금 또는 평가 변동을 분류해야 합니다.`,
        action: "changes",
      });
    }
    driftItems.forEach((item) => items.push({
      key: `drift:${item.category}:${item.name}:${Math.round(item.difference * 10)}`,
      severity: "warning",
      title: `${item.name} 목표 비중 이탈`,
      detail: `현재 ${item.currentWeight.toFixed(1)}% · 목표 ${item.targetWeight.toFixed(1)}% · ${item.difference > 0 ? "+" : ""}${item.difference.toFixed(1)}%p`,
      action: item.category === "개별주식" ? "stocks" : "pension",
    }));
    return items;
  }, [changeCandidates, driftItems, issues, runs]);
  const unread = notifications.filter((item) => !readKeys.has(item.key));

  async function markRead(keys: string[]) {
    if (keys.length === 0) return;
    setReadKeys((previous) => new Set([...previous, ...keys]));
    try {
      const response = await fetch("/api/notification-reads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      if (!response.ok) throw new Error("알림 확인 처리 실패");
    } catch {
      setReadKeys((previous) => {
        const next = new Set(previous);
        keys.forEach((key) => next.delete(key));
        return next;
      });
    }
  }

  function runAction(item: NotificationItem) {
    if (item.action === "changes") onOpenChanges();
    if (item.action === "stocks") onTabChange("개별주식");
    if (item.action === "pension") onTabChange("개인연금");
    void markRead([item.key]);
  }

  if (unread.length === 0) return null;

  const hasCriticalIssue = unread.some((issue) => issue.severity === "critical");
  const colorClasses = hasCriticalIssue
    ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
    : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";

  return (
    <section className={`mx-4 mb-4 border-y md:mx-0 ${colorClasses}`} aria-label="알림센터">
      <button
        type="button"
        onClick={() => setIsExpanded((previous) => !previous)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span>
          <span className="block text-sm font-semibold">알림센터</span>
          <span className="block text-xs opacity-75">확인하지 않은 알림 {unread.length}건</span>
        </span>
        <span className="text-sm opacity-70">{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-current/15 px-3 py-1">
          <div className="flex justify-end border-b border-current/10 py-2">
            <button type="button" onClick={() => void markRead(unread.map((item) => item.key))} className="text-xs font-semibold underline underline-offset-2">모두 확인</button>
          </div>
          {unread.slice(0, 10).map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-3 border-b border-current/10 py-2.5 last:border-b-0">
              <span className="min-w-0"><span className="block text-xs font-semibold">{item.title}</span><span className="mt-0.5 block text-[11px] opacity-75">{item.detail}</span></span>
              <span className="flex shrink-0 gap-2">
                {item.action && <button type="button" onClick={() => runAction(item)} className="rounded-md border border-current/30 px-2 py-1 text-[11px] font-semibold">보기</button>}
                <button type="button" onClick={() => void markRead([item.key])} className="rounded-md border border-current/30 px-2 py-1 text-[11px]">확인</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PortfolioValidationPanel({ report }: { report: PortfolioValidationReport }) {
  const [isExpanded, setIsExpanded] = useState(report.calculationIssues > 0);
  const hasCalculationIssue = report.calculationIssues > 0;
  const hasFreshnessIssue = report.freshnessIssues > 0;
  const visibleIssues = report.issues.slice(0, 12);

  return (
    <section
      className="mx-4 mb-4 overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0"
      aria-label="자산 데이터 검증"
    >
      <button
        type="button"
        onClick={() => setIsExpanded((previous) => !previous)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">자산 데이터 검증</span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            종목부터 전체 자산까지 합계를 다시 계산합니다
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
              hasCalculationIssue
                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            {hasCalculationIssue ? `계산 오류 ${report.calculationIssues}건` : "계산 일치"}
          </span>
          <span className="text-sm text-gray-400" aria-hidden="true">{isExpanded ? "▲" : "▼"}</span>
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-[#eeeeee] px-4 py-3 dark:border-[#2a3a4a]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">계산 검증</p>
              <p className={`mt-0.5 text-sm font-semibold ${hasCalculationIssue ? "text-red-600" : "text-emerald-600"}`}>
                {report.calculationChecks - report.calculationIssues}/{report.calculationChecks} 일치
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">가격·평가 기준일</p>
              <p className={`mt-0.5 text-sm font-semibold ${hasFreshnessIssue ? "text-amber-600" : "text-emerald-600"}`}>
                {hasFreshnessIssue ? `확인 필요 ${report.freshnessIssues}건` : `${report.freshnessChecks}종목 정상`}
              </p>
            </div>
          </div>

          {visibleIssues.length === 0 ? (
            <p className="mt-3 border-t border-[#eeeeee] pt-3 text-xs text-gray-500 dark:border-[#2a3a4a] dark:text-gray-400">
              합계와 데이터 기준일에서 발견된 문제가 없습니다.
            </p>
          ) : (
            <div className="mt-3 border-t border-[#eeeeee] dark:border-[#2a3a4a]">
              {visibleIssues.map((issue) => (
                <div key={issue.id} className="flex items-start justify-between gap-3 border-b border-[#eeeeee] py-2.5 last:border-b-0 dark:border-[#2a3a4a]">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">{issue.title}</span>
                    <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">{issue.detail}</span>
                  </span>
                  {typeof issue.difference === "number" && (
                    <span className="shrink-0 text-xs font-semibold text-red-600">
                      {issue.difference >= 0 ? "+" : ""}{formatKRW(issue.difference)}
                    </span>
                  )}
                </div>
              ))}
              {report.issues.length > visibleIssues.length && (
                <p className="py-2 text-center text-[11px] text-gray-400">
                  그 외 {report.issues.length - visibleIssues.length}건
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
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

export function DataSyncStatus({
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

export function Sidebar({
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
    { id: "시장", label: "시장 동향" },
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
export function MobileHeader({
  activeTab,
  onTabChange,
  onRefetch,
  refreshing,
  showRefresh = true,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
  onRefetch: () => void;
  refreshing: boolean;
  showRefresh?: boolean;
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
          {showRefresh && (
            <button
              onClick={onRefetch}
              disabled={refreshing}
              className="text-xs font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "#3d47cf" }}
              title="가격 새로고침"
            >
              {refreshing ? "⏳" : "↻"}
            </button>
          )}
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
