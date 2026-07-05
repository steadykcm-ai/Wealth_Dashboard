import YahooFinance from "yahoo-finance2";
import { fetchKISPrice } from "@/lib/kis-client";

const yahooFinance = new YahooFinance();

function normalizeDomesticCode(code: string): string | null {
  const match = code.match(/\d{6}/);
  return match ? match[0] : null;
}

async function fetchYahooPrice(code: string): Promise<number | null> {
  try {
    const quote = await yahooFinance.quote(code);
    const price = quote.regularMarketPrice;
    if (typeof price === "number" && price > 0) {
      return price;
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function fetchDomesticPrice(code: string): Promise<number | null> {
  return fetchKISPrice(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchStockPrices(
  codes: string[]
): Promise<Record<string, number>> {
  if (codes.length === 0) return {};

  const validCodes = codes.filter((c) => c && typeof c === "string");
  if (validCodes.length === 0) {
    return {};
  }

  const prices: Record<string, number> = {};
  const yahooRequests: Array<Promise<void>> = [];

  for (const code of validCodes) {
    const domesticCode = normalizeDomesticCode(code);
    if (domesticCode) {
      const price = await fetchDomesticPrice(domesticCode);
      if (price) {
        prices[code] = price;
      }
      await sleep(150);
    } else {
      yahooRequests.push(
        fetchYahooPrice(code).then((price) => {
          if (price) {
            prices[code] = price;
          }
        })
      );
    }
  }

  await Promise.all(yahooRequests);

  return prices;
}
