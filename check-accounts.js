const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  const { data } = await supabase
    .from("assets")
    .select("id, name, account_name, asset_type")
    .or("account_name.ilike.%미래에셋%,account_name.ilike.%NH%")
    .order("id", { ascending: false })
    .limit(20);

  console.log("미래에셋 & NH 계좌 항목:");
  data?.forEach(a => {
    console.log(`  [${a.id}] ${a.account_name} | ${a.name}`);
  });
})();
