import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { DailyLogItem, CategorySnapshot } from "@/lib/types";

export const revalidate = 0;

export async function GET() {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { session } } = await supabaseServer.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: dailyLogs, error } = await supabase
      .from("daily_log")
      .select("*")
      .eq("user_id", session.user.id)
      .order("date", { ascending: false })
      .limit(365);

    if (error) throw error;

    if (!dailyLogs || dailyLogs.length === 0) {
      return NextResponse.json({ data: [], error: null });
    }

    const logs: DailyLogItem[] = dailyLogs
      .filter((row) => row.date)
      .map((row) => ({
        date: row.date,
        total: {
          invest: (row.stocks_invest || 0) + (row.pension_invest || 0) + (row.crypto_invest || 0),
          value: (row.stocks_value || 0) + (row.pension_value || 0) + (row.crypto_value || 0) + (row.total_cash || 0),
          profit: (row.stocks_profit || 0) + (row.pension_profit || 0) + (row.crypto_profit || 0),
          total: (row.stocks_value || 0) + (row.pension_value || 0) + (row.crypto_value || 0) + (row.total_cash || 0),
        },
        stocks: {
          invest: row.stocks_invest || 0,
          value: row.stocks_value || 0,
          profit: row.stocks_profit || 0,
          total: row.stocks_value || 0,
        },
        pension: {
          invest: row.pension_invest || 0,
          value: row.pension_value || 0,
          profit: row.pension_profit || 0,
          total: row.pension_value || 0,
        },
        blockchain: {
          invest: row.crypto_invest || 0,
          value: row.crypto_value || 0,
          profit: row.crypto_profit || 0,
          total: row.crypto_value || 0,
        },
        crypto: {
          invest: row.crypto_invest || 0,
          value: row.crypto_value || 0,
          profit: row.crypto_profit || 0,
          total: row.crypto_value || 0,
        },
      }));

    return NextResponse.json({ data: logs, error: null });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "데이터 조회 실패" },
      { status: 500 }
    );
  }
}
