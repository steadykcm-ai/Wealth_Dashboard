import YahooFinance from "yahoo-finance2";
import {
  fetchKISDomesticIndexOverview,
  fetchKISOverseasMarketOverview,
  type KisMarketOverview,
  type KisOverseasMarketDivision,
} from "@/lib/kis-client";
import type {
  MarketCategory,
  MarketDataSource,
  MarketInstrument,
  MarketOverviewResponse,
  MarketTrendPoint,
} from "@/lib/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface MarketDefinition {
  id: string;
  category: Exclude<MarketCategory, "crypto">;
  name: string;
  symbol: string;
  unit: string;
  yahooSymbol?: string;
  domesticCode?: string;
  division?: KisOverseasMarketDivision;
}

interface UpbitTicker {
  market?: string;
  trade_price?: number;
  signed_change_price?: number;
  signed_change_rate?: number;
  trade_timestamp?: number;
}

interface UpbitCandle {
  candle_date_time_utc?: string;
  trade_price?: number;
}

const MARKET_DEFINITIONS: MarketDefinition[] = [
  { id: "kospi", category: "indices", name: "KOSPI", symbol: "0001", unit: "pt", domesticCode: "0001", yahooSymbol: "^KS11" },
  { id: "kosdaq", category: "indices", name: "KOSDAQ", symbol: "1001", unit: "pt", domesticCode: "1001", yahooSymbol: "^KQ11" },
  { id: "sp500", category: "indices", name: "S&P 500", symbol: "SPX", unit: "pt", division: "N", yahooSymbol: "^GSPC" },
  { id: "nasdaq", category: "indices", name: "NASDAQ", symbol: "COMP", unit: "pt", division: "N", yahooSymbol: "^IXIC" },
  { id: "dow", category: "indices", name: "다우존스", symbol: ".DJI", unit: "pt", division: "N", yahooSymbol: "^DJI" },
  { id: "nikkei", category: "indices", name: "닛케이 225", symbol: "JP#NI225", unit: "pt", division: "N", yahooSymbol: "^N225" },
  { id: "hangseng", category: "indices", name: "항셍", symbol: "HK#HS", unit: "pt", division: "N", yahooSymbol: "^HSI" },
  { id: "shanghai", category: "indices", name: "상하이 종합", symbol: "CH#SHA", unit: "pt", division: "N", yahooSymbol: "000001.SS" },
  { id: "dax", category: "indices", name: "독일 DAX", symbol: "GR#DAX", unit: "pt", division: "N", yahooSymbol: "^GDAXI" },
  { id: "stoxx50", category: "indices", name: "유로 STOXX 50", symbol: "SX5E", unit: "pt", division: "N", yahooSymbol: "^STOXX50E" },
  { id: "usdkrw", category: "fx", name: "USD/KRW", symbol: "FX@KRW", unit: "원", division: "X", yahooSymbol: "KRW=X" },
  { id: "eurusd", category: "fx", name: "EUR/USD", symbol: "FX@EUR", unit: "달러", division: "X", yahooSymbol: "EURUSD=X" },
  { id: "usdjpy", category: "fx", name: "USD/JPY", symbol: "FX@JPY", unit: "엔", division: "X", yahooSymbol: "JPY=X" },
  { id: "usdcny", category: "fx", name: "USD/CNY", symbol: "FX@CNY", unit: "위안", division: "X", yahooSymbol: "CNY=X" },
  { id: "gold", category: "commodities", name: "금", symbol: "NYGOLD", unit: "USD/oz", division: "N", yahooSymbol: "GC=F" },
  { id: "silver", category: "commodities", name: "은", symbol: "M0102", unit: "USD/oz", division: "S", yahooSymbol: "SI=F" },
  { id: "wti", category: "commodities", name: "WTI 원유", symbol: "WTIF", unit: "USD/bbl", division: "N", yahooSymbol: "CL=F" },
  { id: "brent", category: "commodities", name: "브렌트유", symbol: "BRENTF", unit: "USD/bbl", division: "N", yahooSymbol: "BZ=F" },
  { id: "copper", category: "commodities", name: "구리", symbol: "M0203", unit: "USD/lb", division: "S", yahooSymbol: "HG=F" },
];

