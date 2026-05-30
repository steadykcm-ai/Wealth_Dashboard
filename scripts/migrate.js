const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://yobchugjndnnkwogocsd.supabase.co";
const SUPABASE_ADMIN_KEY = "sb_secret_2WpTpn6dIp_hmh4Q3ovNrQ_YQJVVfeN";
const USER_ID = "56701cc8-3dff-405d-a2b7-1ff4301e92cc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY);

async function migrate() {
  console.log("시작: user_id 마이그레이션\n");

  try {
    // 1. assets 테이블 업데이트
    console.log("1️⃣ assets 테이블 업데이트 중...");
    const { error: assetsError } = await supabase
      .from("assets")
      .update({ user_id: USER_ID })
      .is("user_id", null);

    if (assetsError) throw assetsError;
    console.log("   ✓ assets 테이블 업데이트 완료\n");

    // 2. cash 테이블 업데이트
    console.log("2️⃣ cash 테이블 업데이트 중...");
    const { error: cashError } = await supabase
      .from("cash")
      .update({ user_id: USER_ID })
      .is("user_id", null);

    if (cashError) throw cashError;
    console.log("   ✓ cash 테이블 업데이트 완료\n");

    // 3. daily_log 테이블 업데이트
    console.log("3️⃣ daily_log 테이블 업데이트 중...");
    const { error: dailyLogError } = await supabase
      .from("daily_log")
      .update({ user_id: USER_ID })
      .is("user_id", null);

    if (dailyLogError) throw dailyLogError;
    console.log("   ✓ daily_log 테이블 업데이트 완료\n");

    console.log("✅ 마이그레이션 성공!\n");
    console.log("다음 단계:");
    console.log("1. Supabase Dashboard에서 assets, cash, daily_log 테이블의 user_id 컬럼 추가 확인");
    console.log("2. npm run dev로 앱 실행");
    console.log("3. 구글 로그인 후 데이터가 정상적으로 표시되는지 확인");
  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    process.exit(1);
  }
}

migrate();
