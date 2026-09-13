export interface NhPlugHoldingPreview {
  code: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  investedAmount: number;
  currentValue: number;
  profitLoss: number;
  currency: string;
  market: "domestic" | "us";
}

export interface NhPlugBalanceSummary {
  cash: number;
  investedAmount: number;
  currentValue: number;
  totalAsset: number;
  profitLoss: number;
}

export interface NhPlugAccountPreview {
  accountId: string;
  accountType: "01" | "02";
  domestic: NhPlugBalanceSummary | null;
  us: NhPlugBalanceSummary | null;
  holdings: NhPlugHoldingPreview[];
  errors: string[];
}

export interface NhPlugPreviewResponse {
  provider: "NH투자증권 Namuh PLUG";
  readOnly: true;
  updatedAt: string;
  tokenSource: "memory" | "database" | "issued";
  tokenExpiresAt: string;
  accounts: NhPlugAccountPreview[];
  totals: {
    accounts: number;
    holdings: number;
    currentValue: number;
    cash: number;
  };
}

export type NhPlugSyncStatus = "new" | "quantity_mismatch" | "average_price_mismatch" | "matched" | "invalid";

export interface NhPlugSyncCandidate {
  key: string;
  accountLabels: string[];
  code: string;
  name: string;
  market: "domestic" | "us";
  status: NhPlugSyncStatus;
  nhQuantity: number;
  dashboardQuantity?: number;
  nhAveragePrice: number;
  dashboardAveragePrice?: number;
}

export interface NhPlugSyncPreview {
  total: number;
  newCount: number;
  quantityMismatchCount: number;
  averagePriceMismatchCount: number;
  matchedCount: number;
  invalidCount: number;
  candidates: NhPlugSyncCandidate[];
}

export interface NhPlugPreviewWithSyncResponse extends NhPlugPreviewResponse {
  sync: NhPlugSyncPreview;
}
