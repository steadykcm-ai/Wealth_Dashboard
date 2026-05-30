const YahooFinance = require("yahoo-finance2").default;

const testCodes = [
  { name: "씨아이에스", code: "003850" },
  { name: "씨아이에스", code: "088980" },
  { name: "씨아이에스", code: "348060" },
];

const yahooFinance = new YahooFinance();

async function testCode(name, code) {
  try {
    const yahooCode = /^\d{6}$/.test(code) ? `${code}.KS` : code;
    const quote = await yahooFinance.quote(yahooCode);
    console.log(`✓ ${name} (${code}): ${quote.regularMarketPrice}`);
  } catch (err) {
    console.log(`✗ ${name} (${code}): 실패`);
  }
}

(async () => {
  for (const test of testCodes) {
    await testCode(test.name, test.code);
  }
})();
