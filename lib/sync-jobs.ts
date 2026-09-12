import { saveBenchmarkRange } from "@/lib/benchmarks";
import { saveDailyLog } from "@/lib/daily-calculator";
import { hasMemoryCachedKisToken } from "@/lib/kis-client";
import { getKisTokenCacheSnapshot } from "@/lib/kis-token-cache";
import { fetchStockPrices } from "@/lib/price-fetcher";
import { getRequiredSupabaseAdminClient } from "@/lib/supabase-admin";
import { DASHBOARD_OWNER_USER_ID } from "@/lib/auth-config";
import { executeSyncRun, type SyncJobResult } from "@/lib/sync-runs";
import type { SyncRunTrigger } from "@/lib/types";

export { DASHBOARD_OWNER_USER_ID };

export interface DailyClosePipelineResult {
  success: boolean;
  partial: boolean;
  date: string;
  steps: {
    prices: SyncJobResult;
    dailyLog: SyncJobResult;
    benchmarks: SyncJobResult;
  };
  validation: {
    dailyLogRows: number;
    benchmarkSymbols: string[];
  };
}

function getKoreaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function performPriceSync(userId: string): Promise<SyncJobResult> {
  const admin = getRequiredSupabaseAdminClient();
  const memoryCacheHit = hasMemoryCachedKisToken();
  const tokenBefore = await getKisTokenCacheSnapshot();
  const { data: assets, error: assetsError } = await admin
    .from("assets")
    .select("code")
    .eq("is_cash", false)
    .eq("user_id", userId);

  if (assetsError) throw assetsError;

  const codes = Array.from(new Set(
    (assets ?? [])
      .map((asset) => asset.code)
      .filter((code): code is string => typeof code === "string" && code.length > 0)
  ));

  if (codes.length === 0) {
    return { details: { updated: 0, totalCodes: 0, tokenSource: "unused" } };
  }

  const prices = await fetchStockPrices(codes);
  const priceRecords = Object.entries(prices).map(([code, price]) => ({
    code,
    price,
    updated_at: new Date().toISOString(),
  }));

  if (priceRecords.length === 0) {
    throw new Error("현재가를 한 건도 가져오지 못했습니다.");
  }

  const { error: upsertError } = await admin
    .from("prices")
    .upsert(priceRecords, { onConflict: "code" });
  if (upsertError) throw upsertError;

  const tokenAfter = await getKisTokenCacheSnapshot();
  const tokenSource = memoryCacheHit
    ? "memory"
    : tokenBefore.status === "hit"
      ? "database"
      : tokenAfter.status === "hit"
        ? "issued"
        : "unknown";
  const status = priceRecords.length < codes.length ? "partial" : "success";

  return {
    status,
    details: {
      updated: priceRecords.length,
      totalCodes: codes.length,
      missing: codes.length - priceRecords.length,
      tokenSource,
      tokenExpiresAt: tokenAfter.expiresAt ?? tokenBefore.expiresAt ?? null,
    },
  };
}

export async function runPriceSync(
  userId: string,
  trigger: SyncRunTrigger
): Promise<SyncJobResult> {
  return executeSyncRun({ userId, job: "prices", trigger }, () => performPriceSync(userId));
}

export async function runDailyLogSync(
  userId: string,
  trigger: SyncRunTrigger
): Promise<SyncJobResult> {
  return executeSyncRun({ userId, job: "daily_log", trigger }, async () => {
    const saved = await saveDailyLog(userId);
    return { details: saved };
  });
}

export async function runBenchmarkSync(
  userId: string,
  trigger: SyncRunTrigger,
  startDate = getKoreaDateString(),
  endDate = startDate
): Promise<SyncJobResult> {
  return executeSyncRun({ userId, job: "benchmarks", trigger }, async () => {
    const saved = await saveBenchmarkRange(startDate, endDate);
    const bothSaved = saved.KOSPI > 0 && saved.SPX > 0;
    return {
      status: bothSaved ? "success" : "partial",
      details: { startDate, endDate, KOSPI: saved.KOSPI, SPX: saved.SPX },
    };
  });
}

async function validateDailyClosePipeline(
  userId: string,
  date: string
): Promise<DailyClosePipelineResult["validation"]> {
  const admin = getRequiredSupabaseAdminClient();
  const [{ count: dailyLogRows, error: dailyLogError }, { data: benchmarkRows, error: benchmarkError }] = await Promise.all([
    admin
      .from("daily_log")
      .select("date", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("date", date),
    admin
      .from("benchmark_daily")
      .select("symbol")
      .eq("date", date)
      .in("symbol", ["KOSPI", "SPX"]),
  ]);

  if (dailyLogError) throw dailyLogError;
  if (benchmarkError) throw benchmarkError;
  if (dailyLogRows !== 1) {
    throw new Error(`일일 자산 로그 검증 실패: ${date} 기록이 ${dailyLogRows ?? 0}건입니다.`);
  }

  return {
    dailyLogRows,
    benchmarkSymbols: Array.from(new Set(
      (benchmarkRows ?? []).flatMap((row) => typeof row.symbol === "string" ? [row.symbol] : [])
    )).sort(),
  };
}

export async function runDailyClosePipeline(
  userId: string,
  trigger: SyncRunTrigger
): Promise<DailyClosePipelineResult> {
  const date = getKoreaDateString();
  const prices = await runPriceSync(userId, trigger);
  const dailyLog = await runDailyLogSync(userId, trigger);
  const benchmarks = await runBenchmarkSync(userId, trigger, date, date);
  const validation = await validateDailyClosePipeline(userId, date);
  const partial = prices.status === "partial"
    || dailyLog.status === "partial"
    || benchmarks.status === "partial"
    || validation.benchmarkSymbols.length < 2;

  return {
    success: true,
    partial,
    date,
    steps: { prices, dailyLog, benchmarks },
    validation,
  };
}
