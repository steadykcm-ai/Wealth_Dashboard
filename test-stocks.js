const YahooFinance = require("yahoo-finance2").default;

const testCodes = [
  { name: "SK하이닉스", codes: ["000660", "000660.KS"] },
  { name: "유니테스트", codes: ["054090", "054090.KS"] },
];

const yahooFinance = new YahooFinance();

async function testCode(name, codes) {
  console.log(`\n${name}:`);
  for (const code of codes) {
    try {
      const quote = await yahooFinance.quote(code);
      console.log(`  ✓ ${code}: ${quote.regularMarketPrice}`);
    } catch (err) {
      console.log(`  ✗ ${code}: 실패`);
    }
  }
}

(async () => {
  for (const test of testCodes) {
    await testCode(test.name, test.codes);
  }
})();
