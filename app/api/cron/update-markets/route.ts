import type { NextRequest } from "next/server";
import { isValidCronRequest } from "@/lib/cron-auth";
import { collectMarketOverview } from "@/lib/market-data";
import { saveMarketSnapshot } from "@/lib/market-snapshot";
import { DASHBOARD_OWNER_USER_ID } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isValidCronRequest(req)) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const overview = await collectMarketOverview();
    const saved = await saveMarketSnapshot(DASHBOARD_OWNER_USER_ID, overview);
    return Response.json({
      success: true,
      updatedAt: saved.updatedAt,
      storedAt: saved.delivery?.storedAt,
      partial: saved.partial,
      unavailableCount: saved.unavailableCount,
    });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "시장 snapshot 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
