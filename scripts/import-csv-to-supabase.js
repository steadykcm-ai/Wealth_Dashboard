const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.local") });

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("환경변수 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY 필요");
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const header = lines[0].split(",").map(h => h.trim());

  return lines.slice(1).map(line => {
    // CSV에서 따옴표 안의 쉼표 처리
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim().replace(/"/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/"/g, ""));

    const row = {};
    header.forEach((key, i) => {
      row[key] = values[i] || "";
    });
    return row;
  });
}

function cleanNumber(str) {
  return parseFloat(String(str).replace(/,/g, "")) || 0;
}

function mapAssetType(type) {
  const map = {
    "국내주식": "개별주식",
    "연금": "개인연금",
    "IRP": "개인연금",
  };
  return map[type] || type;
}

async function importAssets() {
  console.log("📊 Asset CSV 파싱...");

  const assetsData = parseCSV(path.join(__dirname, "..", "Pension kcm - Assets.csv"));
  console.log(`  → ${assetsData.length}개 레코드 파싱됨`);

  const assetRecords = assetsData
    .filter(row => row["종목명"] && row["수량"] && row["매입가"])
    .map(row => ({
      asset_type: mapAssetType(row["자산유형"]),
      account_name: row["계좌명"],
      name: row["종목명"],
      code: row["코드"] || null,
      quantity: cleanNumber(row["수량"]),
      avg_price: cleanNumber(row["매입가"]),
      is_cash: false,
    }));

  console.log(`  → ${assetRecords.length}개 유효 레코드`);
  console.log("  샘플:", assetRecords[0]);

  // 기존 데이터 삭제
  const { error: deleteError } = await supabase.from("assets").delete().neq("id", 0);
  if (deleteError) console.warn("  ⚠️ 기존 데이터 삭제 경고:", deleteError.message);
  else console.log("  기존 assets 테이블 초기화됨");

  // 데이터 삽입
  const { error: insertError } = await supabase.from("assets").insert(assetRecords);
  if (insertError) {
    console.error("  ❌ 삽입 실패:", insertError.message);
    return false;
  }

  console.log(`  ✅ ${assetRecords.length}개 Asset 데이터 삽입 완료`);
  return true;
}

async function importCash() {
  console.log("\n💰 Cash CSV 파싱...");

  const cashData = parseCSV(path.join(__dirname, "..", "Pension kcm - Cash.csv"));
  console.log(`  → ${cashData.length}개 레코드 파싱됨`);

  const cashRecords = cashData
    .filter(row => row["계좌"] && row["현금"])
    .map(row => ({
      account_name: row["계좌"],
      amount: cleanNumber(row["현금"]),
    }));

  console.log(`  → ${cashRecords.length}개 유효 레코드`);
  console.log("  샘플:", cashRecords[0]);

  // 기존 데이터 삭제
  const { error: deleteError } = await supabase.from("cash").delete().neq("id", 0);
  if (deleteError) console.warn("  ⚠️ 기존 데이터 삭제 경고:", deleteError.message);
  else console.log("  기존 cash 테이블 초기화됨");

  // 데이터 삽입
  const { error: insertError } = await supabase.from("cash").insert(cashRecords);
  if (insertError) {
    console.error("  ❌ 삽입 실패:", insertError.message);
    return false;
  }

  console.log(`  ✅ ${cashRecords.length}개 Cash 데이터 삽입 완료`);
  return true;
}

async function main() {
  console.log("🚀 CSV → Supabase 데이터 가져오기 시작\n");

  try {
    const assetsOk = await importAssets();
    const cashOk = await importCash();

    if (assetsOk && cashOk) {
      console.log("\n✅ 모든 데이터 가져오기 완료!");
    } else {
      console.log("\n⚠️ 일부 데이터 가져오기 실패");
    }
    process.exit(0);
  } catch (error) {
    console.error("❌ 오류:", error.message);
    process.exit(1);
  }
}

main();
