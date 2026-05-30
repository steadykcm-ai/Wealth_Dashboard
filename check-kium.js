const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  // assets에서 "키움" 계정 찾기
  const { data: assets } = await supabase
    .from("assets")
    .select("account_name, id")
    .ilike("account_name", "%키움%");

  console.log("Assets에서 키움 계정명들:", assets);

  // cash 테이블 확인
  const { data: cash } = await supabase.from("cash").select("*");
  console.log("\n현재 cash 테이블:", cash);

  // "키움 종합"이 cash에 있는지 확인
  const kiumCash = cash?.find(c => c.account_name?.includes("키움"));
  console.log("\n키움 현금 항목:", kiumCash || "없음");
})();