const CRYPTO_DEFINITIONS = [
  { id: "bitcoin", name: "비트코인", market: "KRW-BTC", symbol: "BTC/KRW" },
  { id: "ethereum", name: "이더리움", market: "KRW-ETH", symbol: "ETH/KRW" },
  { id: "xrp", name: "XRP", market: "KRW-XRP", symbol: "XRP/KRW" },
  { id: "solana", name: "솔라나", market: "KRW-SOL", symbol: "SOL/KRW" },
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startDateBefore(endDate: Date, days: number): string {
  const start = new Date(endDate);
  start.setUTCDate(start.getUTCDate() - days);
  return isoDate(start);
}

function sourceLabel(source: MarketDataSource): string {
  if (source === "KIS") return "한국투자증권";
  if (source === "Upbit") return "업비트 공개시세";
  return "Yahoo 보조시세";
}

function toInstrument(
  definition: MarketDefinition,
  overview: KisMarketOverview,
  updatedAt: string,
  source: MarketDataSource = "KIS",
  status: MarketInstrument["status"] = "ok"
): MarketInstrument {
  return {
    id: definition.id,
    category: definition.category,
    name: definition.name,
    symbol: definition.symbol,
    price: overview.price,
    changeAmount: overview.changeAmount,
    changeRate: overview.changeRate,
    unit: definition.unit,
    source,
    sourceLabel: sourceLabel(source),
    asOfDate: overview.asOfDate,
    updatedAt,
    points: overview.points,
    status,
  };
}

async function fetchYahooFallback(
  definition: MarketDefinition,
  startDate: string,
  updatedAt: string
): Promise<MarketInstrument | null> {
  if (!definition.yahooSymbol) return null;
  try {
    const period1 = new Date(`${startDate}T00:00:00Z`);
    const [quote, chart] = await Promise.all([
      yahooFinance.quote(definition.yahooSymbol),
      yahooFinance.chart(definition.yahooSymbol, { period1, interval: "1d" }),
    ]);
    const price = quote.regularMarketPrice;
    if (typeof price !== "number" || price <= 0) return null;
    const points = chart.quotes
      .filter((row) => row.date instanceof Date && typeof row.close === "number" && row.close > 0)
      .map((row) => ({ date: isoDate(row.date), value: row.close as number }))
      .sort((left, right) => left.date.localeCompare(right.date));

    return {
      id: definition.id,
      category: definition.category,
      name: definition.name,
      symbol: definition.yahooSymbol,
      price,
      changeAmount: typeof quote.regularMarketChange === "number" ? quote.regularMarketChange : 0,
      changeRate: typeof quote.regularMarketChangePercent === "number" ? quote.regularMarketChangePercent : 0,
      unit: definition.unit,
      source: "Yahoo",
      sourceLabel: sourceLabel("Yahoo"),
      asOfDate: points.at(-1)?.date,
      updatedAt,
      points,
      status: "fallback",
    };
  } catch {
    return null;
  }
}

async function fetchDefinition(
  definition: MarketDefinition,
  startDate: string,
  endDate: string,
  updatedAt: string
): Promise<MarketInstrument> {
  const fetchKis = () => definition.domesticCode
    ? fetchKISDomesticIndexOverview(definition.domesticCode, startDate, endDate)
    : fetchKISOverseasMarketOverview(definition.division ?? "N", definition.symbol, startDate, endDate);

  try {
    let overview: KisMarketOverview;
    try {
      overview = await fetchKis();
    } catch {
      await sleep(650);
      overview = await fetchKis();
    }
    const item = toInstrument(definition, overview, updatedAt);

    if (item.points.length === 0 && definition.yahooSymbol) {
      const fallback = await fetchYahooFallback(definition, startDate, updatedAt);
      if (fallback) {
        item.points = fallback.points;
        item.asOfDate = fallback.asOfDate;
        item.sourceLabel = "한국투자증권 현재가 · Yahoo 기간 추이";
        item.status = "fallback";
      }
    }
    return item;
  } catch (error: unknown) {
    const fallback = await fetchYahooFallback(definition, startDate, updatedAt);
    if (fallback) return fallback;
    return {
      id: definition.id,
      category: definition.category,
      name: definition.name,
      symbol: definition.symbol,
      price: null,
      changeAmount: null,
      changeRate: null,
      unit: definition.unit,
      source: "KIS",
      sourceLabel: sourceLabel("KIS"),
      updatedAt,
      points: [],
      status: "unavailable",
      error: error instanceof Error ? error.message : "시세를 가져오지 못했습니다.",
    };
  }
}

export function combineMarketTrendPoints(
  left: MarketTrendPoint[],
  right: MarketTrendPoint[],
  calculate: (leftValue: number, rightValue: number) => number
): MarketTrendPoint[] {
  const rightByDate = new Map(right.map((point) => [point.date, point.value]));
  return left.flatMap((point) => {
    const rightValue = rightByDate.get(point.date);
    if (!rightValue) return [];
    const value = calculate(point.value, rightValue);
    return Number.isFinite(value) && value > 0 ? [{ date: point.date, value }] : [];
  });
}

export function calculateCrossRate(
  kind: "eurkrw" | "jpykrw",
  usdKrw: number,
  crossRate: number
): number {
  if (!Number.isFinite(usdKrw) || !Number.isFinite(crossRate) || usdKrw <= 0 || crossRate <= 0) {
    throw new Error("교차환율 계산 값은 0보다 큰 숫자여야 합니다.");
  }
  return kind === "eurkrw" ? usdKrw * crossRate : (usdKrw / crossRate) * 100;
}

function derivedFxItem(
  id: "eurkrw" | "jpykrw",
  left: MarketInstrument,
  right: MarketInstrument,
  updatedAt: string
): MarketInstrument {
  const isEuro = id === "eurkrw";
  const points = combineMarketTrendPoints(
    left.points,
    right.points,
    (usdKrw, crossRate) => calculateCrossRate(id, usdKrw, crossRate)
  );
  const latest = points.at(-1)?.value ?? null;
  const previous = points.at(-2)?.value ?? null;
  const changeAmount = latest !== null && previous !== null ? latest - previous : null;
  const changeRate = changeAmount !== null && previous ? (changeAmount / previous) * 100 : null;
  const unavailable = latest === null;

  return {
    id,
    category: "fx",
    name: isEuro ? "EUR/KRW" : "JPY/KRW (100엔)",
    symbol: isEuro ? "FX@KRW × FX@EUR" : "FX@KRW ÷ FX@JPY",
    price: latest,
    changeAmount,
    changeRate,
    unit: "원",
    source: "KIS",
    sourceLabel: "한국투자증권 교차환율",
    asOfDate: points.at(-1)?.date,
    updatedAt,
    points,
    status: unavailable ? "unavailable" : "ok",
    error: unavailable ? "교차환율 계산에 필요한 데이터가 없습니다." : undefined,
  };
}

async function fetchUpbitMarkets(updatedAt: string): Promise<MarketInstrument[]> {
  const marketList = CRYPTO_DEFINITIONS.map((definition) => definition.market).join(",");
  try {
    const tickerResponse = await fetch(`https://api.upbit.com/v1/ticker?markets=${marketList}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!tickerResponse.ok) throw new Error(`Upbit 시세 조회 실패: HTTP ${tickerResponse.status}`);
    const tickers = await tickerResponse.json() as UpbitTicker[];
    const tickerByMarket = new Map(tickers.map((ticker) => [ticker.market, ticker]));

    return await Promise.all(CRYPTO_DEFINITIONS.map(async (definition) => {
      const ticker = tickerByMarket.get(definition.market);
      let points: MarketTrendPoint[] = [];
      try {
        const candleResponse = await fetch(
          `https://api.upbit.com/v1/candles/days?market=${definition.market}&count=30`,
          { cache: "no-store", headers: { Accept: "application/json" } }
        );
        if (candleResponse.ok) {
          const candles = await candleResponse.json() as UpbitCandle[];
          points = candles
            .filter((candle) => candle.candle_date_time_utc && typeof candle.trade_price === "number")
            .map((candle) => ({ date: candle.candle_date_time_utc!.slice(0, 10), value: candle.trade_price! }))
            .sort((left, right) => left.date.localeCompare(right.date));
        }
      } catch {
        points = [];
      }

      const price = typeof ticker?.trade_price === "number" ? ticker.trade_price : null;
      return {
        id: definition.id,
        category: "crypto" as const,
        name: definition.name,
        symbol: definition.symbol,
        price,
        changeAmount: typeof ticker?.signed_change_price === "number" ? ticker.signed_change_price : null,
        changeRate: typeof ticker?.signed_change_rate === "number" ? ticker.signed_change_rate * 100 : null,
        unit: "원",
        source: "Upbit" as const,
        sourceLabel: sourceLabel("Upbit"),
        asOfDate: ticker?.trade_timestamp ? isoDate(new Date(ticker.trade_timestamp)) : points.at(-1)?.date,
        updatedAt,
        points,
        status: price === null ? "unavailable" as const : "ok" as const,
        error: price === null ? "Upbit 공개 시세를 가져오지 못했습니다." : undefined,
      };
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upbit 시세를 가져오지 못했습니다.";
    return CRYPTO_DEFINITIONS.map((definition) => ({
      id: definition.id,
      category: "crypto",
      name: definition.name,
      symbol: definition.symbol,
      price: null,
      changeAmount: null,
      changeRate: null,
      unit: "원",
      source: "Upbit",
      sourceLabel: sourceLabel("Upbit"),
      updatedAt,
      points: [],
      status: "unavailable",
      error: message,
    }));
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker()));
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function collectMarketOverview(now = new Date()): Promise<MarketOverviewResponse> {
  const updatedAt = now.toISOString();
  const endDate = isoDate(now);
  const startDate = startDateBefore(now, 45);
  const marketItems = await mapWithConcurrency(
    MARKET_DEFINITIONS,
    1,
    async (definition) => {
      const item = await fetchDefinition(definition, startDate, endDate, updatedAt);
      await sleep(120);
      return item;
    }
  );
  const usdKrw = marketItems.find((item) => item.id === "usdkrw");
  const eurUsd = marketItems.find((item) => item.id === "eurusd");
  const usdJpy = marketItems.find((item) => item.id === "usdjpy");
  const derivedItems: MarketInstrument[] = [];
  if (usdKrw && eurUsd) derivedItems.push(derivedFxItem("eurkrw", usdKrw, eurUsd, updatedAt));
  if (usdKrw && usdJpy) derivedItems.push(derivedFxItem("jpykrw", usdKrw, usdJpy, updatedAt));
  const cryptoItems = await fetchUpbitMarkets(updatedAt);
  const items = [...marketItems, ...derivedItems, ...cryptoItems];
  const unavailableCount = items.filter((item) => item.status === "unavailable").length;

  return {
    items,
    updatedAt,
    partial: unavailableCount > 0,
    unavailableCount,
  };
}
