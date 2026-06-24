import { supabase } from "@/lib/supabase";
import { fetchKISDailyClose } from "@/lib/kis-client";

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

interface AssetRow {
  code?: string | null;
  quantity?: number | null;
  avg_price?: number | null;
}

interface CashRow {
  amount?: number | null;
}

function getKoreaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeDomesticCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const match = code.match(/\d{6}/);
  return match ? match[0] : null;
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

async function fetchClosingPrices(
  userId: string,
  date: string
): Promise<Record<string, number>> {
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

  const entries = await Promise.all(
    codes.map(async (code) => {
      const domesticCode = normalizeDomesticCode(code);
      if (!domesticCode) return null;

      const close = await fetchKISDailyClose(domesticCode, date);
      return close ? ([code, close] as const) : null;
    })
  );

  const prices: Record<string, number> = {};
  entries.forEach((entry) => {
    if (entry) {
      const [code, price] = entry;
      prices[code] = price;
    }
  });

  return prices;
}

async function calculateCategory(
  assetTypes: string[],
  prices: Record<string, number>,
  userId: string
): Promise<CategorySummary> {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("code, quantity, avg_price")
    .in("asset_type", assetTypes)
    .eq("is_cash", false)
    .eq("user_id", userId);

  if (error || !assets) {
    return { invest: 0, value: 0, profit: 0 };
  }

  let invest = 0;
  let value = 0;

  (assets as AssetRow[]).forEach((item) => {
    const quantity = Number(item.quantity || 0);
    const avgPrice = Number(item.avg_price || 0);
    const currentPrice = item.code ? prices[item.code] || avgPrice : avgPrice;

    invest += quantity * avgPrice;
    value += quantity * currentPrice;
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

  return (cashRecords as CashRow[]).reduce(
    (sum, record) => sum + Number(record.amount || 0),
    0
  );
}

export async function calculateDailyLog(userId: string): Promise<DailyLogData> {
  const today = getKoreaDateString();
  const closingPrices = await fetchClosingPrices(userId, today);
  const cachedPrices = await fetchCachedPrices();
  const prices = { ...cachedPrices, ...closingPrices };

  const stocks = await calculateCategory(["개별주식"], prices, userId);
  const pension = await calculateCategory(["개인연금", "IRP"], prices, userId);
  const totalCash = await calculateCash(userId);

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

    const { data: updatedRows, error: updateError } = await supabase
      .from("daily_log")
      .update(dataToSave)
      .eq("date", dailyData.date)
      .eq("user_id", userId)
      .select("date");

    if (updateError) return false;

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertError } = await supabase
        .from("daily_log")
        .insert(dataToSave);

      if (insertError) return false;
    }

    return true;
  } catch {
    return false;
  }
}
