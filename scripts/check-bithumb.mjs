import crypto from "crypto";

const API_KEY = "78fddc03f1e8f517250997774e9f63d04757976d4b7e36";
const SECRET_KEY = "MjIzODM3YmI3ZmE0NmE4OWQ4MDNmOWUxZjcxYzVkNzk5MTc3NGU5ODY3ZDI0MDUzOTU2YjQyN2YzZThmMQ==";

// 시크릿 키 후보
const decodedSecret = Buffer.from(SECRET_KEY, "base64").toString("utf8");
console.log("디코딩된 시크릿:", decodedSecret);

async function trySign(label, secretKey, params) {
  const endpoint = "/info/balance";
  const nonce = Date.now().toString();
  const hmacData = `${endpoint}\0${params}\0${nonce}`;
  const hmacHex = crypto.createHmac("sha512", secretKey).update(hmacData, "utf8").digest("hex");
  const sign = Buffer.from(hmacHex).toString("base64");

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
  console.log(`[${label}] status: ${data.status} / ${data.message ?? ""}`);
  return data.status === "0000";
}

// 방법 1: 원본 키 + currency=ALL만
await trySign("원본키 + currency=ALL", SECRET_KEY, "currency=ALL");

// 방법 2: 디코딩된 키 + currency=ALL만
await trySign("디코딩키 + currency=ALL", decodedSecret, "currency=ALL");

// 방법 3: 원본 키 + endpoint 포함 파라미터
await trySign("원본키 + endpoint포함", SECRET_KEY, "currency=ALL&endpoint=%2Finfo%2Fbalance");

// 방법 4: 디코딩된 키 + endpoint 포함 파라미터
await trySign("디코딩키 + endpoint포함", decodedSecret, "currency=ALL&endpoint=%2Finfo%2Fbalance");
