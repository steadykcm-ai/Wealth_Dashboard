import { supabase } from "@/lib/supabase";
import { fetchUpbitPrices } from "@/lib/upbit";
import { fetchBithumbData } from "@/lib/bithumb-private";
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

async function calculateCategory(
  assetType: string,
  prices: Record<string, number>
): Promise<CategorySummary> {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("*")
    .eq("asset_type", assetType)
    .eq("is_cash", false);

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

async function calculateCash(): Promise<number> {
  const { data: cashRecords, error } = await supabase
    .from("cash")
    .select("amount");

  if (error || !cashRecords) return 0;

  return cashRecords.reduce((sum, record) => sum + (record.amount || 0), 0);
}

async function calculateCrypto(prices: Record<string, number>): Promise<CategorySummary> {
  const { data: cryptoAssets, error } = await supabase
    .from("crypto_assets")
    .select("*")
    .eq("is_cash", false);

  if (error || !cryptoAssets) {
    return { invest: 0, value: 0, profit: 0 };
  }

  let invest = 0;
  let value = 0;

  cryptoAssets.forEach((item) => {
    const itemInvest = item.quantity * item.avg_price;
    const currentPrice = prices[item.ticker] || item.avg_price;
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

export async function calculateDailyLog(): Promise<DailyLogData> {
  // 현재가 조회
  const upbitPrices = await fetchUpbitPrices(["BTC", "ETH"]).catch(() => ({}));
  const bithumbData = await fetchBithumbData().catch(() => ({ holdings: [] }));

  const cryptoPrices: Record<string, number> = {
    ...upbitPrices,
  };

  bithumbData.holdings.forEach((holding) => {
    cryptoPrices[holding.currency] = holding.currentPrice;
  });

  // 카테고리별 계산
  const stocks = await calculateCategory("개별주식", {});
  const pension = await calculateCategory("개인연금", {});
  const crypto = await calculateCrypto(cryptoPrices);
  const totalCash = await calculateCash();

  const today = new Date().toISOString().split("T")[0];

  return {
    date: today,
    stocks_invest: stocks.invest,
    stocks_value: stocks.value,
    stocks_profit: stocks.profit,
    pension_invest: pension.invest,
    pension_value: pension.value,
    pension_profit: pension.profit,
    crypto_invest: crypto.invest,
    crypto_value: crypto.value,
    crypto_profit: crypto.profit,
    total_cash: totalCash,
  };
}

export async function saveDailyLog(): Promise<boolean> {
  try {
    const dailyData = await calculateDailyLog();

    const { error } = await supabase
      .from("daily_log")
      .upsert([dailyData], { onConflict: "date" });

    if (error) {
      console.error("Daily log 저장 실패:", error.message);
      return false;
    }

    console.log(`✅ Daily log 저장 완료: ${dailyData.date}`);
    return true;
  } catch (error) {
    console.error("Daily log 계산 실패:", error);
    return false;
  }
}
