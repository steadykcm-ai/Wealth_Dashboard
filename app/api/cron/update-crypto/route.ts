import { NextRequest, NextResponse } from "next/server";
import { isValidCronRequest } from "@/lib/cron-auth";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    if (!isValidCronRequest(req)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

    // /api/crypto 호출해서 캐시 생성
    const response = await fetch(`${baseUrl}/api/crypto`, {
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    if (!response.ok) {
      throw new Error(`가상자산 API 조회 실패: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: "암호화폐 데이터 캐시 업데이트 완료",
      timestamp: new Date().toISOString(),
      dataPoints: data.exchanges?.length || 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "크론 작업 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
