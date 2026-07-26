import { NextRequest, NextResponse } from "next/server";
import { isValidCronRequest } from "@/lib/cron-auth";
import { DASHBOARD_OWNER_USER_ID, runBenchmarkSync } from "@/lib/sync-jobs";

export const dynamic = "force-dynamic";

function getKoreaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value).getTime());
}

export async function GET(req: NextRequest) {
  try {
    if (!isValidCronRequest(req)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const today = getKoreaDateString();
    const startDate = req.nextUrl.searchParams.get("start") ?? today;
    const endDate = req.nextUrl.searchParams.get("end") ?? today;

    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "유효한 조회 기간이 필요합니다." }, { status: 400 });
    }

    const rangeDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
    if (rangeDays > 370) {
      return NextResponse.json({ error: "조회 기간은 최대 370일입니다." }, { status: 400 });
    }

    const result = await runBenchmarkSync(
      DASHBOARD_OWNER_USER_ID,
      "cron",
      startDate,
      endDate
    );
    return NextResponse.json({ success: true, startDate, endDate, result });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "벤치마크 저장 실패" },
      { status: 500 }
    );
  }
}
