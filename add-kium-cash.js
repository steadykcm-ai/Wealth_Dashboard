const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from("cash")
    .insert([{ account_name: "키움_종합(3851)", amount: 0 }])
    .select();

  if (error) {
    console.error("삽입 실패:", error);
  } else {
    console.log("키움_종합 현금 추가됨:", data);
  }

  // 확인
  const { data: allCash } = await supabase.from("cash").select("*").order("id");
  console.log("\n업데이트된 cash 테이블:", allCash);
})();
