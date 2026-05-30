const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://yobchugjndnnkwogocsd.supabase.co";
const supabaseKey = "sb_secret_2WpTpn6dIp_hmh4Q3ovNrQ_YQJVVfeN";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCodes() {
  const { data, error } = await supabase
    .from("assets")
    .select("code, name")
    .limit(5);

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Asset codes from Supabase:");
    data.forEach((row) => {
      console.log(`- ${row.name}: "${row.code}"`);
    });
  }

  process.exit(0);
}

checkCodes();
