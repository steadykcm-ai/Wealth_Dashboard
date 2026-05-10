import { NextRequest, NextResponse } from "next/server";
import { batchGetSheetValues, appendSheetRow, updateSheetCell } from "@/lib/sheets";
import { getLogRange } from "@/lib/sheetConfig";
import type { DailyLogItem, CategorySnapshot } from "@/lib/types";

export async function GET() {
  try {
    const rows = await batchGetSheetValues([getLogRange()]);
    if (rows.length === 0) {
      return NextResponse.json({ data: [], error: null });
    }

    const data = rows[0];
    if (!data || data.length < 3) {
      return NextResponse.json({ data: [], error: null });
    }

    // Excel 시리얼 날짜를 YYYY-MM-DD로 변환
    const excelDateToString = (val: any): string => {
      if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
      const num = Number(val);
      if (isNaN(num) || num < 1) return "";
      const date = new Date((num - 25569) * 86400 * 1000);
      return date.toISOString().split("T")[0];
    };

    // 3행부터 실제 데이터 (1~2행은 헤더)
    const logs: DailyLogItem[] = [];
    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) break;

      const date = excelDateToString(row[0]);
      const log: DailyLogItem = {
        date,
        total: {
          invest: Number(row[1]) || 0,  // B
          value: Number(row[2]) || 0,   // C
          profit: Number(row[3]) || 0,  // D
          total: Number(row[5]) || 0,   // F (Total 컬럼)
        },
        stocks: {
          invest: Number(row[6]) || 0,  // G
          value: Number(row[7]) || 0,   // H
          profit: Number(row[8]) || 0,  // I
          total: Number(row[10]) || 0,  // K (Stocks Total)
        },
        pension: {
          invest: Number(row[11]) || 0, // L
          value: Number(row[12]) || 0,  // M
          profit: Number(row[13]) || 0, // N
          total: Number(row[15]) || 0,  // P (Pension Total)
        },
        blockchain: {
          invest: Number(row[16]) || 0, // Q
          value: Number(row[17]) || 0,  // R
          profit: Number(row[18]) || 0, // S
          total: Number(row[20]) || 0,  // U (IRP Total)
        },
        crypto: {
          invest: Number(row[21]) || 0, // V
          value: Number(row[22]) || 0,  // W
          profit: Number(row[23]) || 0, // X
          total: Number(row[25]) || 0,  // Z (Crypto Total)
        },
      };
      logs.push(log);
    }

    return NextResponse.json({ data: logs, error: null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "데이터 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      total: CategorySnapshot;
      stocks: CategorySnapshot;
      pension: CategorySnapshot;
      blockchain: CategorySnapshot;
      crypto: CategorySnapshot;
    };

    const today = new Date().toISOString().split("T")[0];

    // 기존 데이터 조회
    const rows = await batchGetSheetValues([getLogRange()]);
    const data = rows[0];

    // 오늘 날짜 row 찾기 (3행부터 검색, 1-based)
    let existingRowIndex = -1;
    if (data && data.length > 2) {
      for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (row && row[0] && String(row[0]) === today) {
          existingRowIndex = i + 1; // 1-based row number
          break;
        }
      }
    }

    const values: (string | number)[] = [
      today,
      body.total.invest,
      body.total.value,
      body.total.profit,
      body.total.total,
      body.stocks.invest,
      body.stocks.value,
      body.stocks.profit,
      body.stocks.total,
      body.pension.invest,
      body.pension.value,
      body.pension.profit,
      body.pension.total,
      body.blockchain.invest,
      body.blockchain.value,
      body.blockchain.profit,
      body.blockchain.total,
      body.crypto.invest,
      body.crypto.value,
      body.crypto.profit,
      body.crypto.total,
    ];

    if (existingRowIndex > 0) {
      // 기존 row 수정
      const columns = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"];
      for (let i = 0; i < values.length; i++) {
        await updateSheetCell("Log_daily", existingRowIndex, columns[i], Number(values[i]));
      }
    } else {
      // 새 row 추가
      await appendSheetRow(getLogRange(), values);
    }

    return NextResponse.json({ ok: true, date: today, updated: existingRowIndex > 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "저장 실패" },
      { status: 500 }
    );
  }
}
