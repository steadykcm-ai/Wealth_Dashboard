import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isValidCronRequest } from "@/lib/cron-auth";
import { DASHBOARD_OWNER_USER_ID, runPriceSync } from "@/lib/sync-jobs";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const cronAuthorized = isValidCronRequest(req);
    let userId = DASHBOARD_OWNER_USER_ID;

    if (!cronAuthorized) {
      const supabaseServer = await createSupabaseServer();
      const { data: { user } } = await supabaseServer.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
      }
      userId = user.id;
    }

    const result = await runPriceSync(userId, cronAuthorized ? "cron" : "manual");
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
