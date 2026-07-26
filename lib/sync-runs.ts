import { getRequiredSupabaseAdminClient } from "@/lib/supabase-admin";
import type { SyncJob, SyncRunStatus, SyncRunTrigger } from "@/lib/types";

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
    throw new Error(startError?.message ?? "동기화 실행 이력을 시작하지 못했습니다.");
  }

  try {
    const result = await task();
    const status = result.status ?? "success";
    const { error: finishError } = await admin
      .from("sync_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        details: result.details ?? {},
        error_message: null,
      })
      .eq("id", run.id);

    if (finishError) throw finishError;
    return { ...result, status };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "동기화 작업에 실패했습니다.";
    await admin
      .from("sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", run.id);
    throw error instanceof Error ? error : new Error(message);
  }
}
