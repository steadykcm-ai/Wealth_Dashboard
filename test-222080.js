const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance();

async function test() {
  const codes = ["222080", "222080.KS"];
  
  for (const code of codes) {
    try {
      const quote = await yahooFinance.quote(code);
      console.log(`✓ ${code}: ${quote.regularMarketPrice}`);
    } catch (err) {
      console.log(`✗ ${code}: 실패`);
    }
  }
}

test();
