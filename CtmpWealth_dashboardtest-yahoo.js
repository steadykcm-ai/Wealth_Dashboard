const yahooFinance = require('yahoo-finance2').default;

async function testYahooFinance() {
  const codes = ['005380.KS', '008700.KS'];

  console.log('Testing Yahoo Finance with Korean stocks...\n');

  for (const code of codes) {
    try {
      console.log(`Fetching ${code}...`);
      const quote = await yahooFinance.quote(code);
      console.log(`✅ ${code}: ${quote.regularMarketPrice}`);
      console.log(`   Currency: ${quote.currency}, Name: ${quote.longName}\n`);
    } catch (err) {
      console.error(`❌ ${code}: ${err.message}\n`);
    }
  }
}

testYahooFinance();
