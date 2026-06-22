import { supabase } from "@/lib/supabase";

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
  // 카테고리별 계산
  const stocks = await calculateCategory("개별주식", {}, userId);
  const pension = await calculateCategory("개인연금", {}, userId);
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
