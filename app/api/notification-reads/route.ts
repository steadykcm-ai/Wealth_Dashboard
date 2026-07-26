import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const { data, error } = await supabase
      .from("notification_reads")
      .select("notification_key")
      .eq("user_id", user.id)
      .order("read_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ keys: (data ?? []).map((row) => row.notification_key) });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알림 확인 기록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    const body = await request.json() as { keys?: string[] };
    const keys = Array.from(new Set((body.keys ?? []).map((key) => key.trim()).filter(Boolean)));
    if (keys.length === 0 || keys.length > 100 || keys.some((key) => key.length > 200)) {
      return NextResponse.json({ error: "알림 확인 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const readAt = new Date().toISOString();
    const { error } = await supabase.from("notification_reads").upsert(
      keys.map((key) => ({ user_id: user.id, notification_key: key, read_at: readAt })),
      { onConflict: "user_id,notification_key" }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true, keys });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알림 확인 처리에 실패했습니다." },
      { status: 500 }
    );
  }
}
