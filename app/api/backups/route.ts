import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getRequiredSupabaseAdminClient } from "@/lib/supabase-admin";
import { createPortfolioBackup, restorePortfolioBackup } from "@/lib/portfolio-backup";

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabaseServer = await createSupabaseServer();
  const { data: { user } } = await supabaseServer.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    const supabase = getRequiredSupabaseAdminClient();
    const downloadId = Number(request.nextUrl.searchParams.get("download"));

    if (Number.isInteger(downloadId) && downloadId > 0) {
      const { data, error } = await supabase
        .from("portfolio_backups")
        .select("id, payload, created_at")
        .eq("user_id", userId)
        .eq("id", downloadId)
        .single();
      if (error) throw error;
      return new NextResponse(JSON.stringify(data.payload, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="wealth-backup-${data.created_at.slice(0, 10)}.json"`,
        },
      });
    }

    const { data, error } = await supabase
      .from("portfolio_backups")
      .select("id, kind, byte_size, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return NextResponse.json({ backups: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "백업을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    const backup = await createPortfolioBackup(getRequiredSupabaseAdminClient(), userId, "manual");
    return NextResponse.json({ ok: true, backup });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "백업 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    const body = await request.json() as { backupId?: number; confirmation?: string };
    const backupId = Number(body.backupId);
    if (!Number.isInteger(backupId) || backupId <= 0 || body.confirmation !== "복구") {
      return NextResponse.json({ error: "복구 확인 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const supabase = getRequiredSupabaseAdminClient();
    const { data, error } = await supabase
      .from("portfolio_backups")
      .select("payload")
      .eq("user_id", userId)
      .eq("id", backupId)
      .single();
    if (error) throw error;

    await createPortfolioBackup(supabase, userId, "pre_restore");
    const restored = await restorePortfolioBackup(supabase, userId, data.payload);
    return NextResponse.json({ ok: true, restored });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "백업 복구에 실패했습니다." },
      { status: 500 }
    );
  }
}
