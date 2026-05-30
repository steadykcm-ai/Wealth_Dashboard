const YahooFinance = require('yahoo-finance2').default;

async function test() {
  const yahooFinance = new YahooFinance();

  const codesToTest = ['008700.KS', '000660.KS', '005380.KS'];

  for (const code of codesToTest) {
    try {
      const quote = await yahooFinance.quote(code);
      console.log(`${code}:`);
      console.log(`  longName: ${quote.longName}`);
      console.log(`  price: ${quote.regularMarketPrice}`);
      console.log(`  symbol: ${quote.symbol}`);
    } catch (err) {
      console.log(`${code}: ERROR - ${err.message}`);
    }
  }
}

test();
