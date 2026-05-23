const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.local") });

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("환경변수 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY 필요");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedDatabase() {
  console.log("🚀 API를 통해 데이터를 가져와 Supabase에 저장합니다\n");

  try {
    // GET /api/assets
    console.log("📊 /api/assets에서 자산 데이터 조회...");
    const assetsRes = await fetch("http://localhost:3001/api/assets");
    if (!assetsRes.ok) throw new Error(`API 에러: ${assetsRes.status}`);
    const assetsData = await assetsRes.json();

    // assets 테이블에 삽입
    if (assetsData.summary && assetsData.summary.groups) {
      const assetRecords = [];

      for (const group of assetsData.summary.groups) {
        for (const account of group.accounts) {
          for (const item of account.items) {
            assetRecords.push({
              asset_type: group.category,
              account_name: account.name,
              name: item.name,
              code: item.name, // 혹은 item.code if available
              quantity: item.quantity,
              avg_price: item.avgPrice,
              is_cash: false,
            });
          }
          // 현금도 추가
          if (account.cash && account.cash > 0) {
            assetRecords.push({
              asset_type: group.category,
              account_name: account.name,
              name: "현금",
              code: null,
              quantity: account.cash,
              avg_price: 1,
              is_cash: true,
            });
          }
        }
      }

      if (assetRecords.length > 0) {
        console.log(`  → ${assetRecords.length}개 자산 레코드 삽입...`);
        const { error } = await supabase.from("assets").insert(assetRecords);
        if (error) {
          console.error("  ❌ 삽입 실패:", error.message);
        } else {
          console.log("  ✅ 자산 데이터 삽입 완료");
        }
      }
    }

    // GET /api/crypto
    console.log("\n📊 /api/crypto에서 암호화폐 데이터 조회...");
    const cryptoRes = await fetch("http://localhost:3001/api/crypto");
    if (!cryptoRes.ok) throw new Error(`Crypto API 에러: ${cryptoRes.status}`);
    const cryptoData = await cryptoRes.json();

    // crypto_assets 테이블에 삽입
    if (cryptoData.exchanges) {
      const cryptoRecords = [];

      for (const exchange of cryptoData.exchanges) {
        for (const item of exchange.items) {
          cryptoRecords.push({
            exchange: exchange.exchange,
            name: item.name,
            ticker: item.name, // 혹은 ticker if available
            quantity: item.quantity,
            avg_price: item.avgPrice,
            is_cash: false,
          });
        }
        // 현금 추가
        if (exchange.cash && exchange.cash > 0) {
          cryptoRecords.push({
            exchange: exchange.exchange,
            name: "현금",
            ticker: "CASH",
            quantity: exchange.cash,
            avg_price: 1,
            is_cash: true,
          });
        }
      }

      if (cryptoRecords.length > 0) {
        console.log(`  → ${cryptoRecords.length}개 암호화폐 레코드 삽입...`);
        const { error } = await supabase
          .from("crypto_assets")
          .insert(cryptoRecords);
        if (error) {
          console.error("  ❌ 삽입 실패:", error.message);
        } else {
          console.log("  ✅ 암호화폐 데이터 삽입 완료");
        }
      }
    }

    // GET /api/profits
    console.log("\n📊 /api/profits에서 수익 데이터 조회...");
    const profitsRes = await fetch("http://localhost:3001/api/profits");
    if (!profitsRes.ok) throw new Error(`Profits API 에러: ${profitsRes.status}`);
    const profitsData = await profitsRes.json();

    if (profitsData.data) {
      const dailyRecords = profitsData.data.map((item) => ({
        date: item.date,
        total_invest: item.total.invest || 0,
        total_value: item.total.value || 0,
        total_profit: item.total.profit || 0,
        total_cash: item.total.total - item.total.value || 0,
        stocks_invest: item.stocks?.invest || 0,
        stocks_value: item.stocks?.value || 0,
        stocks_profit: item.stocks?.profit || 0,
        stocks_cash: item.stocks?.total - item.stocks?.value || 0,
        pension_invest: item.pension?.invest || 0,
        pension_value: item.pension?.value || 0,
        pension_profit: item.pension?.profit || 0,
        pension_cash: item.pension?.total - item.pension?.value || 0,
        irp_invest: item.irp?.invest || 0,
        irp_value: item.irp?.value || 0,
        irp_profit: item.irp?.profit || 0,
        irp_cash: item.irp?.total - item.irp?.value || 0,
        blockchain_invest: item.blockchain?.invest || 0,
        blockchain_value: item.blockchain?.value || 0,
        blockchain_profit: item.blockchain?.profit || 0,
        blockchain_cash: item.blockchain?.total - item.blockchain?.value || 0,
      }));

      if (dailyRecords.length > 0) {
        console.log(`  → ${dailyRecords.length}개 일일 수익 레코드 삽입...`);
        const { error } = await supabase
          .from("daily_log")
          .upsert(dailyRecords, { onConflict: "date" });
        if (error) {
          console.error("  ❌ 삽입 실패:", error.message);
        } else {
          console.log("  ✅ 일일 수익 데이터 삽입 완료");
        }
      }
    }

    console.log("\n✅ 데이터베이스 시드 완료!");
    process.exit(0);
  } catch (error) {
    console.error("❌ 실패:", error.message);
    process.exit(1);
  }
}

seedDatabase();
