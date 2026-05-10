import crypto from "crypto";

const API_KEY = "03cd4267a17d9d78e462574431516c90e05850f156137f";
const SECRET_RAW = "YzdhNzEyYWVmOGRkMTFiOTQ2NjdhOTc0OWY3MzljMTI1MTQ0MzE1NjY4OTNlNjVkNTNmNjUxMTQ3NjE0OQ==";
const SECRET_DECODED = Buffer.from(SECRET_RAW, "base64").toString("utf8"); // hex 문자열

async function req(label, secretKey, params, extraHeaders = {}) {
  const endpoint = "/info/balance";
  const nonce = Date.now().toString();
  const hmacData = `${endpoint}\0${params}\0${nonce}`;
  const hmacHex = crypto.createHmac("sha512", secretKey).update(hmacData, "utf8").digest("hex");
  const sign = Buffer.from(hmacHex).toString("base64");

  await new Promise(r => setTimeout(r, 400));
  const res = await fetch("https://api.bithumb.com/info/balance", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Api-Key": API_KEY,
      "Api-Sign": sign,
      "Api-Nonce": nonce,
      "api-client-type": "0",
      ...extraHeaders,
    },
    body: params,
  });
  const data = await res.json();
  const ok = data.status === "0000";
  console.log(`[${label}] ${ok ? "✓ 성공!" : `✗ ${data.status} ${data.message ?? ""}`}`);
  return ok;
}

console.log("decoded secret:", SECRET_DECODED, "\n");

// nonce 초 단위 (ms가 아닌)
async function reqSecNonce(label, secretKey, params) {
  const endpoint = "/info/balance";
  const nonce = Math.floor(Date.now() / 1000).toString();
  const hmacData = `${endpoint}\0${params}\0${nonce}`;
  const hmacHex = crypto.createHmac("sha512", secretKey).update(hmacData, "utf8").digest("hex");
  const sign = Buffer.from(hmacHex).toString("base64");

  await new Promise(r => setTimeout(r, 400));
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
  console.log(`[${label}] ${data.status === "0000" ? "✓ 성공!" : `✗ ${data.status} ${data.message ?? ""}`}`);
}

// 다양한 조합 테스트
await req("decoded+currency=ALL", SECRET_DECODED, "currency=ALL");
await req("decoded+currency=BTC", SECRET_DECODED, "currency=BTC");
await reqSecNonce("decoded+초단위nonce", SECRET_DECODED, "currency=ALL");
await req("raw+currency=ALL", SECRET_RAW, "currency=ALL");

// 헤더 이름 소문자
async function reqLower(label, secretKey, params) {
  const endpoint = "/info/balance";
  const nonce = Date.now().toString();
  const hmacData = `${endpoint}\0${params}\0${nonce}`;
  const hmacHex = crypto.createHmac("sha512", secretKey).update(hmacData, "utf8").digest("hex");
  const sign = Buffer.from(hmacHex).toString("base64");
  await new Promise(r => setTimeout(r, 400));
  const res = await fetch("https://api.bithumb.com/info/balance", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "api-key": API_KEY,
      "api-sign": sign,
      "api-nonce": nonce,
      "api-client-type": "0",
    },
    body: params,
  });
  const data = await res.json();
  console.log(`[${label}] ${data.status === "0000" ? "✓ 성공!" : `✗ ${data.status} ${data.message ?? ""}`}`);
}

await reqLower("소문자헤더", SECRET_DECODED, "currency=ALL");
