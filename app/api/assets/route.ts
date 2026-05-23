import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchStockPrices } from "@/lib/price-fetcher";
import type { AssetSummary } from "@/lib/types";

export const revalidate = 0;

async function buildAssetSummaryFromSupabase(): Promise<AssetSummary> {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("*")
    .eq("is_cash", false);

  const { data: cashData } = await supabase.from("cash").select("amount");

  if (error) throw error;

  const totalCash = (cashData || []).reduce((sum, record) => sum + (record.amount || 0), 0);

  const codes = (assets || []).map((a) => a.code).filter((c) => c);
  const prices = await fetchStockPrices(codes);

  // 자산유형별로 그룹화
  const groups: Record<string, any> = {};

  (assets || []).forEach((asset) => {
    let category = asset.asset_type;
    if (category === "IRP") category = "개인연금";

    if (!groups[category]) {
      groups[category] = {
        category,
        items: [],
        totalInvest: 0,
        totalValue: 0,
        cash: 0,
        totalProfitLoss: 0,
        returnRate: 0,
        accounts: [],
      };
    }

    const currentPrice = prices[asset.code] ?? asset.avg_price;
    const investAmount = asset.quantity * asset.avg_price;
    const currentValue = asset.quantity * currentPrice;
    const profitLoss = currentValue - investAmount;

    groups[category].items.push({
      id: asset.id,
      name: asset.name,
      quantity: asset.quantity,
      avgPrice: asset.avg_price,
      currentPrice,
      investAmount,
      currentValue,
      profitLoss,
      returnRate: investAmount > 0 ? (profitLoss / investAmount) * 100 : 0,
    });

    groups[category].totalInvest += investAmount;
    groups[category].totalValue += currentValue;
  });

  // 계좌별로 그룹화
  Object.values(groups).forEach((group: any) => {
    const accountMap: Record<string, any> = {};

    group.items.forEach((item: any) => {
      const accountName = (assets || []).find((a) => a.name === item.name)?.account_name || "Unknown";

      if (!accountMap[accountName]) {
        accountMap[accountName] = {
          name: accountName,
          totalInvest: 0,
          totalValue: 0,
          cash: 0,
          totalProfitLoss: 0,
          returnRate: 0,
          items: [],
        };
      }

      accountMap[accountName].items.push(item);
      accountMap[accountName].totalInvest += item.investAmount;
      accountMap[accountName].totalValue += item.currentValue;
      accountMap[accountName].totalProfitLoss += item.profitLoss;
    });

    group.accounts = Object.values(accountMap).map((acc: any) => ({
      ...acc,
      returnRate: acc.totalInvest > 0 ? (acc.totalProfitLoss / acc.totalInvest) * 100 : 0,
    }));

    group.totalProfitLoss = group.totalValue - group.totalInvest;
    group.returnRate = group.totalInvest > 0 ? (group.totalProfitLoss / group.totalInvest) * 100 : 0;
    group.totalValue += totalCash; // 현금 추가
  });

  const groupArray = Object.values(groups);
  const totalInvest = groupArray.reduce((sum, g: any) => sum + g.totalInvest, 0);
  const totalValue = groupArray.reduce((sum, g: any) => sum + g.totalValue, 0) + totalCash;
  const totalProfitLoss = totalValue - totalInvest;

  return {
    totalInvest,
    totalValue,
    totalProfitLoss,
    returnRate: totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0,
    groups: groupArray,
  };
}

export async function GET() {
  try {
    const summary = await buildAssetSummaryFromSupabase();

    const response = {
      summary,
      breakdown: { region: [], assetType: [] },
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
