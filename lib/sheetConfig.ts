import type { AssetCategory } from "@/lib/types";

// 시트 탭 이름 — 변경 시 이 파일만 수정
export const ASSETS_TAB = "Assets";
export const SHEET_TABS: Record<AssetCategory, string> = {
  개별주식: ASSETS_TAB,
  개인연금: ASSETS_TAB,
  IRP: ASSETS_TAB,
};

export const LOG_TOTAL_TAB = "Log_Total";
export const LOG_DAILY_TAB = "Log_daily";
export const DEPOSIT_TAB = "Pension_Input";

// Assets 시트 데이터 범위 (A~G, 최대 200행)
export const ASSETS_DATA_RANGE = "A1:G200";
// batchGet 호출용 범위 목록
export function getAssetRanges(): string[] {
  return [
    `${ASSETS_TAB}!${ASSETS_DATA_RANGE}`,
  ];
}

export function getLogRange(): string {
  return `${LOG_DAILY_TAB}!A1:Z200`;
}

export function getDepositRange(): string {
  return `${DEPOSIT_TAB}!A1:D100`;
}

export function getPortfolioRange(): string {
  return `${LOG_TOTAL_TAB}!A1:N50`;
}
