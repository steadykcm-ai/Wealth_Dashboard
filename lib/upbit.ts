async function fetchBatch(markets: string): Promise<Record<string, number>> {
  const res = await fetch(
    `https://api.upbit.com/v1/ticker?markets=${markets}`,
    { cache: "no-store" }
  );
  if (!res.ok) return {};
  const json = await res.json();
  if (!Array.isArray(json)) return {};
  return Object.fromEntries(
    (json as Array<{ market: string; trade_price: number }>)
      .map((item) => [item.market.replace("KRW-", ""), item.trade_price])
  );
}

export async function fetchUpbitPrices(
  tickers: string[]
): Promise<Record<string, number>> {
  if (tickers.length === 0) return {};

  const markets = tickers.map((t) => `KRW-${t.toUpperCase()}`).join(",");
  const result = await fetchBatch(markets);

  // 배치 성공 시 바로 반환
  if (Object.keys(result).length > 0) return result;

  // 실패 시 개별 요청으로 fallback (상장폐지 종목 건너뜀)
  const individual: Record<string, number> = {};
  for (const ticker of tickers) {
    const r = await fetchBatch(`KRW-${ticker.toUpperCase()}`);
    Object.assign(individual, r);
    await new Promise((res) => setTimeout(res, 120));
  }
  return individual;
}

export function extractUpbitTicker(raw: string): string {
  // "CURRENCY:BTCKRW" → "BTC"
  const match = raw.match(/^CURRENCY:([A-Z]+)KRW$/i);
  if (match) return match[1].toUpperCase();
  return raw.toUpperCase();
}
