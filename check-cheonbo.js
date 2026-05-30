const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance();

async function check() {
  const codes = [
    "278280.KS",
    "278280.KQ",
    "278280",
  ];
  
  console.log("=== 천보 가격 확인 ===\n");
  for (const code of codes) {
    try {
      const quote = await yahooFinance.quote(code);
      console.log(`${code}: ${quote.regularMarketPrice}`);
    } catch (err) {
      console.log(`${code}: 실패`);
    }
  }
}

check();
