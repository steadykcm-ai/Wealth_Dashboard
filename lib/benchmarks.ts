import { supabase } from "@/lib/supabase";
import {
  fetchKISDomesticIndexSeries,
  fetchKISOverseasIndexSeries,
  type KisIndexPoint,
} from "@/lib/kis-client";

interface BenchmarkRow {
  symbol: "KOSPI" | "SPX";
  name: string;
  date: string;
  value: number;
  source: "KIS";
  updated_at: string;
}

export interface BenchmarkSaveResult {
  KOSPI: number;
  SPX: number;
}

function toRows(
  symbol: BenchmarkRow["symbol"],
  name: string,
  points: KisIndexPoint[]
): BenchmarkRow[] {
  const updatedAt = new Date().toISOString();
  return points.map((point) => ({
    symbol,
    name,
    date: point.date,
    value: point.value,
    source: "KIS",
    updated_at: updatedAt,
  }));
}

export async function saveBenchmarkRange(
  startDate: string,
  endDate: string
): Promise<BenchmarkSaveResult> {
  const kospi = await fetchKISDomesticIndexSeries("0001", startDate, endDate);
  const spx = await fetchKISOverseasIndexSeries(".SPX", startDate, endDate);
  const rows = [
    ...toRows("KOSPI", "KOSPI", kospi),
    ...toRows("SPX", "S&P 500", spx),
  ];

  if (rows.length > 0) {
    const { error } = await supabase
      .from("benchmark_daily")
      .upsert(rows, { onConflict: "symbol,date" });
    if (error) throw error;
  }

  return { KOSPI: kospi.length, SPX: spx.length };
}
