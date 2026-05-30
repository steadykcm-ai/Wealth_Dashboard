import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST() {
  try {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();

    const response = NextResponse.json({ ok: true });

    // 모든 Supabase 관련 쿠키 제거
    response.cookies.set("sb-yobchugjndnnkwogocsd-auth-token", "", { maxAge: 0 });
    response.cookies.set("sb-access-token", "", { maxAge: 0 });
    response.cookies.set("sb-refresh-token", "", { maxAge: 0 });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "로그아웃 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
