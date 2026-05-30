const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  const { data } = await supabase
    .from("assets")
    .select("id, name, account_name, asset_type, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("최근 추가된 종목들:");
  data?.forEach(a => {
    const date = new Date(a.created_at).toLocaleString('ko-KR');
    console.log(`  [${a.id}] ${date} | ${a.account_name} | ${a.name}`);
  });
})();
