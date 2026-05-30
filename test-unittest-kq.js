const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance();

async function test() {
  const codes = ["086390.KS", "086390.KQ", "086390"];
  
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
