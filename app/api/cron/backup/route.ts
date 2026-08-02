import type { NextRequest } from "next/server";
import { isValidCronRequest } from "@/lib/cron-auth";
import { getRequiredSupabaseAdminClient } from "@/lib/supabase-admin";
import { DASHBOARD_OWNER_USER_ID } from "@/lib/auth-config";
import { createPortfolioBackup } from "@/lib/portfolio-backup";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!isValidCronRequest(request)) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const backup = await createPortfolioBackup(
      getRequiredSupabaseAdminClient(),
      DASHBOARD_OWNER_USER_ID,
      "automatic"
    );
    return Response.json({ ok: true, backup });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "자동 백업에 실패했습니다." },
      { status: 500 }
    );
  }
}
