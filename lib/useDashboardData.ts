"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BenchmarkSeries,
  DailyLogItem,
  PortfolioChangeCandidate,
  PortfolioEvent,
  SyncJob,
  SyncRun,
} from "@/lib/types";

export interface ProfitLogMeta {
  basis: "daily_close";
  latestLogDate: string | null;
  isTodayConfirmed: boolean;
  today: string;
}

export interface PerformanceDataResponse {
  data: DailyLogItem[];
  benchmarks?: BenchmarkSeries[];
  portfolioEvents?: PortfolioEvent[];
  changeCandidates?: PortfolioChangeCandidate[];
  meta?: ProfitLogMeta;
}

interface UseDashboardDataOptions {
  reloadAssets: () => Promise<void>;
  refetchAssets: () => Promise<void>;
}

export function useDashboardData({ reloadAssets, refetchAssets }: UseDashboardDataOptions) {
  const [profitLogs, setProfitLogs] = useState<DailyLogItem[]>([]);
  const [benchmarkSeries, setBenchmarkSeries] = useState<BenchmarkSeries[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [portfolioEvents, setPortfolioEvents] = useState<PortfolioEvent[]>([]);
  const [changeCandidates, setChangeCandidates] = useState<PortfolioChangeCandidate[]>([]);
  const [profitLogMeta, setProfitLogMeta] = useState<ProfitLogMeta | null>(null);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [syncRunsLoading, setSyncRunsLoading] = useState(true);
  const [syncRunsError, setSyncRunsError] = useState<string | null>(null);
  const [retryingJob, setRetryingJob] = useState<SyncJob | null>(null);

  const fetchSyncRuns = useCallback(async () => {
    setSyncRunsLoading(true);
    setSyncRunsError(null);
    try {
      const response = await fetch("/api/sync-runs", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const body = await response.json() as { runs: SyncRun[] };
      setSyncRuns(body.runs);
    } catch (error: unknown) {
      setSyncRunsError(error instanceof Error ? error.message : "동기화 이력을 불러오지 못했습니다.");
    } finally {
      setSyncRunsLoading(false);
    }
  }, []);

  const fetchPerformanceData = useCallback(async (): Promise<PerformanceDataResponse | null> => {
    setPerformanceLoading(true);
    setPerformanceError(null);
    try {
      const response = await fetch("/api/profits", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const body = await response.json() as PerformanceDataResponse;
      setProfitLogs(body.data);
      setBenchmarkSeries(body.benchmarks ?? []);
      setPortfolioEvents(body.portfolioEvents ?? []);
      setChangeCandidates(body.changeCandidates ?? []);
      setProfitLogMeta(body.meta ?? null);
      return body;
    } catch (error: unknown) {
      setPerformanceError(error instanceof Error ? error.message : "성과 데이터를 불러오지 못했습니다.");
      return null;
    } finally {
      setPerformanceLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPerformanceData();
    void fetchSyncRuns();
  }, [fetchPerformanceData, fetchSyncRuns]);

  const retrySyncJob = useCallback(async (job: SyncJob) => {
    if (retryingJob) return;
    setRetryingJob(job);
    setSyncRunsError(null);
    try {
      const response = await fetch("/api/sync-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "동기화 재시도에 실패했습니다.");
      }

      if (job === "prices") await reloadAssets();
      if (job === "daily_log" || job === "benchmarks") await fetchPerformanceData();
      await fetchSyncRuns();
    } catch (error: unknown) {
      setSyncRunsError(error instanceof Error ? error.message : "동기화 재시도에 실패했습니다.");
      await fetchSyncRuns();
    } finally {
      setRetryingJob(null);
    }
  }, [fetchPerformanceData, fetchSyncRuns, reloadAssets, retryingJob]);

  const refreshDashboard = useCallback(async () => {
    await refetchAssets();
    await fetchSyncRuns();
  }, [fetchSyncRuns, refetchAssets]);

  return {
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
  };
}
