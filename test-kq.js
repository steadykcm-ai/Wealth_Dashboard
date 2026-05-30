const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance();

async function test() {
  const codes = [
    ['SFA반도체', '036540.KQ'],
    ['로보티즈', '108490.KQ'],
    ['로보티즈', '108490.KS'],
  ];

  for (const [name, code] of codes) {
    try {
      const q = await yf.quote(code);
      console.log(`${name} (${code}): ${q.regularMarketPrice} - ${q.longName}`);
    } catch (e) {
      console.log(`${name} (${code}): ERROR`);
    }
  }
}

test();
