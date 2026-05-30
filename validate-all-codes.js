const fs = require("fs");
const path = require("path");

// .env.local 파일 수동 로드
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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const yahooFinance = new YahooFinance();

async function validateCode(code) {
  if (!code) return { code, status: "empty" };
  
  try {
    const quote = await yahooFinance.quote(code);
    return { code, status: "ok", price: quote.regularMarketPrice };
  } catch (err) {
    return { code, status: "fail" };
  }
}

async function main() {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, name, code")
    .eq("is_cash", false)
    .order("name");

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`\n검증 중... (${assets.length}개 종목)\n`);

  const results = [];
  for (const asset of assets) {
    const result = await validateCode(asset.code);
    results.push({ ...asset, ...result });
    
    const icon = result.status === "ok" ? "✓" : result.status === "fail" ? "✗" : "⚠";
    console.log(`${icon} ${asset.name.padEnd(20)} | ${(asset.code || "").padEnd(15)}`);
  }

  console.log("\n=== 요약 ===");
  const ok = results.filter(r => r.status === "ok").length;
  const fail = results.filter(r => r.status === "fail").length;
  
  console.log(`성공: ${ok}, 실패: ${fail}`);

  if (fail > 0) {
    console.log("\n❌ 실패한 종목들:");
    results.filter(r => r.status === "fail").forEach(r => {
      console.log(`  - ${r.name}: ${r.code}`);
    });
  }
}

main();
