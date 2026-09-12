import { getRequiredSupabaseAdminClient } from "@/lib/supabase-admin";
import type { SyncJob, SyncRunStatus, SyncRunTrigger } from "@/lib/types";

const SYNC_TIMEOUT_MS: Record<SyncJob, number> = {
  prices: 20 * 60 * 1000,
  daily_log: 10 * 60 * 1000,
  benchmarks: 20 * 60 * 1000,
};

interface RunningSyncRunRow {
  id: number;
  job: SyncJob;
  started_at: string;
}

export class SyncRunAlreadyRunningError extends Error {
  constructor(job: SyncJob) {
    super(`${job} 동기화가 이미 실행 중입니다.`);
    this.name = "SyncRunAlreadyRunningError";
  }
}

export function getSyncRunTimeoutMs(job: SyncJob): number {
  return SYNC_TIMEOUT_MS[job];
}

export function isSyncRunStale(
  job: SyncJob,
  startedAt: string,
  now = new Date()
): boolean {
  const startedAtMs = new Date(startedAt).getTime();
  return !Number.isFinite(startedAtMs)
    || now.getTime() - startedAtMs > getSyncRunTimeoutMs(job);
}

export async function expireStaleSyncRuns(userId: string, now = new Date()): Promise<number> {
  const admin = getRequiredSupabaseAdminClient();
  const { data, error } = await admin
    .from("sync_runs")
    .select("id, job, started_at")
    .eq("user_id", userId)
    .eq("status", "running");

  if (error) throw error;
  const staleRuns = ((data ?? []) as RunningSyncRunRow[])
    .filter((run) => isSyncRunStale(run.job, run.started_at, now));

  if (staleRuns.length === 0) return 0;

  const { error: updateError } = await admin
    .from("sync_runs")
    .update({
      status: "failed",
      finished_at: now.toISOString(),
      error_message: "실행 제한 시간을 초과해 자동으로 실패 처리했습니다.",
    })
    .in("id", staleRuns.map((run) => run.id));

  if (updateError) throw updateError;
  return staleRuns.length;
}

export interface SyncJobResult {
  status?: Exclude<SyncRunStatus, "failed">;
  details?: Record<string, unknown>;
}

interface ExecuteSyncRunOptions {
  userId: string;
  job: SyncJob;
  trigger: SyncRunTrigger;
}

export async function executeSyncRun(
  options: ExecuteSyncRunOptions,
  task: () => Promise<SyncJobResult>
): Promise<SyncJobResult> {
  const admin = getRequiredSupabaseAdminClient();
  await expireStaleSyncRuns(options.userId);

  const { data: activeRun, error: activeRunError } = await admin
    .from("sync_runs")
    .select("id")
    .eq("user_id", options.userId)
    .eq("job", options.job)
    .eq("status", "running")
    .limit(1)
    .maybeSingle<{ id: number }>();

  if (activeRunError) throw activeRunError;
  if (activeRun) throw new SyncRunAlreadyRunningError(options.job);

  const startedAtMs = Date.now();
  const { data: run, error: startError } = await admin
    .from("sync_runs")
    .insert({
      user_id: options.userId,
      job: options.job,
      status: "running",
      trigger: options.trigger,
    })
    .select("id")
    .single<{ id: number }>();

  if (startError || !run) {
    if (startError?.code === "23505") throw new SyncRunAlreadyRunningError(options.job);
    throw new Error(startError?.message ?? "동기화 실행 이력을 시작하지 못했습니다.");
  }

  try {
    const result = await task();
    const status = result.status ?? "success";
    const details = {
      ...(result.details ?? {}),
      durationMs: Date.now() - startedAtMs,
    };
    const { error: finishError } = await admin
      .from("sync_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        details,
        error_message: null,
      })
      .eq("id", run.id);

    if (finishError) throw finishError;
    return { ...result, status, details };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "동기화 작업에 실패했습니다.";
    await admin
      .from("sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        details: { durationMs: Date.now() - startedAtMs },
        error_message: message,
      })
      .eq("id", run.id);
    throw error instanceof Error ? error : new Error(message);
  }
}
