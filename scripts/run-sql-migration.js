#!/usr/bin/env node

/**
 * Supabase SQL Migration Runner
 * 이 스크립트는 Supabase REST API를 사용하여 SQL 마이그레이션을 실행합니다.
 *
 * 사용: node scripts/run-sql-migration.js
 */

const https = require("https");
const querystring = require("querystring");

const SUPABASE_URL = "yobchugjndnnkwogocsd.supabase.co";
const SUPABASE_ADMIN_KEY = "sb_secret_2WpTpn6dIp_hmh4Q3ovNrQ_YQJVVfeN";
const USER_ID = "56701cc8-3dff-405d-a2b7-1ff4301e92cc";

// 각 SQL 쿼리를 별도로 실행해야 함
const sqlStatements = [
  {
    name: "assets 테이블에 user_id 컬럼 추가",
    sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);`,
  },
  {
    name: "cash 테이블에 user_id 컬럼 추가",
    sql: `ALTER TABLE cash ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);`,
  },
  {
    name: "daily_log 테이블에 user_id 컬럼 추가",
    sql: `ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);`,
  },
  {
    name: "assets 테이블의 기존 행에 user_id 할당",
    sql: `UPDATE assets SET user_id = '${USER_ID}' WHERE user_id IS NULL;`,
  },
  {
    name: "cash 테이블의 기존 행에 user_id 할당",
    sql: `UPDATE cash SET user_id = '${USER_ID}' WHERE user_id IS NULL;`,
  },
  {
    name: "daily_log 테이블의 기존 행에 user_id 할당",
    sql: `UPDATE daily_log SET user_id = '${USER_ID}' WHERE user_id IS NULL;`,
  },
];

async function runSql(sql, description) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query: sql });

    const options = {
      hostname: SUPABASE_URL,
      port: 443,
      path: "/rest/v1/rpc/exec",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
        apikey: SUPABASE_ADMIN_KEY,
        Prefer: "params=single-object",
      },
    };

    console.log(`실행 중: ${description}`);

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log("✓ 성공\n");
          resolve(data);
        } else {
          console.error(`✗ 실패 (상태코드: ${res.statusCode})`);
          console.error("응답:", data);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("=".repeat(50));
  console.log("Supabase SQL 마이그레이션 시작");
  console.log("=".repeat(50));
  console.log();

  try {
    for (const stmt of sqlStatements) {
      await runSql(stmt.sql, stmt.name);
      // API 제한 회피를 위해 약간의 지연
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log("=".repeat(50));
    console.log("✅ 모든 마이그레이션이 완료되었습니다!");
    console.log("=".repeat(50));
    console.log();
    console.log("다음 단계:");
    console.log("1. npm run dev로 개발 서버 시작");
    console.log("2. http://localhost:3003에서 구글 로그인");
    console.log("3. 데이터가 정상적으로 표시되는지 확인");
  } catch (error) {
    console.error();
    console.error("❌ 마이그레이션 실패:", error.message);
    process.exit(1);
  }
}

main();
