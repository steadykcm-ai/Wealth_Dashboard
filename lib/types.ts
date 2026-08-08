export interface AssetItem {
  id?: number;
  code?: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  priceUpdatedAt?: string;
  valuationMode?: "market" | "manual";
  manualInvestAmount?: number;
  manualValue?: number;
  valuationUpdatedAt?: string;
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
  unallocatedCash?: number;
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

export interface AccountDailySnapshot {
  category: "stocks" | "pension";
  accountName: string;
  invest: number;
  value: number;
  cash: number;
  profit: number;
  total: number;
}

export interface BenchmarkPoint {
  date: string;
  value: number;
}

export interface BenchmarkSeries {
  symbol: "KOSPI" | "SPX";
  name: string;
  points: BenchmarkPoint[];
}

export type MarketCategory = "indices" | "fx" | "commodities" | "crypto";
export type MarketDataSource = "KIS" | "Upbit" | "Yahoo";

export interface MarketTrendPoint {
  date: string;
  value: number;
}

export interface MarketInstrument {
  id: string;
  category: MarketCategory;
  name: string;
  symbol: string;
  price: number | null;
  changeAmount: number | null;
  changeRate: number | null;
  unit: string;
  source: MarketDataSource;
  sourceLabel: string;
  asOfDate?: string;
  updatedAt: string;
  points: MarketTrendPoint[];
  status: "ok" | "fallback" | "unavailable";
  error?: string;
}

export interface MarketOverviewResponse {
  items: MarketInstrument[];
  updatedAt: string;
  partial: boolean;
  unavailableCount: number;
}

export type PortfolioEventCategory = "stocks" | "pension";
export type PortfolioEventType =
  | "deposit"
  | "withdrawal"
  | "transfer_in"
  | "transfer_out"
  | "valuation_adjustment"
  | "ignored";

export interface PortfolioChangeCandidate {
  date: string;
  category: PortfolioEventCategory;
  accountName: string;
  detectedAmount: number;
}

export interface PortfolioEvent extends PortfolioChangeCandidate {
  id: number;
  amount: number;
  eventType: PortfolioEventType;
}

export interface DailyLogItem {
  date: string;
  total: CategorySnapshot;
  stocks: CategorySnapshot;
  pension: CategorySnapshot;
  blockchain: CategorySnapshot;
  crypto: CategorySnapshot;
  accounts: AccountDailySnapshot[];
}

export type SyncJob = "prices" | "daily_log" | "benchmarks";
export type SyncRunStatus = "success" | "partial" | "failed";
export type SyncRunTrigger = "cron" | "manual";

export interface SyncRun {
  id: number;
  job: SyncJob;
  status: SyncRunStatus;
  trigger: SyncRunTrigger;
  startedAt: string;
  finishedAt: string;
  details: Record<string, unknown>;
  errorMessage?: string;
}

export type RebalanceCategory = "stocks" | "pension";

export interface RebalanceTarget {
  assetId: number;
  targetWeight: number;
  updatedAt?: string;
}

export interface RetirementSettings {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  monthlyContribution: number;
  monthlyLivingCost: number;
  publicPensionMonthly: number;
  publicPensionStartAge: number;
  privatePensionStartAge: number;
  pensionContributionRatio: number;
  monthlyContributionAfterRetirement: number;
  withdrawalPriority: "pension_first" | "taxable_first" | "proportional";
  expectedReturnRate: number;
  inflationRate: number;
  updatedAt?: string;
}
