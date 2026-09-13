import { NextResponse } from "next/server";
import { isDashboardOwner } from "@/lib/auth-config";
import { fetchNhPlugPreview } from "@/lib/nhplug-client";
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

    const preview = await fetchNhPlugPreview();
    return NextResponse.json(preview, {
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
