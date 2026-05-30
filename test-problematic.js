const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance();

async function test() {
  const problematic = [
    ['SFA반도체', '036540'],
    ['로보티즈', '108490'],
  ];

  for (const [name, code] of problematic) {
    console.log(`\n${name} (${code}):`);

    // .KS 테스트
    try {
      const q = await yf.quote(`${code}.KS`);
      console.log(`  .KS: ${q.regularMarketPrice} - ${q.longName}`);
    } catch (e) {
      console.log(`  .KS: ERROR`);
    }

    // .KQ 테스트
    try {
      const q = await yf.quote(`${code}.KQ`);
      console.log(`  .KQ: ${q.regularMarketPrice} - ${q.longName}`);
    } catch (e) {
      console.log(`  .KQ: ERROR`);
    }
  }
}

test();
