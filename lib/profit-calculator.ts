import type { AssetCategory, AssetItem, AssetGroup, AssetSummary, PortfolioBreakdown, AccountGroup } from "@/lib/types";
import { ASSETS_TAB } from "@/lib/sheetConfig";

type RawRow = (string | number)[];

// 스킵할 헤더/요약 키워드
const SKIP_KEYWORDS = new Set([
  "자산유형", "계좌명", "종목명", "코드", "수량", "매입가", "현재가",
  "보유종목", "총자산(원금)", "총자산", "원금", "", "Summary",
]);

function isDataRow(row: RawRow): boolean {
  // A열(index 0)은 자산유형 (개별주식, 개인연금, IRP)
  // C열(index 2)은 종목명 (문자열이어야 함)
  // E열(index 4)은 수량 (숫자 > 0)
  // F열(index 5)는 매입가 (숫자 > 0)

  const assetType = row[0];
  const name = row[2];
  const qty = Number(row[4]);
  const price = Number(row[5]);

  if (typeof assetType !== "string" || !assetType.trim()) return false;
  if (typeof name !== "string" || !name.trim()) return false;
  if (SKIP_KEYWORDS.has(name)) return false;
  return qty > 0 && price > 0;
}

function parseRow(row: RawRow, rowIndex?: number): AssetItem | null {
  if (!isDataRow(row)) return null;

  const name = String(row[2]).trim();
  const quantity = Number(row[4]);
  const avgPrice = Number(row[5]);
  const currentPrice = Number(row[6]) || 0;

  // 현재가 0 = 청산/상폐 종목 → 제외
  if (currentPrice === 0) return null;

  const investAmount = quantity * avgPrice;
  const currentValue = quantity * currentPrice;
  const profitLoss = currentValue - investAmount;
  const returnRate = investAmount > 0 ? (profitLoss / investAmount) * 100 : 0;

  return {
    name,
    quantity,
    avgPrice,
    currentPrice,
    investAmount,
    currentValue,
    profitLoss,
    returnRate,
    ...(rowIndex !== undefined ? { rowIndex } : {}),
    sheetTab: ASSETS_TAB,
  };
}

function toAssetCategory(value: string): AssetCategory | null {
  if (value === "개별주식" || value === "개인연금" || value === "IRP") {
    return value;
  }
  return null;
}

