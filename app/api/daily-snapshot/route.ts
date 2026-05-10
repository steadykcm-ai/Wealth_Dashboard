import { NextResponse } from "next/server";
import { batchGetSheetValues, updateSheetCell } from "@/lib/sheets";
import { getAssetRanges } from "@/lib/sheetConfig";
import type { CryptoApiResponse } from "@/lib/types";

export const revalidate = 0;

export async function GET() {
  try {
    // Assets 데이터 조회
    const assetRanges = getAssetRanges();
    const assetData = await batchGetSheetValues(assetRanges);

    // Stocks, Pension, IRP 요약 계산
    const stocks = calculateCategory(assetData[0]);
    const pension = calculateCategory(assetData[1]);
    const irp = calculateCategory(assetData[2]);

    // Crypto 데이터 조회
    let crypto = { invest: 0, value: 0, profit: 0, total: 0, cash: 0, returnRate: 0 };
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const cryptoRes = await fetch(`${apiUrl}/api/crypto`, {
        cache: "no-store"
      });
      if (cryptoRes.ok) {
        const cryptoData = await cryptoRes.json() as CryptoApiResponse;
        crypto = {
          invest: Math.round(cryptoData.totalInvest),
          value: Math.round(cryptoData.totalValue),
          profit: Math.round(cryptoData.totalProfitLoss),
          total: Math.round(cryptoData.totalValue),
          cash: Math.round(cryptoData.exchanges.reduce((s, g) => s + g.cash, 0)),
          returnRate: cryptoData.returnRate
        };

        // Log_Total!D8:H8에 저장 (암호화폐 행, C8은 함수로 두기)
        const rowIndex = 8;
        const totalWithCash = crypto.value + crypto.cash;
        await Promise.all([
          updateSheetCell("Log_Total", rowIndex, "D", crypto.invest),
          updateSheetCell("Log_Total", rowIndex, "E", crypto.value),
          updateSheetCell("Log_Total", rowIndex, "F", crypto.profit),
          updateSheetCell("Log_Total", rowIndex, "G", crypto.cash),
          updateSheetCell("Log_Total", rowIndex, "H", totalWithCash)
        ]);
      }
    } catch (cryptoErr) {
      // Crypto API 실패 시 계속 진행 (암호화폐 데이터 없음)
      console.error("Crypto API error:", cryptoErr);
    }

    // 총계 (Crypto 포함)
    const totalInvest = stocks.invest + pension.invest + irp.invest + crypto.invest;
    const totalValue = stocks.value + pension.value + irp.value + crypto.value;
    const totalProfit = stocks.profit + pension.profit + irp.profit + crypto.profit;

    return NextResponse.json({
      total: {
        invest: totalInvest,
        value: totalValue,
        profit: totalProfit,
        total: totalValue
      },
      stocks,
      pension,
      irp,
      blockchain: {
        invest: crypto.invest,
        value: crypto.value,
        profit: crypto.profit,
        total: crypto.total
      }
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get snapshot" },
      { status: 500 }
    );
  }
}

function calculateCategory(rows: (string | number)[][]): any {
  let invest = 0;
  let value = 0;

  // 3행부터 데이터 (1~2행은 헤더)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) break;

    // 각 탭마다 구조가 다를 수 있으므로, 수동으로 파싱
    // 가정: B열(투자금) C열(현재가치)이 있음
    const investVal = parseFloat(String(row[1])) || 0;
    const valueVal = parseFloat(String(row[2])) || 0;

    if (investVal > 0) {
      invest += investVal;
      value += valueVal;
    }
  }

  const profit = value - invest;

  return {
    invest: Math.round(invest),
    value: Math.round(value),
    profit: Math.round(profit),
    total: Math.round(value)
  };
}
