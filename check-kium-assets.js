const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  // 키움 종합의 모든 assets
  const { data: allKium } = await supabase
    .from("assets")
    .select("id, name, account_name, is_cash");
  
  const kiumAssets = allKium?.filter(a => a.account_name?.includes("키움"));
  console.log("키움_종합 모든 assets:");
  kiumAssets?.forEach(a => {
    console.log(`  [${a.id}] ${a.name} | is_cash: ${a.is_cash}`);
  });

  // 쿼리에 필터링된 assets (is_cash = false)
  const { data: filtered } = await supabase
    .from("assets")
    .select("id, name, account_name, is_cash")
    .eq("is_cash", false)
    .ilike("account_name", "%키움%");

  console.log("\nis_cash=false 필터링 후 키움 assets:");
  filtered?.forEach(a => {
    console.log(`  [${a.id}] ${a.name}`);
  });
})();
