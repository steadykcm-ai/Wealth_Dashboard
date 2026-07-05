export interface AssetItem {
  id?: number;
  code?: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  priceUpdatedAt?: string;
  todayChangeRate?: number;
  todayChangeAmount?: number;
  investAmount: number;
  currentValue: number;
  profitLoss: number;
  returnRate: number;
  sector?: string;
  rowIndex?: number;
  sheetTab?: string;
}

export type AssetCategory = "개별주식" | "개인연금" | "IRP";

export interface AccountGroup {
  name: string;
  totalInvest: number;
  totalValue: number;
  cash: number;
  totalProfitLoss: number;
  returnRate: number;
  items: AssetItem[];
  insertRowIndex: number;
  cashRowIndex?: number;
  sheetTab?: string;
}

export interface AssetGroup {
  category: AssetCategory;
  items: AssetItem[];
  totalInvest: number;
  totalValue: number;
  cash: number;
  totalProfitLoss: number;
  returnRate: number;
  accounts: AccountGroup[];
}

export interface AssetSummary {
  totalInvest: number;
  totalValue: number;
  totalProfitLoss: number;
  returnRate: number;
  priceUpdatedAt?: string;
  groups: AssetGroup[];
}

export interface BreakdownItem {
  label: string;
  value: number;
  color: string;
}

export interface PortfolioBreakdown {
  region: BreakdownItem[];
  assetType: BreakdownItem[];
}

export interface AssetsApiResponse {
  summary: AssetSummary;
  breakdown: PortfolioBreakdown;
  updatedAt: string;
}

export interface ProfitLogItem {
  date: string;
  totalAsset: number;
  profitAmount: number;
  returnRate: number;
}

export interface ExchangeGroup {
  exchange: string;
  items: AssetItem[];
  cash: number;
  totalInvest: number;
  totalValue: number;
  totalProfitLoss: number;
  returnRate: number;
}

export interface CryptoApiResponse {
  exchanges: ExchangeGroup[];
  totalInvest: number;
  totalValue: number;
  totalProfitLoss: number;
  returnRate: number;
  updatedAt: string;
}

export interface DepositItem {
  date: string;
  category: string;
  amount: number;
  memo: string;
}

export interface CategorySnapshot {
  invest: number;
  value: number;
  profit: number;
  total: number;
}

export interface DailyLogItem {
  date: string;
  total: CategorySnapshot;
  stocks: CategorySnapshot;
  pension: CategorySnapshot;
  blockchain: CategorySnapshot;
  crypto: CategorySnapshot;
}

export interface CryptoAssetRow {
  id: number;
  ticker: string;
  name: string;
  quantity: number;
  avg_price: number;
  exchange: string;
  is_cash: boolean;
}
