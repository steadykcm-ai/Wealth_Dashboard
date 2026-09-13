import type {
  NhPlugHoldingPreview,
  NhPlugPreviewResponse,
  NhPlugSyncCandidate,
  NhPlugSyncPreview,
  NhPlugSyncStatus,
} from "@/lib/nhplug-types";

export interface NhPlugDashboardAsset {
  id: number;
  code?: string | null;
  name: string;
  quantity: number;
  avg_price: number;
}

interface HoldingAggregate {
  accountLabels: string[];
  code: string;
  name: string;
  market: "domestic" | "us";
  quantity: number;
  averagePriceTotal: number;
}

interface AssetAggregate {
  quantity: number;
  averagePriceTotal: number;
}

export function normalizeNhPlugCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/\.(KS|KQ|US)$/i, "");
  return normalized.replace(/[^A-Z0-9]/g, "");
}

function roundedAveragePrice(total: number, quantity: number): number {
  return quantity > 0 ? total / quantity : 0;
}

function getStatus(
  holding: HoldingAggregate,
  dashboard: AssetAggregate | undefined
): NhPlugSyncStatus {
  if (!holding.code) return "invalid";
  if (!dashboard) return "new";
  if (holding.quantity !== dashboard.quantity) return "quantity_mismatch";

  const nhAveragePrice = roundedAveragePrice(holding.averagePriceTotal, holding.quantity);
  const dashboardAveragePrice = roundedAveragePrice(dashboard.averagePriceTotal, dashboard.quantity);
  return Math.abs(nhAveragePrice - dashboardAveragePrice) > 1
    ? "average_price_mismatch"
    : "matched";
}

export function buildNhPlugSyncPreview(
  preview: NhPlugPreviewResponse,
  dashboardAssets: readonly NhPlugDashboardAsset[]
): NhPlugSyncPreview {
  const dashboardByCode = new Map<string, AssetAggregate>();
  dashboardAssets.forEach((asset) => {
    const code = normalizeNhPlugCode(asset.code ?? "");
    if (!code || asset.quantity <= 0) return;
    const current = dashboardByCode.get(code) ?? { quantity: 0, averagePriceTotal: 0 };
    current.quantity += asset.quantity;
    current.averagePriceTotal += asset.quantity * asset.avg_price;
    dashboardByCode.set(code, current);
  });

  const holdingsByCode = new Map<string, HoldingAggregate>();
  preview.accounts.forEach((account) => {
    account.holdings.forEach((holding: NhPlugHoldingPreview) => {
      const code = normalizeNhPlugCode(holding.code);
      const key = code || `${account.accountId}:${holding.name}`;
      const current = holdingsByCode.get(key) ?? {
        accountLabels: [],
        code,
        name: holding.name,
        market: holding.market,
        quantity: 0,
        averagePriceTotal: 0,
      };
      if (!current.accountLabels.includes(account.accountId)) current.accountLabels.push(account.accountId);
      current.quantity += holding.quantity;
      current.averagePriceTotal += holding.quantity * holding.averagePrice;
      holdingsByCode.set(key, current);
    });
  });

  const candidates: NhPlugSyncCandidate[] = [...holdingsByCode.values()]
    .map((holding) => {
      const dashboard = holding.code ? dashboardByCode.get(holding.code) : undefined;
      return {
        key: `${holding.market}:${holding.code || holding.name}`,
        accountLabels: holding.accountLabels,
        code: holding.code || "코드 없음",
        name: holding.name,
        market: holding.market,
        status: getStatus(holding, dashboard),
        nhQuantity: holding.quantity,
        dashboardQuantity: dashboard?.quantity,
        nhAveragePrice: roundedAveragePrice(holding.averagePriceTotal, holding.quantity),
        dashboardAveragePrice: dashboard
          ? roundedAveragePrice(dashboard.averagePriceTotal, dashboard.quantity)
          : undefined,
      };
    })
    .sort((left, right) => left.status.localeCompare(right.status) || left.name.localeCompare(right.name, "ko"));

  return {
    total: candidates.length,
    newCount: candidates.filter((candidate) => candidate.status === "new").length,
    quantityMismatchCount: candidates.filter((candidate) => candidate.status === "quantity_mismatch").length,
    averagePriceMismatchCount: candidates.filter((candidate) => candidate.status === "average_price_mismatch").length,
    matchedCount: candidates.filter((candidate) => candidate.status === "matched").length,
    invalidCount: candidates.filter((candidate) => candidate.status === "invalid").length,
    candidates,
  };
}
