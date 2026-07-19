import { NextRequest, NextResponse } from "next/server";
import { fetchStockPrices } from "@/lib/price-fetcher";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getRequiredSupabaseAdminClient } from "@/lib/supabase-admin";
import { isValidCronRequest } from "@/lib/cron-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

export const revalidate = 0;

async function updatePricesCache(supabase: SupabaseClient, userId: string | null) {
  let assetsQuery = supabase
    .from("assets")
    .select("code, name")
    .eq("is_cash", false);
  if (userId) assetsQuery = assetsQuery.eq("user_id", userId);

  const { data: assets, error: assetsError } = await assetsQuery;

  if (assetsError) throw assetsError;

  const codes = Array.from(new Set(
    (assets || [])
      .map((asset) => asset.code)
      .filter((code): code is string => typeof code === "string" && code.length > 0)
  ));

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

export async function GET(req: NextRequest) {
  try {
    const cronAuthorized = isValidCronRequest(req);
    let userId: string | null = null;

    if (!cronAuthorized) {
      const supabaseServer = await createSupabaseServer();
      const { data: { user } } = await supabaseServer.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;
    }

    const admin = getRequiredSupabaseAdminClient();
    const result = await updatePricesCache(admin, userId);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
