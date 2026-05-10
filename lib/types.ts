// 자산 항목 (주식, 연금, IRP, 암호화폐 공통)
export interface AssetItem {
  name: string;       // 종목명
  quantity: number;   // 수량
  avgPrice: number;   // 평균매입가
  currentPrice: number; // 현재가
  investAmount: number; // 투자금액 (quantity * avgPrice)
  currentValue: number; // 현재가치 (quantity * currentPrice)
  profitLoss: number;   // 평가손익 (currentValue - investAmount)
  returnRate: number;   // 수익률 (%)
  sector?: string;      // 섹터 (Log_Total에서 매핑)
  rowIndex?: number;    // 시트 내 행 번호 (1-based)
  sheetTab?: string;    // 시트 탭 이름
}

// 자산 카테고리
export type AssetCategory = "개별주식" | "개인연금" | "IRP" | "암호화폐";

// 계좌별 자산 그룹
export interface AccountGroup {
  name: string;          // 계좌명 (e.g. NH_CMA(7187))
  totalInvest: number;   // 원금
  totalValue: number;    // 총자산
  cash: number;          // 현금
  totalProfitLoss: number;
  returnRate: number;
  items: AssetItem[];
  insertRowIndex: number; // 새 종목 삽입 기준 행 (1-based, 이 행 다음에 삽입)
  cashRowIndex?: number;  // 현금이 저장된 행 번호 (1-based, 총자산 행의 I열)
  sheetTab?: string;      // 시트 탭 이름
}

// 카테고리별 자산 그룹
export interface AssetGroup {
  category: AssetCategory;
  items: AssetItem[];
  totalInvest: number;   // 원금 (현금 포함)
  totalValue: number;    // 평가금액 + 현금
  cash: number;          // 현금 잔고
  totalProfitLoss: number;
  returnRate: number;
  accounts: AccountGroup[];
}

// 전체 자산 요약
export interface AssetSummary {
  totalInvest: number;
  totalValue: number;
  totalProfitLoss: number;
  returnRate: number;
  groups: AssetGroup[];
}

// 포트폴리오 구성 분류
export interface BreakdownItem {
  label: string;
  value: number;
  color: string;
}

export interface PortfolioBreakdown {
  region: BreakdownItem[];   // 지역별 (국내/미국/중국)
  assetType: BreakdownItem[]; // 자산유형별 (주식/원자재/채권)
}

// API 응답 타입
export interface AssetsApiResponse {
  summary: AssetSummary;
  breakdown: PortfolioBreakdown;
  updatedAt: string;
}

// 수익금 로그 항목
export interface ProfitLogItem {
  date: string;
  totalAsset: number;
  profitAmount: number;
  returnRate: number;
}

// 거래소 암호화폐 그룹
export interface ExchangeGroup {
  exchange: string;
  items: AssetItem[];
  cash: number;
  totalInvest: number;
  totalValue: number;
  totalProfitLoss: number;
  returnRate: number;
}

// 거래소 암호화폐 API 응답
export interface CryptoApiResponse {
  exchanges: ExchangeGroup[];
  totalInvest: number;
  totalValue: number;
  totalProfitLoss: number;
  returnRate: number;
  updatedAt: string;
}

// 입금 기록 항목
export interface DepositItem {
  date: string;
  category: string;
  amount: number;
  memo: string;
}

// 카테고리별 일일 스냅샷
export interface CategorySnapshot {
  invest: number;
  value: number;
  profit: number;
  total: number;
}

// 일일 수익 기록
export interface DailyLogItem {
  date: string;
  total: CategorySnapshot;
  stocks: CategorySnapshot;
  pension: CategorySnapshot;
  blockchain: CategorySnapshot;
  crypto: CategorySnapshot;
}
