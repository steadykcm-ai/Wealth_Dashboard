import crypto from "crypto";

interface BithumbAccount {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
  unit_currency: string;
}

function generateBithumbToken(accessKey: string, secretKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ access_key: accessKey, nonce: crypto.randomUUID(), timestamp: Date.now() })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export interface BithumbHolding {
  currency: string;
  balance: number;
  currentPrice: number;
  avgPrice: number;
}

export async function fetchBithumbData(): Promise<{ holdings: BithumbHolding[]; krwBalance: number }> {
  const accessKey = process.env.BITHUMB_API_KEY;
  const secretKey = process.env.BITHUMB_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("BITHUMB_API_KEY / BITHUMB_SECRET_KEY 미설정");

  const token = generateBithumbToken(accessKey, secretKey);
  const res = await fetch("https://api.bithumb.com/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`빗썸 API 오류 ${res.status}: ${text}`);
  }

  const accounts = (await res.json()) as BithumbAccount[];

  const krwAccount = accounts.find((a) => a.currency === "KRW");
  const krwBalance = krwAccount ? parseFloat(krwAccount.balance) : 0;

  const holdings = accounts
    .filter((a) => a.currency !== "KRW" && a.currency !== "P" && parseFloat(a.balance) + parseFloat(a.locked) > 0)
    .map((a) => ({
      currency: a.currency,
      balance: parseFloat(a.balance) + parseFloat(a.locked),
      avgPrice: parseFloat(a.avg_buy_price),
      currentPrice: 0,
    }));

  return { holdings, krwBalance };
}
