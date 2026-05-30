const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  const { data } = await supabase
    .from("assets")
    .select("id, name, account_name, asset_type, is_cash")
    .ilike("account_name", "%키움%");

  console.log("키움_종합 assets:");
  data?.forEach(a => {
    console.log(`  [${a.id}] ${a.name} | type: ${a.asset_type} | is_cash: ${a.is_cash}`);
  });
})();
