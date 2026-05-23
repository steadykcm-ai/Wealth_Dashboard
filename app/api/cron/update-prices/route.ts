import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchStockPrices } from "@/lib/price-fetcher";

export const revalidate = 0;

async function updatePricesCache() {
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("code, name")
    .eq("is_cash", false);

  if (assetsError) throw assetsError;

  const codes = (assets || [])
    .map((a) => a.code)
    .filter((c) => c && typeof c === "string");

  if (codes.length === 0) {
    return { message: "No codes to update", updated: 0 };
  }

  const prices = await fetchStockPrices(codes);

  const cias = (assets || []).find((a) => a.name === "씨아이에스");
  const ciasPrice = cias ? prices[cias.code] : undefined;

  const debugInfo = {
    cias_code: cias?.code,
    cias_in_prices: ciasPrice,
    total_codes: codes.length,
    fetched_codes: Object.keys(prices).length,
  };

  const priceRecords = Object.entries(prices).map(([code, price]) => ({
    code,
    price,
    updated_at: new Date().toISOString(),
  }));

  if (priceRecords.length === 0) {
    return { message: "No prices fetched", updated: 0 };
  }

  const { error: upsertError, data } = await supabase
    .from("prices")
    .upsert(priceRecords, { onConflict: "code" });

  if (upsertError) throw upsertError;

  return {
    message: `Updated ${priceRecords.length} prices`,
    updated: priceRecords.length,
    debug: debugInfo,
  };
}

export async function GET() {
  try {
    const result = await updatePricesCache();
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
