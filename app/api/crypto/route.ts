import { NextResponse } from "next/server";
import { batchGetSheetValues } from "@/lib/sheets";
import type { AssetItem, ExchangeGroup, CryptoApiResponse } from "@/lib/types";
import { fetchUpbitPrices, extractUpbitTicker } from "@/lib/upbit";

export const revalidate = 0;

type RawRow = (string | number)[];

const SKIP_KEYWORDS = new Set([
  "보유종목", "총자산(원금)", "총자산", "원금", "", "Summary",
]);

function isDataRow(row: RawRow): boolean {
  if (typeof row[1] !== "string") return false;
  const name = row[1].trim();
  if (!name || SKIP_KEYWORDS.has(name)) return false;
  const qty = Number(row[3]);
  const price = Number(row[4]);
  return qty > 0 && price > 0;
}

function isAccountNameRow(row: RawRow): boolean {
  const b = row[1];
  if (typeof b !== "string") return false;
  const name = b.trim();
  if (!name || SKIP_KEYWORDS.has(name)) return false;
  const empty = (v: unknown) => v === undefined || v === null || v === "";
  return empty(row[2]) && empty(row[3]) && empty(row[4]);
}

function parseRow(row: RawRow, rowIndex?: number): AssetItem | null {
  if (!isDataRow(row)) return null;

  const name = String(row[1]).trim();
  const quantity = Number(row[3]);
  const avgPrice = Number(row[4]);
  const currentPrice = Number(row[5]) || 0;

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
    sheetTab: "BlockChain",
  };
}

function buildExchange(name: string, rows: RawRow[], startRowIndex: number): ExchangeGroup | null {
  let totalInvest = 0, totalValue = 0, cash = 0, totalProfitLoss = 0;

  for (const row of rows) {
    if (row[1] === "원금" && typeof row[2] === "number") {
      totalInvest = Number(row[2]);
      if (typeof row[6] === "number") totalProfitLoss = Number(row[6]);
    }
    if (row[1] === "총자산" && typeof row[2] === "number") {
      totalValue = Number(row[2]);
      if (typeof row[8] === "number") cash = Number(row[8]);
    }
  }

  if (totalValue === 0) return null;

  const returnRate = totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0;
  const items = rows
    .map((r, i) => parseRow(r, startRowIndex + i))
    .filter((i): i is AssetItem => i !== null);

  return { exchange: name, items, cash, totalInvest, totalValue, totalProfitLoss, returnRate };
}

function parseExchangeSections(rows: RawRow[]): ExchangeGroup[] {
  const exchanges: ExchangeGroup[] = [];
  let sectionName: string | null = null;
  let sectionStart = 0;

  for (let i = 0; i < rows.length; i++) {
    if (isAccountNameRow(rows[i])) {
      if (sectionName !== null) {
        const exchange = buildExchange(sectionName, rows.slice(sectionStart, i), sectionStart + 1);
        if (exchange) exchanges.push(exchange);
      }
      sectionName = String(rows[i][1]).trim();
      sectionStart = i + 1;
    }
  }
  if (sectionName !== null) {
    const exchange = buildExchange(sectionName, rows.slice(sectionStart), sectionStart + 1);
    if (exchange) exchanges.push(exchange);
  }
  return exchanges;
}

export async function GET() {
  try {
    const ranges = ["BlockChain!A1:N100", "Log_Total!D8:H8"];
    const rawData = await batchGetSheetValues(ranges);
    const blockchainRows = rawData[0] ?? [];
    const logTotalRow = rawData[1]?.[0];

    if (!logTotalRow) {
      const response: CryptoApiResponse = {
        exchanges: [],
        totalInvest: 0,
        totalValue: 0,
        totalProfitLoss: 0,
        returnRate: 0,
        updatedAt: new Date().toISOString(),
      };
      return NextResponse.json(response);
    }

    const totalInvest = Number(logTotalRow[0]) || 0;      // D8: 원금
    const totalValue = Number(logTotalRow[1]) || 0;       // E8: 평가액
    const totalProfitLoss = Number(logTotalRow[2]) || 0;  // F8: 수익
    const cash = Number(logTotalRow[3]) || 0;             // G8: 현금

    const returnRate = totalInvest > 0 ? (totalProfitLoss / totalInvest) * 100 : 0;

    // BlockChain 시트에서 현재가 없는 항목 Upbit에서 보완
    const missingMap: { rowIdx: number; ticker: string }[] = [];
    blockchainRows.forEach((row, i) => {
      const f = row[5];
      const qty = Number(row[3]);
      const avgPrice = Number(row[4]);
      if (typeof row[1] !== "string" || !String(row[1]).trim()) return;
      if (qty <= 0 || avgPrice <= 0) return;
      if (typeof f !== "number" || f <= 0) {
        const rawTicker = String(row[2] ?? "").trim();
        if (rawTicker) {
          const ticker = extractUpbitTicker(rawTicker);
          if (/^[A-Z]+$/.test(ticker)) {
            missingMap.push({ rowIdx: i, ticker });
          }
        }
      }
    });

    if (missingMap.length > 0) {
      const upbitPrices = await fetchUpbitPrices(missingMap.map((m) => m.ticker));
      blockchainRows.forEach((row, i) => {
        const entry = missingMap.find((m) => m.rowIdx === i);
        if (entry && upbitPrices[entry.ticker] !== undefined) {
          row[5] = upbitPrices[entry.ticker];
        }
      });
    }

    // 계좌별로 구분
    const exchanges = parseExchangeSections(blockchainRows);

    // 계좌별 구분이 없으면 전체를 단일 그룹으로
    if (exchanges.length === 0) {
      const items = blockchainRows
        .map((row, i) => parseRow(row, i + 1))
        .filter((item): item is AssetItem => item !== null);

      exchanges.push({
        exchange: "암호화폐",
        items,
        cash,
        totalInvest,
        totalValue,
        totalProfitLoss,
        returnRate,
      });
    }

    const response: CryptoApiResponse = {
      exchanges,
      totalInvest,
      totalValue,
      totalProfitLoss,
      returnRate,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
