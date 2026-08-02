import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isDashboardOwner } from "@/lib/auth-config";
import YahooFinance from "yahoo-finance2";

export const revalidate = 0;

const yahooFinance = new YahooFinance();

async function validateCode(code: string): Promise<{ valid: boolean; price?: number; error?: string }> {
  if (!code) return { valid: false, error: "empty" };

  try {
    const quote = await yahooFinance.quote(code);
    const price = quote.regularMarketPrice;
    if (typeof price === "number" && price > 0) {
      return { valid: true, price };
    }
    return { valid: false, error: "invalid_price" };
  } catch {
    return { valid: false, error: "fetch_failed" };
  }
}

export async function GET() {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user || !isDashboardOwner(user.id)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { data: assets, error } = await supabaseServer
      .from("assets")
      .select("id, name, code, avg_price")
      .eq("is_cash", false)
      .eq("user_id", user.id)
      .order("name");

    if (error) throw error;

    const results = [];
    const issues = [];

    for (const asset of assets || []) {
      const validation = await validateCode(asset.code);

      results.push({
        id: asset.id,
        name: asset.name,
        code: asset.code,
        valid: validation.valid,
        price: validation.price,
        error: validation.error,
      });

      if (!validation.valid) {
        issues.push({
          name: asset.name,
          code: asset.code,
          reason: validation.error,
        });
      }
    }

    const summary = {
      total: results.length,
      valid: results.filter((r) => r.valid).length,
      invalid: results.filter((r) => !r.valid).length,
    };

    return NextResponse.json({
      summary,
      issues,
      details: results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
