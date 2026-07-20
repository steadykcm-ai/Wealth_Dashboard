import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabaseServer = await createSupabaseServer();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json(
    { error: "이 라우트는 더 이상 사용되지 않습니다. /api/assets와 /api/crypto를 사용하세요." },
    { status: 410 }
  );
}
