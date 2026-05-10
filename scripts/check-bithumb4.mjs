import crypto from "crypto";
import fs from "fs";

// .env.local 직접 파싱
const envContent = fs.readFileSync("C:\\tmp\\Wealth_dashboard\\.env.local", "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^=]+)="?([^"]*)"?\s*$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const API_KEY = env["BITHUMB_API_KEY"];
const SECRET_KEY = env["BITHUMB_SECRET_KEY"];

console.log("API Key:", API_KEY);
console.log("Secret Key (raw):", SECRET_KEY);
console.log("Secret Key length:", SECRET_KEY?.length);

const decoded = Buffer.from(SECRET_KEY, "base64").toString("utf8");
console.log("Decoded:", decoded);
console.log();

async function tryMethod(label, key, params) {
  const endpoint = "/info/balance";
  const nonce = Date.now().toString();
  const hmacData = `${endpoint}\0${params}\0${nonce}`;
  const hmacHex = crypto.createHmac("sha512", key).update(hmacData, "utf8").digest("hex");
  const sign = Buffer.from(hmacHex).toString("base64");

  await new Promise(r => setTimeout(r, 500));
  const res = await fetch("https://api.bithumb.com/info/balance", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Api-Key": API_KEY,
      "Api-Sign": sign,
      "Api-Nonce": nonce,
      "api-client-type": "0",
    },
    body: params,
  });
  const data = await res.json();
  console.log(`[${label}] ${data.status === "0000" ? "✓ 성공!" : `✗ ${data.status} - ${data.message ?? ""}`}`);
  if (data.status === "0000") console.log("data:", JSON.stringify(data.data).substring(0, 200));
}

await tryMethod("raw secret", SECRET_KEY, "currency=ALL");
await tryMethod("decoded secret (hex str)", decoded, "currency=ALL");
await tryMethod("decoded secret, BTC only", decoded, "currency=BTC");
