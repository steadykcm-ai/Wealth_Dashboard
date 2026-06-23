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
  const kisPrice = await fetchKISPrice(code);
  if (kisPrice) return kisPrice;

  const kospiPrice = await fetchYahooPrice(`${code}.KS`);
  if (kospiPrice) return kospiPrice;
  return fetchYahooPrice(`${code}.KQ`);
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

  const pricePromises = validCodes.map((code) => {
    const domesticCode = normalizeDomesticCode(code);
    if (domesticCode) {
      return fetchDomesticPrice(domesticCode);
    }
    return fetchYahooPrice(code);
  });

  const results = await Promise.all(pricePromises);
  results.forEach((price, index) => {
    if (price) {
      prices[validCodes[index]] = price;
    }
  });

  return prices;
}
