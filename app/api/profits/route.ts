import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { DailyLogItem, CategorySnapshot } from "@/lib/types";

export const revalidate = 0;

interface AccountLogRow {
  date: string;
  category: "stocks" | "pension";
  account_name: string;
  invest: number;
  value: number;
  cash: number;
  profit: number;
  total: number;
}

interface BenchmarkLogRow {
  symbol: "KOSPI" | "SPX";
  name: string;
  date: string;
  value: number;
}

function getKoreaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

    const oldestDate = dailyLogs[dailyLogs.length - 1]?.date;
    const newestDate = dailyLogs[0]?.date;
    const { data: accountLogs, error: accountError } = await supabase
      .from("daily_account_log")
      .select("date, category, account_name, invest, value, cash, profit, total")
      .eq("user_id", session.user.id)
      .gte("date", oldestDate)
      .lte("date", newestDate)
      .order("date", { ascending: false })
      .limit(5000);

    if (accountError) throw accountError;

    const { data: benchmarkLogs, error: benchmarkError } = await supabase
      .from("benchmark_daily")
      .select("symbol, name, date, value")
      .in("symbol", ["KOSPI", "SPX"])
      .gte("date", oldestDate)
      .lte("date", newestDate)
      .order("date", { ascending: true });

    if (benchmarkError) throw benchmarkError;

    const accountsByDate = new Map<string, AccountLogRow[]>();
    ((accountLogs || []) as AccountLogRow[]).forEach((account) => {
      const rows = accountsByDate.get(account.date) ?? [];
      rows.push(account);
      accountsByDate.set(account.date, rows);
    });

    const logs: DailyLogItem[] = dailyLogs
      .filter((row) => row.date)
      .map((row) => ({
        date: row.date,
        total: {
          invest: (row.stocks_invest || 0) + (row.pension_invest || 0),
          value: (row.stocks_value || 0) + (row.pension_value || 0) + (row.total_cash || 0),
          profit: (row.stocks_profit || 0) + (row.pension_profit || 0),
          total: (row.stocks_value || 0) + (row.pension_value || 0) + (row.total_cash || 0),
        },
        stocks: {
          invest: row.stocks_invest || 0,
          value: row.stocks_value || 0,
          profit: row.stocks_profit || 0,
          total: (row.stocks_value || 0) + (row.stocks_cash || 0),
        },
        pension: {
          invest: row.pension_invest || 0,
          value: row.pension_value || 0,
          profit: row.pension_profit || 0,
          total: (row.pension_value || 0) + (row.pension_cash || 0),
        },
        blockchain: {
          invest: 0,
          value: 0,
          profit: 0,
          total: 0,
        },
        crypto: {
          invest: 0,
          value: 0,
          profit: 0,
          total: 0,
        },
        accounts: (accountsByDate.get(row.date) ?? []).map((account) => ({
          category: account.category,
          accountName: account.account_name,
          invest: Number(account.invest || 0),
          value: Number(account.value || 0),
          cash: Number(account.cash || 0),
          profit: Number(account.profit || 0),
          total: Number(account.total || 0),
        })),
      }));

    const latestLogDate = logs[0]?.date ?? null;
    const today = getKoreaDateString();
    const benchmarkRows = (benchmarkLogs || []) as BenchmarkLogRow[];

    return NextResponse.json({
      data: logs,
      benchmarks: ([
        { symbol: "KOSPI" as const, name: "KOSPI" },
        { symbol: "SPX" as const, name: "S&P 500" },
      ]).map((benchmark) => ({
        ...benchmark,
        points: benchmarkRows
          .filter((row) => row.symbol === benchmark.symbol)
          .map((row) => ({ date: row.date, value: Number(row.value || 0) })),
      })),
      meta: {
        basis: "daily_close",
        latestLogDate,
        isTodayConfirmed: latestLogDate === today,
        today,
      },
      error: null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "데이터 조회 실패" },
      { status: 500 }
    );
  }
}
