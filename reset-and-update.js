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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_API_KEY
);

async function resetAndUpdate() {
  console.log("prices 테이블 초기화 중...");
  await supabase
    .from("prices")
    .delete()
    .gt("updated_at", "2000-01-01");

  console.log("✓ 초기화 완료\n");
  
  // API 호출로 갱신
  const response = await fetch("http://localhost:3000/api/cron/update-prices");
  const result = await response.json();
  
  console.log("가격 갱신 결과:");
  console.log(`  업데이트: ${result.updated}개`);
  console.log(`  프로텍(053610.KQ): ${result.debug.protec_price || 'N/A'}`);
}

resetAndUpdate();
