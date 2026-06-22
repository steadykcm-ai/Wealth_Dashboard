import { supabase } from "@/lib/supabase";
import { fetchStockPrices } from "@/lib/price-fetcher";

interface CategorySummary {
  invest: number;
  value: number;
  profit: number;
}

interface DailyLogData {
  date: string;
  stocks_invest: number;
  stocks_value: number;
  stocks_profit: number;
  pension_invest: number;
  pension_value: number;
  pension_profit: number;
  crypto_invest: number;
  crypto_value: number;
  crypto_profit: number;
  total_cash: number;
}

interface PriceRow {
  code?: string | null;
  price?: number | null;
}

interface AssetCodeRow {
  code?: string | null;
}

async function fetchLivePrices(userId: string): Promise<Record<string, number>> {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("code")
    .eq("is_cash", false)
    .eq("user_id", userId)
    .neq("asset_type", "암호화폐");

  if (error || !assets) return {};

  const codes = Array.from(
    new Set(
      (assets as AssetCodeRow[])
        .map((asset) => asset.code)
        .filter((code): code is string => Boolean(code))
    )
  );

  const prices = await fetchStockPrices(codes);
  const priceRecords = Object.entries(prices).map(([code, price]) => ({
    code,
    price,
    updated_at: new Date().toISOString(),
  }));

  if (priceRecords.length > 0) {
    await supabase.from("prices").upsert(priceRecords, { onConflict: "code" });
  }

  return prices;
}

async function fetchCachedPrices(): Promise<Record<string, number>> {
  const { data: priceRows, error } = await supabase
    .from("prices")
    .select("code, price");

  if (error || !priceRows) return {};

  const prices: Record<string, number> = {};
  (priceRows as PriceRow[]).forEach((row) => {
    if (row.code && typeof row.price === "number" && row.price > 0) {
      prices[row.code] = row.price;
    }
  });

  return prices;
}

async function calculateCategory(
  assetType: string,
  prices: Record<string, number>,
  userId: string
): Promise<CategorySummary> {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("*")
    .eq("asset_type", assetType)
    .eq("is_cash", false)
    .eq("user_id", userId);

  if (error || !assets) {
    return { invest: 0, value: 0, profit: 0 };
  }

  let invest = 0;
  let value = 0;

  assets.forEach((item) => {
    const itemInvest = item.quantity * item.avg_price;
    const currentPrice = prices[item.code] || item.avg_price;
    const itemValue = item.quantity * currentPrice;

    invest += itemInvest;
    value += itemValue;
  });

  return {
    invest,
    value,
    profit: value - invest,
  };
}

async function calculateCash(userId: string): Promise<number> {
  const { data: cashRecords, error } = await supabase
    .from("cash")
    .select("amount")
    .eq("user_id", userId);

  if (error || !cashRecords) return 0;

  return cashRecords.reduce((sum, record) => sum + (record.amount || 0), 0);
}

export async function calculateDailyLog(userId: string): Promise<DailyLogData> {
  const livePrices = await fetchLivePrices(userId);
  const cachedPrices = await fetchCachedPrices();
  const prices = { ...cachedPrices, ...livePrices };

  // 카테고리별 계산
  const stocks = await calculateCategory("개별주식", prices, userId);
  const pension = await calculateCategory("개인연금", prices, userId);
  const totalCash = await calculateCash(userId);

  const today = new Date().toISOString().split("T")[0];

  return {
    date: today,
    stocks_invest: stocks.invest,
    stocks_value: stocks.value,
    stocks_profit: stocks.profit,
    pension_invest: pension.invest,
    pension_value: pension.value,
    pension_profit: pension.profit,
    crypto_invest: 0,
    crypto_value: 0,
    crypto_profit: 0,
    total_cash: totalCash,
  };
}

export async function saveDailyLog(userId: string): Promise<boolean> {
  try {
    const dailyData = await calculateDailyLog(userId);

    const dataToSave = { ...dailyData, user_id: userId };

    const { error } = await supabase
      .from("daily_log")
      .upsert([dataToSave]);

    if (error) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
