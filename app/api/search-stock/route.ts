import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { createSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 0;

const yahooFinance = new YahooFinance();

async function searchAndValidate(
  name: string
): Promise<Array<{ code: string; price: number; market: string }>> {
  const results: Array<{ code: string; price: number; market: string }> = [];

  // 6자리 숫자로 추정되는 코드 추출
  const codeMatch = name.match(/(\d{6})/);
  if (!codeMatch) {
    return results;
  }

  const baseCode = codeMatch[1];
  const markets = [".KS", ".KQ"];

  for (const market of markets) {
    const code = `${baseCode}${market}`;
    try {
      const quote = await yahooFinance.quote(code);
      if (quote.regularMarketPrice && quote.regularMarketPrice > 0) {
        results.push({
          code,
          price: quote.regularMarketPrice,
          market: market === ".KS" ? "KOSPI" : "KOSDAQ",
        });
      }
    } catch (err) {
      // Skip if code doesn't exist
    }
  }

  return results;
}

export async function GET(request: Request) {
  try {
    const supabaseServer = createSupabaseServer();
    const { data: { session } } = await supabaseServer.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { error: "query parameter required" },
        { status: 400 }
      );
    }

    const results = await searchAndValidate(query);

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No valid codes found", query },
        { status: 404 }
      );
    }

    return NextResponse.json({
      query,
      results,
      message: results.length === 1
        ? "유일한 코드 찾음"
        : "여러 시장에서 발견됨 - 가격을 비교하고 선택하세요",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
