const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
envContent.split("\n").forEach(line => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length > 0) {
    process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
});

const { createClient } = require("@supabase/supabase-js");
const YahooFinance = require("yahoo-finance2").default;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);
const yahooFinance = new YahooFinance();

async function check() {
  // Supabase에서 프로텍 데이터 가져오기
  const { data } = await supabase
    .from("assets")
    .select("*")
    .eq("name", "프로텍");

  console.log("\n=== Supabase 프로텍 정보 ===");
  if (data && data.length > 0) {
    const protec = data[0];
    console.log(`코드: ${protec.code}`);
    console.log(`종목명: ${protec.name}`);
    console.log(`평균매입가: ${protec.avg_price}`);
  }

  // Yahoo에서 가격 확인
  const codes = ["053610", "053610.KS", "053610.KQ"];
  
  console.log("\n=== Yahoo 가격 확인 ===");
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
