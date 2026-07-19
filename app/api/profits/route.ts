import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import type {
  DailyLogItem,
  CategorySnapshot,
  PortfolioChangeCandidate,
  PortfolioEvent,
  PortfolioEventCategory,
  PortfolioEventType,
} from "@/lib/types";

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

interface PortfolioEventRow {
  id: number;
  date: string;
  category: PortfolioEventCategory;
  account_name: string;
  detected_amount: number;
  amount: number;
  event_type: PortfolioEventType;
}

const MIN_CHANGE_AMOUNT = 500_000;
const MIN_CHANGE_RATE = 0.01;

function portfolioEventKey(
  date: string,
  category: PortfolioEventCategory,
  accountName: string
): string {
  return `${date}|${category}|${accountName}`;
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
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: dailyLogs, error } = await supabaseServer
      .from("daily_log")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(365);

    if (error) throw error;

    if (!dailyLogs || dailyLogs.length === 0) {
      return NextResponse.json({
        data: [],
        benchmarks: [],
        portfolioEvents: [],
        changeCandidates: [],
        error: null,
      });
    }

    const oldestDate = dailyLogs[dailyLogs.length - 1]?.date;
    const newestDate = dailyLogs[0]?.date;
    const { data: accountLogs, error: accountError } = await supabaseServer
      .from("daily_account_log")
      .select("date, category, account_name, invest, value, cash, profit, total")
      .eq("user_id", user.id)
      .gte("date", oldestDate)
      .lte("date", newestDate)
      .order("date", { ascending: false })
      .limit(5000);

    if (accountError) throw accountError;

    const { data: benchmarkLogs, error: benchmarkError } = await supabaseServer
      .from("benchmark_daily")
      .select("symbol, name, date, value")
      .in("symbol", ["KOSPI", "SPX"])
      .gte("date", oldestDate)
      .lte("date", newestDate)
      .order("date", { ascending: true });

    if (benchmarkError) throw benchmarkError;

    const { data: portfolioEventRows, error: portfolioEventError } = await supabaseServer
      .from("portfolio_events")
      .select("id, date, category, account_name, detected_amount, amount, event_type")
      .gte("date", oldestDate)
      .lte("date", newestDate)
      .order("date", { ascending: true });

    if (portfolioEventError) throw portfolioEventError;

    const portfolioEvents: PortfolioEvent[] = ((portfolioEventRows || []) as PortfolioEventRow[])
      .map((event) => ({
        id: event.id,
        date: event.date,
        category: event.category,
        accountName: event.account_name,
        detectedAmount: Number(event.detected_amount || 0),
        amount: Number(event.amount || 0),
        eventType: event.event_type,
      }));

    const reviewedKeys = new Set(
      portfolioEvents.map((event) => portfolioEventKey(event.date, event.category, event.accountName))
    );
    const previousByAccount = new Map<string, AccountLogRow>();
    const changeCandidates: PortfolioChangeCandidate[] = [];

    ([...((accountLogs || []) as AccountLogRow[])]
      .sort((a, b) => a.date.localeCompare(b.date)))
      .forEach((account) => {
        const accountKey = `${account.category}|${account.account_name}`;
        const previous = previousByAccount.get(accountKey);

        if (previous) {
          const detectedAmount =
            Number(account.invest || 0) - Number(previous.invest || 0)
            + Number(account.cash || 0) - Number(previous.cash || 0);
          const threshold = Math.max(
            MIN_CHANGE_AMOUNT,
            Math.abs(Number(previous.total || 0)) * MIN_CHANGE_RATE
          );
          const reviewKey = portfolioEventKey(
            account.date,
            account.category,
            account.account_name
          );

          if (Math.abs(detectedAmount) >= threshold && !reviewedKeys.has(reviewKey)) {
            changeCandidates.push({
              date: account.date,
              category: account.category,
              accountName: account.account_name,
              detectedAmount: Math.round(detectedAmount),
            });
          }
        }

        previousByAccount.set(accountKey, account);
      });

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
      portfolioEvents,
      changeCandidates: changeCandidates.sort((a, b) => b.date.localeCompare(a.date)),
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
