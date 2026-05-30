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

async function update() {
  console.log("prices 테이블 초기화 중...");
  await supabase
    .from("prices")
    .delete()
    .gt("updated_at", "2000-01-01");
  console.log("✓ 초기화 완료\n");
  
  const response = await fetch("http://localhost:3000/api/cron/update-prices");
  const result = await response.json();
  
  console.log(`✓ 가격 갱신: ${result.updated}개\n`);
  
  // 수정된 항목들 확인
  const { data: cheonbo } = await supabase
    .from("prices")
    .select("*")
    .eq("code", "278280.KQ");
  
  const { data: jeju } = await supabase
    .from("prices")
    .select("*")
    .eq("code", "080220.KQ");
  
  if (cheonbo && cheonbo.length > 0) {
    console.log(`천보(278280.KQ): ${cheonbo[0].price}`);
  }
  if (jeju && jeju.length > 0) {
    console.log(`제주반도체(080220.KQ): ${jeju[0].price}`);
  }
}

update();
