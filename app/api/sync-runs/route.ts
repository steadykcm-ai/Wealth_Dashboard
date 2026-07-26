import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { runBenchmarkSync, runDailyLogSync, runPriceSync } from "@/lib/sync-jobs";
import type { SyncJob, SyncRun, SyncRunStatus, SyncRunTrigger } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SyncRunRow {
  id: number;
  job: SyncJob;
  status: SyncRunStatus;
  trigger: SyncRunTrigger;
  started_at: string;
  finished_at: string | null;
  details: Record<string, unknown> | null;
  error_message: string | null;
}

function toSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    job: row.job,
    status: row.status,
    trigger: row.trigger,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? row.started_at,
    details: row.details ?? {},
    errorMessage: row.error_message ?? undefined,
  };
}

export async function GET() {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { data, error } = await supabaseServer
      .from("sync_runs")
      .select("id, job, status, trigger, started_at, finished_at, details, error_message")
      .eq("user_id", user.id)
      .neq("status", "running")
      .order("started_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    return NextResponse.json({ runs: ((data ?? []) as SyncRunRow[]).map(toSyncRun) });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "동기화 이력 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json() as { job?: SyncJob };
    const job = body.job;
    if (job !== "prices" && job !== "daily_log" && job !== "benchmarks") {
      return NextResponse.json({ error: "지원하지 않는 동기화 작업입니다." }, { status: 400 });
    }

    const result = job === "prices"
      ? await runPriceSync(user.id, "manual")
      : job === "daily_log"
        ? await runDailyLogSync(user.id, "manual")
        : await runBenchmarkSync(user.id, "manual");

    return NextResponse.json({ success: true, job, result });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "동기화 재시도에 실패했습니다." },
      { status: 500 }
    );
  }
}