// 단일 Assets 시트 파싱: A열(자산유형) + B열(계좌명)로 그룹핑
function parseAssetsSheet(rows: RawRow[]): Record<string, AssetGroup> {
  const groups: Record<string, AssetGroup> = {};

  // 각 행을 파싱하고 assetType/accountName과 함께 추적
  const itemsWithMetadata: Array<{ item: AssetItem; assetType: string; accountName: string }> = [];
  const cashByAccount: Record<string, number> = {};

  rows.forEach((row, i) => {
    const assetType = String(row[0]).trim();
    const accountName = String(row[1]).trim();

    // 현금 행 처리 (종목명이 "-"이고 수량/매입가가 없음)
    if (assetType === "현금" && accountName && typeof row[6] === "number") {
      cashByAccount[accountName] = (cashByAccount[accountName] ?? 0) + Number(row[6]);
      return;
    }

    const parsedItem = parseRow(row, i + 1);
    if (parsedItem && assetType && accountName) {
      itemsWithMetadata.push({ item: parsedItem, assetType, accountName });
    }
  });

  // 자산유형별로 그룹핑
  const assetTypes = Array.from(new Set(itemsWithMetadata.map((m) => m.assetType)));
  for (const assetType of assetTypes) {
    const category = toAssetCategory(assetType);
    if (!category) continue;

    const typeMetadata = itemsWithMetadata.filter((m) => m.assetType === assetType);
    const typeItems = typeMetadata.map((m) => m.item);

    // 계좌명별로 AccountGroup 생성
    const accountNames = Array.from(new Set(typeMetadata.map((m) => m.accountName)));
    const accounts: AccountGroup[] = [];
    for (const accountName of accountNames) {
      const accountMetadata = typeMetadata.filter((m) => m.accountName === accountName);
      const accountItems = accountMetadata.map((m) => m.item);
      const accountCash = cashByAccount[accountName] ?? 0;
      const totalInvest = accountItems.reduce((s, i) => s + i.investAmount, 0);
      const totalValue = accountItems.reduce((s, i) => s + i.currentValue, 0);
      const totalProfitLoss = totalValue - totalInvest;
      const returnRate = totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0;

      if (totalValue > 0 || accountCash > 0) {
        accounts.push({
          name: accountName,
          totalInvest,
          totalValue: totalValue + accountCash,
          cash: accountCash,
          totalProfitLoss,
          returnRate,
          items: accountItems,
          insertRowIndex: Math.max(...accountItems.map((i) => i.rowIndex ?? 0), 0) + 1,
          sheetTab: ASSETS_TAB,
        });
      }
    }

    const totalInvest = typeItems.reduce((s, i) => s + i.investAmount, 0);
    const totalValue = typeItems.reduce((s, i) => s + i.currentValue, 0);
    const totalCash = accounts.reduce((s, a) => s + a.cash, 0);
    const totalProfitLoss = totalValue - totalInvest;
    const returnRate = totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0;

    groups[assetType] = {
      category,
      items: typeItems,
      totalInvest,
      totalValue: totalValue + totalCash,
      cash: totalCash,
      totalProfitLoss,
      returnRate,
      accounts,
    };
  }

  return groups;
}

// Log_Total 시트에서 섹터 맵 파싱 (사용되지 않지만 호환성 유지)
export function parseSectorMap(rows: RawRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  // Log_Total이 더 이상 필요하지 않으므로 빈 맵 반환
  return map;
}

// 포트폴리오 구성 분류 파싱 (Log_Total 사용, 호환성 유지)
export function parsePortfolioBreakdown(rows: RawRow[]): PortfolioBreakdown {
  for (const row of rows.slice(0, 8)) {
    const vals = [8, 9, 10, 11, 12, 13].map((i) => Number(row[i]));
    if (vals.every((v) => !isNaN(v) && v > 0)) {
      return {
        region: [
          { label: "국내", value: vals[0], color: "#3d47cf" },
          { label: "미국", value: vals[1], color: "#26a69a" },
          { label: "중국", value: vals[2], color: "#ff7043" },
        ],
        assetType: [
          { label: "원자재", value: vals[3], color: "#ff7043" },
          { label: "주식", value: vals[4], color: "#3d47cf" },
          { label: "채권", value: vals[5], color: "#26a69a" },
        ],
      };
    }
  }
  return { region: [], assetType: [] };
}

// Assets 시트 데이터로부터 자산 요약 생성
export function buildAssetSummary(rows: RawRow[], sectorMap: Record<string, string> = {}): AssetSummary {
  const groupsMap = parseAssetsSheet(rows);
  const groups = Object.values(groupsMap);

  const totalInvest = groups.reduce((s, g) => s + g.totalInvest, 0);
  const totalValue = groups.reduce((s, g) => s + g.totalValue, 0);
  const totalProfitLoss = groups.reduce((s, g) => s + g.totalProfitLoss, 0);
  const returnRate = totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0;

  return { totalInvest, totalValue, totalProfitLoss, returnRate, groups };
}

// 숫자 포맷: 억 이상 "억" 단위 축약, 원화는 정수 반올림
export function formatKRW(value: number): string {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  if (abs >= 100_000_000) {
    const eok = rounded / 100_000_000;
    return `${eok.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억`;
  }
  if (abs >= 10_000) {
    return rounded.toLocaleString("ko-KR");
  }
  return rounded.toLocaleString("ko-KR");
}

export function formatRate(rate: number): string {
  return `${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%`;
}
