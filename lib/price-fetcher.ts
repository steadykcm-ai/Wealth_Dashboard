import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

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

export async function fetchStockPrices(
  codes: string[]
): Promise<Record<string, number>> {
  if (codes.length === 0) return {};

  const validCodes = codes.filter((c) => c && typeof c === "string");
  if (validCodes.length === 0) {
    return {};
  }

  const prices: Record<string, number> = {};

  const yahooFormattedCodes = validCodes.map(code => {
    // Convert Korean stock codes (6 digits) to Yahoo Finance format (code.KS or code.KQ)
    if (/^\d{6}$/.test(code)) {
      return `${code}.KS`; // Default to KOSPI
    }
    // If code already has .KS or .KQ, use as-is
    return code;
  });

  const pricePromises = yahooFormattedCodes.map(code => fetchYahooPrice(code));
  const results = await Promise.all(pricePromises);
  results.forEach((price, index) => {
    if (price) {
      prices[validCodes[index]] = price;
    }
  });

  return prices;
}
