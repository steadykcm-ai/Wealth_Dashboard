import { fetchKISPrice } from "@/lib/kis-client";

export async function fetchStockPrices(
  codes: string[]
): Promise<Record<string, number>> {
  if (codes.length === 0) return {};

  const validCodes = codes.filter((c) => c && typeof c === "string");
  if (validCodes.length === 0) {
    return {};
  }

  const prices: Record<string, number> = {};

  for (const code of validCodes) {
    const price = await fetchKISPrice(code);
    if (price) {
      prices[code] = price;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return prices;
}
