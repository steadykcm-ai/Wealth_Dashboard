import { NextResponse } from "next/server";
import { isDashboardOwner } from "@/lib/auth-config";
import { collectMarketOverview } from "@/lib/market-data";
import { readMarketSnapshot, saveMarketSnapshot } from "@/lib/market-snapshot";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user && isDashboardOwner(user.id) ? user.id : null;
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const snapshot = await readMarketSnapshot(userId);
    const overview = snapshot ?? await saveMarketSnapshot(userId, await collectMarketOverview());
    return NextResponse.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시장 시세를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const overview = await saveMarketSnapshot(userId, await collectMarketOverview());
    return NextResponse.json(overview);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시장 시세 갱신에 실패했습니다." },
      { status: 500 }
    );
  }
}
