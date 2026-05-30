const YahooFinance = require('yahoo-finance2').default;

async function test() {
  const yahooFinance = new YahooFinance();
  console.log('Testing Yahoo Finance2 with Korean stocks...\n');

  const symbols = ['005380.KS', '008700.KS'];

  for (const symbol of symbols) {
    try {
      console.log(`Fetching ${symbol}...`);
      const quote = await yahooFinance.quote(symbol);

      if (quote.regularMarketPrice) {
        console.log(`OK: ${symbol} = ${quote.regularMarketPrice}\n`);
      } else {
        console.log(`No price data for ${symbol}\n`);
      }
    } catch (err) {
      console.log(`ERROR ${symbol}: ${err.message}\n`);
    }
  }
}

test();
