const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance();

async function check() {
  const codes = [
    "323990.KS",
    "323990.KQ", 
    "323990",
  ];
  
  console.log("=== 박셀바이오 가격 확인 ===\n");
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
