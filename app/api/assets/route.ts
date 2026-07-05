import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { AccountGroup, AssetCategory, AssetGroup, AssetItem, AssetSummary } from "@/lib/types";

export const revalidate = 0;

interface AssetRow {
  id: number;
  asset_type: string;
  account_name?: string | null;
  code?: string | null;
  name: string;
  quantity: number;
  avg_price: number;
}

interface CashRow {
  account_name?: string | null;
  amount?: number | null;
}

interface PriceRow {
  code?: string | null;
  price?: number | null;
}

function toAssetCategory(assetType: string): AssetCategory {
  if (assetType === "개별주식" || assetType === "개인연금" || assetType === "IRP") {
    return assetType;
  }
  return "개인연금";
}

async function buildAssetSummaryFromSupabase(userId: string): Promise<AssetSummary> {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("*")
    .eq("is_cash", false)
    .eq("user_id", userId)
    .neq("asset_type", "암호화폐");

  const { data: cashData } = await supabase
    .from("cash")
    .select("*")
    .eq("user_id", userId);

  if (error) throw error;

  // 계좌별 현금 매핑 (괄호 무시)
  const normalizeAccountName = (name: string) => name.replace(/\([^)]*\)/g, "").trim();

  const cashByAccount: Record<string, number> = {};
  let totalCash = 0;
  ((cashData || []) as CashRow[]).forEach((record) => {
    const amount = record.amount || 0;
    const accountName = normalizeAccountName(record.account_name || "");
    totalCash += amount;
    if (accountName) {
      cashByAccount[accountName] = (cashByAccount[accountName] || 0) + amount;
    }
  });

  const assetRows = (assets || []) as AssetRow[];
  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));

  const { data: pricesData } = await supabase
    .from("prices")
    .select("code, price");

  const prices: Record<string, number> = {};
  ((pricesData || []) as PriceRow[]).forEach((p) => {
    if (p.code && typeof p.price === "number") {
      prices[p.code] = p.price;
    }
  });

  // 자산유형별로 그룹화
  const groups: Partial<Record<AssetCategory, AssetGroup>> = {};

  assetRows.forEach((asset) => {
    let category = toAssetCategory(asset.asset_type);
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
      } satisfies AssetGroup;
    }

    const currentPrice = prices[asset.code ?? ""] ?? asset.avg_price;
    const investAmount = asset.quantity * asset.avg_price;
    const currentValue = asset.quantity * currentPrice;
    const profitLoss = currentValue - investAmount;

    const group = groups[category];
    if (!group) return;

    group.items.push({
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

    group.totalInvest += investAmount;
    group.totalValue += currentValue;
  });

  // 계좌별로 그룹화
  Object.values(groups).forEach((group) => {
    if (!group) return;
    const accountMap: Record<string, AccountGroup> = {};

    group.items.forEach((item) => {
      const rawAccountName = assetById.get(item.id ?? 0)?.account_name || "Unknown";
      const accountName = normalizeAccountName(rawAccountName);

      if (!accountMap[accountName]) {
        accountMap[accountName] = {
          name: accountName,
          totalInvest: 0,
          totalValue: 0,
          cash: cashByAccount[accountName] || 0,
          totalProfitLoss: 0,
          returnRate: 0,
          items: [],
          insertRowIndex: 0,
        };
      }

      accountMap[accountName].items.push(item);
      accountMap[accountName].totalInvest += item.investAmount;
      accountMap[accountName].totalValue += item.currentValue;
      accountMap[accountName].totalProfitLoss += item.profitLoss;
    });

    group.accounts = Object.values(accountMap).map((acc) => ({
      ...acc,
      returnRate: acc.totalInvest > 0 ? (acc.totalProfitLoss / acc.totalInvest) * 100 : 0,
      totalValue: acc.totalValue + acc.cash,
    }));

    // 카테고리의 현금 합계 계산
    group.cash = group.accounts.reduce((s, acc) => s + (acc.cash || 0), 0);
    group.totalValue += group.cash;

    group.totalProfitLoss = group.totalValue - group.totalInvest;
    group.returnRate = group.totalInvest > 0 ? (group.totalProfitLoss / group.totalInvest) * 100 : 0;
  });

  const groupArray = Object.values(groups).filter((group): group is AssetGroup => Boolean(group));
  const totalInvest = groupArray.reduce((sum, g) => sum + g.totalInvest, 0);
  const groupedCash = groupArray.reduce((sum, g) => sum + g.cash, 0);
  const ungroupedCash = Math.max(totalCash - groupedCash, 0);
  const totalValue = groupArray.reduce((sum, g) => sum + g.totalValue, 0) + ungroupedCash;
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
    const supabaseServer = await createSupabaseServer();
    const { data: { session } } = await supabaseServer.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await buildAssetSummaryFromSupabase(session.user.id);

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
