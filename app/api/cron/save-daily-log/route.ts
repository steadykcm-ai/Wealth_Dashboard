import type { NextRequest } from "next/server";
import { saveDailyLog } from "@/lib/daily-calculator";
import { saveBenchmarkRange } from "@/lib/benchmarks";
import { isValidCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

function getKoreaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  try {
    if (!isValidCronRequest(req)) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // Jake의 user_id로 고정
    const OWNER_USER_ID = "56701cc8-3dff-405d-a2b7-1ff4301e92cc";

    const success = await saveDailyLog(OWNER_USER_ID);

    if (success) {
      try {
        const today = getKoreaDateString();
        const benchmark = await saveBenchmarkRange(today, today);
        return Response.json({ success: true, message: "일일 자산 로그 저장 완료", benchmark }, { status: 200 });
      } catch (benchmarkError: unknown) {
        return Response.json({
          success: true,
          message: "일일 자산 로그 저장 완료",
          benchmarkWarning: benchmarkError instanceof Error ? benchmarkError.message : "벤치마크 저장 실패",
        }, { status: 200 });
      }
    } else {
      return Response.json({ success: false, error: "일일 자산 로그 저장 실패 - 서버 로그를 확인하세요." }, { status: 500 });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
