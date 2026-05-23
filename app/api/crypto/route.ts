import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchUpbitPrices } from "@/lib/upbit";
import { fetchBithumbData } from "@/lib/bithumb-private";
import type { AssetItem, ExchangeGroup, CryptoApiResponse, CryptoAssetRow } from "@/lib/types";

export const revalidate = 0;

export async function GET() {
  try {
    // Supabase에서 암호화폐 자산 조회
    const { data: cryptoAssets, error } = await supabase
      .from("crypto_assets")
      .select("*")
      .eq("is_cash", false);

    if (error) throw error;

    // 현재가 조회 (Upbit API)
    const tickers = (cryptoAssets || [])
      .map((asset) => asset.ticker)
      .filter((ticker) => ticker && ticker !== "CASH");

    const upbitPrices: Record<string, number> = await fetchUpbitPrices(tickers).catch(() => ({}));

    // Bithumb 현재가도 조회
    const bithumbData = await fetchBithumbData().catch(() => ({ holdings: [], krwBalance: 0 }));
    const bithumbPrices: Record<string, number> = {};
    bithumbData.holdings.forEach((holding) => {
      bithumbPrices[holding.currency] = holding.currentPrice;
    });

    // 환전소별로 그룹화
    const exchangeMap: Record<string, ExchangeGroup> = {};

    (cryptoAssets || []).forEach((asset: CryptoAssetRow) => {
      const exchange = asset.exchange;

      if (!exchangeMap[exchange]) {
        exchangeMap[exchange] = {
          exchange,
          items: [],
          cash: 0,
          totalInvest: 0,
          totalValue: 0,
          totalProfitLoss: 0,
          returnRate: 0,
        };
      }

      const currentPrice = upbitPrices[asset.ticker] || bithumbPrices[asset.ticker] || asset.avg_price;
      const investAmount = asset.quantity * asset.avg_price;
      const currentValue = asset.quantity * currentPrice;
      const profitLoss = currentValue - investAmount;

      const item: AssetItem = {
        name: asset.name,
        quantity: asset.quantity,
        avgPrice: asset.avg_price,
        currentPrice,
        investAmount,
        currentValue,
        profitLoss,
        returnRate: investAmount > 0 ? (profitLoss / investAmount) * 100 : 0,
      };

      exchangeMap[exchange].items.push(item);
      exchangeMap[exchange].totalInvest += investAmount;
      exchangeMap[exchange].totalValue += currentValue;
      exchangeMap[exchange].totalProfitLoss += profitLoss;
    });

    // 환전소별 합계 계산
    const exchanges = Object.values(exchangeMap).map((ex) => ({
      ...ex,
      returnRate: ex.totalInvest > 0 ? (ex.totalProfitLoss / ex.totalInvest) * 100 : 0,
    }));

    // 전체 합계
    const totalInvest = exchanges.reduce((sum, ex) => sum + ex.totalInvest, 0);
    const totalValue = exchanges.reduce((sum, ex) => sum + ex.totalValue, 0);
    const totalProfitLoss = totalValue - totalInvest;
    const totalCash = bithumbData.krwBalance;

    const response: CryptoApiResponse = {
      exchanges,
      totalInvest,
      totalValue: totalValue + totalCash,
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
