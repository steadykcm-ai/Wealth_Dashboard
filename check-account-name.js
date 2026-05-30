const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  const { data: assets } = await supabase
    .from("assets")
    .select("account_name")
    .ilike("account_name", "%키움%");

  console.log("Assets 계정명들 (raw):");
  assets?.forEach((a, i) => {
    console.log(`  [${i}] "${a.account_name}" (length: ${a.account_name.length})`);
  });

  // cash의 키움 계정
  const { data: cash } = await supabase
    .from("cash")
    .select("account_name")
    .ilike("account_name", "%키움%");

  console.log("\nCash 계정명들 (raw):");
  cash?.forEach((c, i) => {
    console.log(`  [${i}] "${c.account_name}" (length: ${c.account_name.length})`);
  });

  // normalizeAccountName 함수로 비교
  const normalizeAccountName = (name) => name.replace(/\([^)]*\)/g, "").trim();
  
  console.log("\nNormalize 후:");
  if (assets?.[0]) {
    const normalized = normalizeAccountName(assets[0].account_name);
    console.log(`  Assets: "${assets[0].account_name}" → "${normalized}"`);
  }
  if (cash?.[0]) {
    const normalized = normalizeAccountName(cash[0].account_name);
    console.log(`  Cash: "${cash[0].account_name}" → "${normalized}"`);
  }
})();
