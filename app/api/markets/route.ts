import { NextResponse } from "next/server";
import { isDashboardOwner } from "@/lib/auth-config";
import { collectMarketOverview } from "@/lib/market-data";
import { readMarketSnapshot, saveMarketSnapshot } from "@/lib/market-snapshot";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { MarketOverviewResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user && isDashboardOwner(user.id) ? user.id : null;
}

async function collectAndPersistMarketOverview(userId: string): Promise<MarketOverviewResponse> {
  const liveOverview = await collectMarketOverview();
  try {
    return await saveMarketSnapshot(userId, liveOverview);
  } catch {
    return {
      ...liveOverview,
      delivery: { mode: "live" as const, storedAt: liveOverview.updatedAt },
    };
  }
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    let snapshot: MarketOverviewResponse | null = null;
    try {
      snapshot = await readMarketSnapshot(userId);
    } catch {
      snapshot = null;
    }
    const overview = snapshot ?? await collectAndPersistMarketOverview(userId);
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
    const overview = await collectAndPersistMarketOverview(userId);
    return NextResponse.json(overview);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시장 시세 갱신에 실패했습니다." },
      { status: 500 }
    );
  }
}
