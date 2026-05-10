import crypto from "crypto";

interface UpbitAccount {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
  unit_currency: string;
}

function generateUpbitToken(accessKey: string, secretKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ access_key: accessKey, nonce: crypto.randomUUID() })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export interface UpbitHolding {
  currency: string;
  balance: number;
  avgPrice: number;
}

export async function fetchUpbitData(): Promise<{ holdings: UpbitHolding[]; krwBalance: number }> {
  const accessKey = process.env.UPBIT_ACCESS_KEY;
  const secretKey = process.env.UPBIT_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("UPBIT_ACCESS_KEY / UPBIT_SECRET_KEY 미설정");

  const token = generateUpbitToken(accessKey, secretKey);
  const res = await fetch("https://api.upbit.com/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`업비트 API 오류 ${res.status}: ${text}`);
  }

  const accounts = (await res.json()) as UpbitAccount[];

  const krwAccount = accounts.find((a) => a.currency === "KRW");
  const krwBalance = krwAccount ? parseFloat(krwAccount.balance) : 0;

  const holdings = accounts
    .filter((a) => a.currency !== "KRW" && parseFloat(a.balance) + parseFloat(a.locked) > 0)
    .map((a) => ({
      currency: a.currency,
      balance: parseFloat(a.balance) + parseFloat(a.locked),
      avgPrice: parseFloat(a.avg_buy_price),
    }));

  return { holdings, krwBalance };
}
