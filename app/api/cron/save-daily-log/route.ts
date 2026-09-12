import type { NextRequest } from "next/server";
import { isValidCronRequest } from "@/lib/cron-auth";
import {
  DASHBOARD_OWNER_USER_ID,
  runDailyClosePipeline,
} from "@/lib/sync-jobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isValidCronRequest(req)) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const result = await runDailyClosePipeline(DASHBOARD_OWNER_USER_ID, "cron");
    return Response.json(result, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
