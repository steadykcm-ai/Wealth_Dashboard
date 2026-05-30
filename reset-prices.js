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

async function resetPrices() {
  console.log("prices 테이블 삭제 중...");
  const { error: deleteError } = await supabase
    .from("prices")
    .delete()
    .gt("updated_at", "2000-01-01");

  if (deleteError) {
    console.error("삭제 오류:", deleteError);
    return;
  }

  console.log("✓ prices 테이블 초기화 완료");
}

resetPrices();
