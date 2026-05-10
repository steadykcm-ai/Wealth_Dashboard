import crypto from "crypto";

const ACCESS_KEY = "03cd4267a17d9d78e462574431516c90e05850f156137f";
const SECRET_RAW = "YzdhNzEyYWVmOGRkMTFiOTQ2NjdhOTc0OWY3MzljMTI1MTQ0MzE1NjY4OTNlNjVkNTNmNjUxMTQ3NjE0OQ==";

// base64 → 실제 바이너리 버퍼 (아직 안 시도한 방식)
const SECRET_BYTES = Buffer.from(SECRET_RAW, "base64");
console.log("바이너리 키 길이:", SECRET_BYTES.length, "bytes");

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

async function test(label, secret, payload) {
  await new Promise(r => setTimeout(r, 400));
  const token = makeJWT(payload, secret);
  const res = await fetch("https://api.bithumb.com/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const ok = res.status === 200;
  console.log(`[${label}] ${ok ? "✓ 성공!" : `✗ ${res.status} - ${JSON.stringify(data).slice(0, 100)}`}`);
  if (ok) console.log("  첫 항목:", JSON.stringify(data[0]));
  return ok;
}

// 핵심: base64 바이너리 버퍼를 직접 HMAC 키로 사용
await test("base64→바이너리버퍼 + {access_key,nonce}", SECRET_BYTES, {
  access_key: ACCESS_KEY,
  nonce: crypto.randomUUID(),
});

await test("base64→바이너리버퍼 + {access_key,nonce숫자}", SECRET_BYTES, {
  access_key: ACCESS_KEY,
  nonce: Date.now(),
});

// Upbit 방식과 동일하게 (raw string)
await test("raw string (Upbit 동일방식)", SECRET_RAW, {
  access_key: ACCESS_KEY,
  nonce: crypto.randomUUID(),
});
