import { NextResponse } from "next/server";
import { fetchUpbitPrices } from "@/lib/upbit";
import { fetchUpbitData } from "@/lib/upbit-private";
import { fetchBithumbData } from "@/lib/bithumb-private";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { AssetItem, ExchangeGroup, CryptoApiResponse } from "@/lib/types";

export const revalidate = 0;

async function buildExchange(exchangeName: string, holdings: { currency: string; balance: number; avgPrice: number }[], krwBalance: number, upbitPrices: Record<string, number>): Promise<ExchangeGroup> {
  const exchange: ExchangeGroup = {
    exchange: exchangeName,
    items: [],
    cash: krwBalance,
    totalInvest: 0,
    totalValue: 0,
    totalProfitLoss: 0,
    returnRate: 0,
  };

  holdings.forEach((holding) => {
    const currentPrice = upbitPrices[holding.currency] || 0;
    const investAmount = holding.balance * holding.avgPrice;
    const currentValue = holding.balance * currentPrice;
    const profitLoss = currentValue - investAmount;

    const item: AssetItem = {
      name: holding.currency,
      quantity: holding.balance,
      avgPrice: holding.avgPrice,
      currentPrice,
      investAmount,
      currentValue,
      profitLoss,
      returnRate: investAmount > 0 ? (profitLoss / investAmount) * 100 : 0,
    };

    exchange.items.push(item);
    exchange.totalInvest += investAmount;
    exchange.totalValue += currentValue;
    exchange.totalProfitLoss += profitLoss;
  });

  exchange.returnRate = exchange.totalInvest > 0 ? (exchange.totalProfitLoss / exchange.totalInvest) * 100 : 0;
  return exchange;
}

export async function GET() {
  try {
    const supabaseServer = createSupabaseServer();
    const { data: { session } } = await supabaseServer.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 모든 거래소 데이터 병렬 조회
    const [bithumbData, upbitData] = await Promise.all([
      fetchBithumbData().catch(() => ({ holdings: [], krwBalance: 0 })),
      fetchUpbitData().catch(() => ({ holdings: [], krwBalance: 0 })),
    ]);

    // 모든 티커 수집해서 현재가 한번에 조회
    const allTickers = [
      ...bithumbData.holdings.map((h) => h.currency),
      ...upbitData.holdings.map((h) => h.currency),
    ];
    const upbitPrices = await fetchUpbitPrices([...new Set(allTickers)]);

    // 각 거래소별 그룹화
    const exchanges: ExchangeGroup[] = [];

    if (bithumbData.holdings.length > 0) {
      const bithumbExchange = await buildExchange("Bithumb", bithumbData.holdings, bithumbData.krwBalance, upbitPrices);
      exchanges.push(bithumbExchange);
    }

    if (upbitData.holdings.length > 0) {
      const upbitExchange = await buildExchange("Upbit", upbitData.holdings, upbitData.krwBalance, upbitPrices);
      exchanges.push(upbitExchange);
    }

    // 전체 합계
    const totalInvest = exchanges.reduce((sum, ex) => sum + ex.totalInvest, 0);
    const totalCash = bithumbData.krwBalance + upbitData.krwBalance;
    const totalValue = exchanges.reduce((sum, ex) => sum + ex.totalValue, 0) + totalCash;
    const totalProfitLoss = totalValue - totalInvest;

    const response: CryptoApiResponse = {
      exchanges,
      totalInvest,
      totalValue,
      totalProfitLoss,
      returnRate: totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
