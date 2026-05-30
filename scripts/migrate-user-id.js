const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://yobchugjndnnkwogocsd.supabase.co";
const supabaseKey = "sb_secret_2WpTpn6dIp_hmh4Q3ovNrQ_YQJVVfeN";
const userId = "56701cc8-3dff-405d-a2b7-1ff4301e92cc";

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("Starting user_id migration...\n");

  try {
    // Add user_id column to assets table
    console.log("Adding user_id column to assets table...");
    const { error: assetsError } = await supabase.rpc("execute_sql", {
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id)`,
    });
    if (assetsError && !assetsError.message.includes("already exists")) {
      throw assetsError;
    }
    console.log("✓ assets table updated\n");

    // Add user_id column to cash table
    console.log("Adding user_id column to cash table...");
    const { error: cashError } = await supabase.rpc("execute_sql", {
      sql: `ALTER TABLE cash ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id)`,
    });
    if (cashError && !cashError.message.includes("already exists")) {
      throw cashError;
    }
    console.log("✓ cash table updated\n");

    // Add user_id column to daily_log table
    console.log("Adding user_id column to daily_log table...");
    const { error: dailyLogError } = await supabase.rpc("execute_sql", {
      sql: `ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id)`,
    });
    if (dailyLogError && !dailyLogError.message.includes("already exists")) {
      throw dailyLogError;
    }
    console.log("✓ daily_log table updated\n");

    // Update existing rows with user_id
    console.log(`Updating existing rows with user_id: ${userId}...\n`);

    const { error: updateAssetsError } = await supabase.rpc("execute_sql", {
      sql: `UPDATE assets SET user_id = '${userId}' WHERE user_id IS NULL`,
    });
    if (updateAssetsError) throw updateAssetsError;
    console.log("✓ assets rows updated");

    const { error: updateCashError } = await supabase.rpc("execute_sql", {
      sql: `UPDATE cash SET user_id = '${userId}' WHERE user_id IS NULL`,
    });
    if (updateCashError) throw updateCashError;
    console.log("✓ cash rows updated");

    const { error: updateDailyLogError } = await supabase.rpc("execute_sql", {
      sql: `UPDATE daily_log SET user_id = '${userId}' WHERE user_id IS NULL`,
    });
    if (updateDailyLogError) throw updateDailyLogError;
    console.log("✓ daily_log rows updated\n");

    console.log("✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrate();
