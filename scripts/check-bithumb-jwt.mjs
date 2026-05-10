import crypto from "crypto";
import fs from "fs";

const envContent = fs.readFileSync("C:\\tmp\\Wealth_dashboard\\.env.local", "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^=]+)=(.+)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const ACCESS_KEY = env["BITHUMB_API_KEY"];
const SECRET_KEY = env["BITHUMB_SECRET_KEY"];
console.log("ACCESS_KEY:", ACCESS_KEY);
console.log("SECRET_KEY:", SECRET_KEY);

function generateToken(accessKey, secretKey) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ access_key: accessKey, nonce: crypto.randomUUID() })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secretKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

console.log("\n=== Bithumb JWT 방식 테스트 ===");
const token = generateToken(ACCESS_KEY, SECRET_KEY);
console.log("Token:", token.substring(0, 60) + "...");

const res = await fetch("https://api.bithumb.com/v1/accounts", {
  headers: { Authorization: `Bearer ${token}` },
});

console.log("HTTP Status:", res.status);
const text = await res.text();
console.log("Response:", text.substring(0, 500));
