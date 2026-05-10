import { NextResponse } from "next/server";
import { batchGetSheetValues } from "@/lib/sheets";
import { getAssetRanges, getPortfolioRange } from "@/lib/sheetConfig";
import { buildAssetSummary, parsePortfolioBreakdown, parseSectorMap } from "@/lib/profit-calculator";
import type { AssetCategory } from "@/lib/types";

export const revalidate = 300;

export async function GET() {
  try {
    const assetRanges = getAssetRanges();
    const portfolioRange = getPortfolioRange();
    const allRanges = [...assetRanges, portfolioRange];

    const rawData = await batchGetSheetValues(allRanges);

    const assetsRows = rawData[0] ?? [];
    const cryptoRows = rawData[1] ?? [];
    const logTotalRows = rawData[2] ?? [];

    const breakdown = parsePortfolioBreakdown(logTotalRows);
    const sectorMap = parseSectorMap(logTotalRows);

    // Assets 시트 파싱 (개별주식, 개인연금, IRP)
    const summary = buildAssetSummary(assetsRows, sectorMap);

    // BlockChain 암호화폐 데이터는 별도의 API (/api/crypto)에서 처리
    // 여기서는 구조 호환성만 유지

    const response = {
      summary,
      breakdown,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
