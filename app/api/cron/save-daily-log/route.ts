import type { NextRequest } from "next/server";
import { isValidCronRequest } from "@/lib/cron-auth";
import {
  DASHBOARD_OWNER_USER_ID,
  runBenchmarkSync,
  runDailyLogSync,
  runPriceSync,
} from "@/lib/sync-jobs";
import type { SyncJobResult } from "@/lib/sync-runs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isValidCronRequest(req)) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const results: Record<string, { ok: boolean; result?: SyncJobResult; error?: string }> = {};
    const run = async (key: string, task: () => Promise<SyncJobResult>) => {
      try {
        results[key] = { ok: true, result: await task() };
      } catch (error: unknown) {
        results[key] = {
          ok: false,
          error: error instanceof Error ? error.message : "동기화 작업에 실패했습니다.",
        };
      }
    };

    await run("prices", () => runPriceSync(DASHBOARD_OWNER_USER_ID, "cron"));
    await run("daily_log", () => runDailyLogSync(DASHBOARD_OWNER_USER_ID, "cron"));
    await run("benchmarks", () => runBenchmarkSync(DASHBOARD_OWNER_USER_ID, "cron"));

    const success = Object.values(results).every((result) => result.ok);
    return Response.json({ success, results }, { status: success ? 200 : 500 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
