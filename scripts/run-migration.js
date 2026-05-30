#!/usr/bin/env node

const https = require("https");

const supabaseUrl = "https://yobchugjndnnkwogocsd.supabase.co";
const supabaseAdminKey = "sb_secret_2WpTpn6dIp_hmh4Q3ovNrQ_YQJVVfeN";
const userId = "56701cc8-3dff-405d-a2b7-1ff4301e92cc";

// SQL 쿼리들
const migrations = [
  `ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);`,
  `ALTER TABLE cash ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);`,
  `ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);`,
  `UPDATE assets SET user_id = '${userId}' WHERE user_id IS NULL;`,
  `UPDATE cash SET user_id = '${userId}' WHERE user_id IS NULL;`,
  `UPDATE daily_log SET user_id = '${userId}' WHERE user_id IS NULL;`,
];

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query: sql });

    const options = {
      hostname: "yobchugjndnnkwogocsd.supabase.co",
      port: 443,
      path: "/rest/v1/rpc/sql",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        Authorization: `Bearer ${supabaseAdminKey}`,
        apikey: supabaseAdminKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function runMigrations() {
  console.log("Supabase 마이그레이션 시작...\n");

  try {
    for (const sql of migrations) {
      console.log(`실행: ${sql.substring(0, 60)}...`);
      await executeSQL(sql);
      console.log("✓ 완료\n");
    }

    console.log("✅ 모든 마이그레이션이 완료되었습니다!");
  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    process.exit(1);
  }
}

runMigrations();
