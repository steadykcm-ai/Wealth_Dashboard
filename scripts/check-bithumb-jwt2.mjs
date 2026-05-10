import crypto from "crypto";

const ACCESS_KEY = "03cd4267a17d9d78e462574431516c90e05850f156137f";
const SECRET_RAW = "YzdhNzEyYWVmOGRkMTFiOTQ2NjdhOTc0OWY3MzljMTI1MTQ0MzE1NjY4OTNlNjVkNTNmNjUxMTQ3NjE0OQ==";
const SECRET_DECODED = Buffer.from(SECRET_RAW, "base64").toString("utf8"); // c7a712ae...

function makeJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

async function test(label, secret, payload) {
  await new Promise(r => setTimeout(r, 300));
  const token = makeJWT(payload, secret);
  const res = await fetch("https://api.bithumb.com/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const ok = res.status === 200;
  console.log(`[${label}] ${ok ? "✓ 성공!" : `✗ ${res.status} ${JSON.stringify(data).slice(0,80)}`}`);
  if (ok) console.log("  →", JSON.stringify(data).slice(0, 200));
  return ok;
}

const nonce = crypto.randomUUID();

// 페이로드 구조 × 시크릿 키 포맷 조합
await test("raw+access_key",    SECRET_RAW,     { access_key: ACCESS_KEY, nonce });
await test("decoded+access_key", SECRET_DECODED, { access_key: ACCESS_KEY, nonce });

// bytes 키
const secretBytes = Buffer.from(SECRET_DECODED, "hex");
await test("bytes+access_key",  secretBytes,    { access_key: ACCESS_KEY, nonce });

// 다른 필드명
await test("decoded+apiKey",    SECRET_DECODED, { apiKey: ACCESS_KEY, nonce });
await test("decoded+api_key",   SECRET_DECODED, { api_key: ACCESS_KEY, nonce });

// nonce를 숫자로
const nonceNum = Date.now();
await test("decoded+nonce숫자", SECRET_DECODED, { access_key: ACCESS_KEY, nonce: nonceNum });
