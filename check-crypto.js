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
  process.env.SUPABASE_PUBLISHABLE_KEY
);

async function check() {
  const { data, error } = await supabase
    .from("crypto_assets")
    .select("*")
    .eq("is_cash", false);

  console.log("=== crypto_assets 테이블 ===\n");
  
  if (error) {
    console.error("에러:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("❌ 암호화폐 자산이 없습니다");
    return;
  }

  console.log(`✓ ${data.length}개 자산 있음\n`);
  data.forEach(asset => {
    console.log(`${asset.name} (${asset.ticker}) - ${asset.exchange}`);
  });
}

check();
