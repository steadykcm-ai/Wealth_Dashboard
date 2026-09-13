import { NextResponse } from "next/server";
import { isDashboardOwner } from "@/lib/auth-config";
import { fetchNhPlugPreview } from "@/lib/nhplug-client";
import { buildNhPlugSyncPreview, type NhPlugDashboardAsset } from "@/lib/nhplug-sync-preview";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    if (!isDashboardOwner(user.id)) {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }

    const [preview, assetsResult] = await Promise.all([
      fetchNhPlugPreview(),
      supabase
        .from("assets")
        .select("id, code, name, quantity, avg_price")
        .eq("user_id", user.id)
        .eq("is_cash", false)
        .neq("asset_type", "암호화폐"),
    ]);
    if (assetsResult.error) throw new Error(`대시보드 자산 조회 실패: ${assetsResult.error.message}`);

    return NextResponse.json({
      ...preview,
      sync: buildNhPlugSyncPreview(preview, (assetsResult.data ?? []) as NhPlugDashboardAsset[]),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "NH 계좌 연결 확인에 실패했습니다.";
    const missingConfiguration = message.includes("NHPLUG_APP_KEY");
    return NextResponse.json(
      { error: message },
      { status: missingConfiguration ? 503 : 500 }
    );
  }
}
