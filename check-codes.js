const { createClient } = require("@supabase/supabase-js");
const YahooFinance = require("yahoo-finance2").default;

const supabase = createClient(
  "https://yobchugjndnnkwogocsd.supabase.co",
  "sb_secret_2WpTpn6dIp_hmh4Q3ovNrQ_YQJVVfeN"
);

const yahooFinance = new YahooFinance();

async function checkCodes() {
  console.log("Supabase에서 모든 자산 조회 중...\n");

  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, name, code")
    .eq("is_cash", false)
    .order("name");

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }

  console.log("종목별 코드 현황:");
  console.log("=".repeat(60));

  for (const asset of assets) {
    try {
      const yahooCode = /^\d{6}$/.test(asset.code) ? `${asset.code}.KS` : asset.code;
      const quote = await yahooFinance.quote(yahooCode);

      const match = quote.longName === asset.name ? "✓" : "✗";
      console.log(`${match} ${asset.name.padEnd(20)} | DB: ${asset.code} | Yahoo: ${quote.longName}`);
    } catch (err) {
      console.log(`✗ ${asset.name.padEnd(20)} | DB: ${asset.code} | ERROR: 조회 실패`);
    }
  }

  process.exit(0);
}

checkCodes();
