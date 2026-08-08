import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { collectMarketOverview } from "@/lib/market-data";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const getCachedMarketOverview = unstable_cache(
  collectMarketOverview,
  ["market-overview-v1"],
  { revalidate: 300, tags: ["market-overview"] }
);

async function isAuthenticated(): Promise<boolean> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return Boolean(user);
}

export async function GET() {
  try {
    if (!await isAuthenticated()) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const overview = await getCachedMarketOverview();
    return NextResponse.json(overview, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
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
    if (!await isAuthenticated()) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    revalidateTag("market-overview");
    const overview = await getCachedMarketOverview();
    return NextResponse.json(overview);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시장 시세 갱신에 실패했습니다." },
      { status: 500 }
    );
  }
}
