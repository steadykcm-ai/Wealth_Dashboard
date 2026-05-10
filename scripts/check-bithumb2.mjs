import crypto from "crypto";

const API_KEY = "03cd4267a17d9d78e462574431516c90e05850f156137f";
const SECRET_KEY_RAW = "YzdhNzEyYWVmOGRkMTFiOTQ2NjdhOTc0OWY3MzljMTI1MTQ0MzE1NjY4OTNlNjVkNTNmNjUxMTQ3NjE0OQ==";
const SECRET_KEY_HEX = Buffer.from(SECRET_KEY_RAW, "base64").toString("utf8");
const SECRET_KEY_BYTES = Buffer.from(SECRET_KEY_HEX, "hex"); // hex 문자열 → 바이너리

async function trySign(label, secretKey, params, endpoint = "/info/balance") {
  const nonce = Date.now().toString();
  const hmacData = `${endpoint}\0${params}\0${nonce}`;

  // 방법 A: hexdigest → base64
  const hmacHex = crypto.createHmac("sha512", secretKey).update(hmacData, "utf8").digest("hex");
  const signA = Buffer.from(hmacHex).toString("base64");

  // 방법 B: binary digest → base64 (hex 없이 바로)
  const signB = crypto.createHmac("sha512", secretKey).update(hmacData, "utf8").digest("base64");

  for (const [method, sign] of [["hexdigest→base64", signA], ["binary→base64", signB]]) {
    await new Promise(r => setTimeout(r, 300)); // rate limit
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
    const ok = data.status === "0000" ? "✓ 성공!" : `✗ ${data.status}`;
    console.log(`[${label} / ${method}] ${ok}`);
    if (data.status === "0000") return true;
  }
  return false;
}

console.log("=== 빗썸 서명 방식 전수 테스트 ===\n");

// 1. 원본 base64 키 (string)
await trySign("원본base64키", SECRET_KEY_RAW, "currency=ALL");

// 2. 디코딩된 hex 문자열
await trySign("hex문자열키", SECRET_KEY_HEX, "currency=ALL");

// 3. hex를 바이너리 버퍼로
await trySign("바이너리키", SECRET_KEY_BYTES, "currency=ALL");

// 4. endpoint 파라미터 포함
await trySign("바이너리키+endpoint파람", SECRET_KEY_BYTES, "currency=ALL&endpoint=%2Finfo%2Fbalance");
