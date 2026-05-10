import crypto from "crypto";

const UPBIT_ACCESS_KEY = "d7fX0eLhDBLTqXVidvCLTpUj09tq3FxqfZQkbUTL";
const UPBIT_SECRET_KEY = "fxmOnUGewnCtO0lxf2BPC3c5WrSNQMRhOs7O8DfE";
const BITHUMB_API_KEY = "78fddc03f1e8f517250997774e9f63d04757976d4b7e36";
const BITHUMB_SECRET_KEY = "MjIzODM3YmI3ZmE0NmE4OWQ4MDNmOWUxZjcxYzVkNzk5MTc3NGU5ODY3ZDI0MDUzOTU2YjQyN2YzZThmMQ==";

// ── 업비트 ──────────────────────────────────────────────
function generateUpbitToken(accessKey, secretKey) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ access_key: accessKey, nonce: crypto.randomUUID() })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secretKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

console.log("=== 업비트 계좌 조회 ===");
try {
  const token = generateUpbitToken(UPBIT_ACCESS_KEY, UPBIT_SECRET_KEY);
  const res = await fetch("https://api.upbit.com/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    console.log("오류:", JSON.stringify(data));
  } else {
    console.log(`계좌 수: ${data.length}`);
    data.forEach(a => {
      const bal = parseFloat(a.balance) + parseFloat(a.locked);
      if (bal > 0) console.log(`  ${a.currency}: ${bal} (평균매입가: ${a.avg_buy_price})`);
    });
  }
} catch (e) {
  console.log("업비트 오류:", e.message);
}

// ── 빗썸 ────────────────────────────────────────────────
function generateBithumbSign(endpoint, params, nonce, secretKey) {
  const hmacData = `${endpoint}\0${params}\0${nonce}`;
  const hmacHex = crypto.createHmac("sha512", secretKey).update(hmacData, "utf8").digest("hex");
  return Buffer.from(hmacHex).toString("base64");
}

console.log("\n=== 빗썸 잔고 조회 ===");
try {
  const endpoint = "/info/balance";
  const params = "currency=ALL&endpoint=%2Finfo%2Fbalance";
  const nonce = Date.now().toString();
  const sign = generateBithumbSign(endpoint, params, nonce, BITHUMB_SECRET_KEY);

  const res = await fetch("https://api.bithumb.com/info/balance", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Api-Key": BITHUMB_API_KEY,
      "Api-Sign": sign,
      "Api-Nonce": nonce,
      "api-client-type": "0",
    },
    body: params,
  });
  const data = await res.json();
  console.log("status:", data.status);
  if (data.status === "0000") {
    const d = data.data;
    for (const [k, v] of Object.entries(d)) {
      if (k.startsWith("total_") && k !== "total_krw" && parseFloat(v) > 0) {
        const ticker = k.replace("total_", "").toUpperCase();
        const price = d[`xcoin_last_${ticker.toLowerCase()}`] ?? "없음";
        console.log(`  ${ticker}: ${v} (현재가: ${price})`);
      }
    }
    console.log(`  KRW 잔고: ${d["available_krw"]}`);
  } else {
    console.log("오류:", data.message ?? JSON.stringify(data));
  }
} catch (e) {
  console.log("빗썸 오류:", e.message);
}
