import { NextRequest, NextResponse } from "next/server";
import { fetchKISQuote } from "@/lib/kis-client";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isDashboardOwner } from "@/lib/auth-config";

export const runtime = "nodejs";
export const revalidate = 0;

interface MarketTodayRequest {
  codes?: unknown;
}

interface MarketTodayItem {
  code: string;
  price: number;
  changeAmount: number;
  changeRate: number;
}

function normalizeDomesticCode(code: string): string | null {
  const match = code.match(/\d{6}/);
  return match ? match[0] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    if (!isDashboardOwner(user.id)) return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });

    const body = (await req.json()) as MarketTodayRequest;
    const codes = Array.isArray(body.codes)
      ? body.codes.filter((code): code is string => typeof code === "string" && code.length > 0)
      : [];
    const uniqueCodes = Array.from(new Set(codes)).slice(0, 60);

    const quotes: Record<string, MarketTodayItem> = {};

    for (const code of uniqueCodes) {
      const domesticCode = normalizeDomesticCode(code);
      if (!domesticCode) continue;

      const quote = await fetchKISQuote(domesticCode);
      if (quote) {
        quotes[code] = {
          code,
          price: quote.price,
          changeAmount: quote.changeAmount,
          changeRate: quote.changeRate,
        };
      }

      await sleep(150);
    }

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      quotes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "오늘 등락률 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
