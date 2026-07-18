import { readCachedKisToken, saveCachedKisToken } from "@/lib/kis-token-cache";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const DEFAULT_TOKEN_EXPIRES_IN_SECONDS = 24 * 60 * 60;
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

let cachedToken: string | null = null;
let tokenExpireTime: number = 0;
let pendingTokenRequest: Promise<string> | null = null;

interface KisTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface KisPriceResponse {
  output?: {
    stck_prpr?: string;
    prdy_vrss?: string;
    prdy_ctrt?: string;
  };
}

export interface KisQuote {
  price: number;
  changeAmount: number;
  changeRate: number;
}

interface KisDailyPriceResponse {
  output2?: Array<{
    stck_bsop_date?: string;
    stck_clpr?: string;
  }>;
}

interface KisDomesticIndexResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output2?: Array<{
    stck_bsop_date?: string;
    bstp_nmix_prpr?: string;
  }>;
}

interface KisOverseasIndexResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output2?: Array<{
    stck_bsop_date?: string;
    ovrs_nmix_prpr?: string;
  }>;
}

export interface KisIndexPoint {
  date: string;
  value: number;
}

function toKisDate(date: string): string {
  return date.replace(/-/g, "");
}

function toIsoDate(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpireTime > now) {
    return cachedToken;
  }

  const storedToken = await readCachedKisToken(now);
  if (storedToken.status === "hit") {
    cachedToken = storedToken.token.accessToken;
    tokenExpireTime = storedToken.token.expiresAtMs;
    return cachedToken;
  }

  if (storedToken.status === "unavailable" || storedToken.status === "error") {
    throw new Error("KIS shared token cache is unavailable");
  }

  if (pendingTokenRequest) {
    return pendingTokenRequest;
  }

  pendingTokenRequest = requestAccessToken();

  try {
    return await pendingTokenRequest;
  } finally {
    pendingTokenRequest = null;
  }
}

async function requestAccessToken(): Promise<string> {
  const now = Date.now();
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;

  if (!appKey || !appSecret) {
    throw new Error("KIS_APP_KEY and KIS_APP_SECRET must be set");
  }

  try {
    const body = {
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    };

    const response = await fetch(`${BASE_URL}/oauth2/tokenP`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as KisTokenResponse;

    const token = data.access_token;
    if (!token) throw new Error("No access_token in response");

    const expiresIn = data.expires_in || DEFAULT_TOKEN_EXPIRES_IN_SECONDS;
    const expiresAtMs = now + expiresIn * 1000 - TOKEN_EXPIRY_BUFFER_MS;
    const saved = await saveCachedKisToken(token, expiresAtMs);
    if (!saved) throw new Error("Failed to persist KIS access token");

    cachedToken = token;
    tokenExpireTime = expiresAtMs;
    return token;
  } catch (err: unknown) {
    throw err;
  }
}

export async function fetchKISPrice(code: string): Promise<number | null> {
  const quote = await fetchKISQuote(code);
  return quote?.price ?? null;
}

export async function fetchKISQuote(code: string): Promise<KisQuote | null> {
  try {
    const appKey = process.env.KIS_APP_KEY;
    const appSecret = process.env.KIS_APP_SECRET;

    if (!appKey || !appSecret) throw new Error("KIS credentials not set");

    const token = await getAccessToken();
    const url = `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": `Bearer ${token}`,
        "appkey": appKey,
        "appsecret": appSecret,
        "tr_id": "FHKST01010100",
        "custtype": "P",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as KisPriceResponse;

    const rawPrice = data.output?.stck_prpr;
    if (!rawPrice) return null;

    const price = parseFloat(rawPrice);
    const changeAmount = Number(data.output?.prdy_vrss ?? 0);
    const changeRate = Number(data.output?.prdy_ctrt ?? 0);

    if (!isNaN(price) && price > 0) {
      return {
        price,
        changeAmount: Number.isFinite(changeAmount) ? changeAmount : 0,
        changeRate: Number.isFinite(changeRate) ? changeRate : 0,
      };
    }

    return null;
  } catch (err: unknown) {
    return null;
  }
}

export async function fetchKISDailyClose(
  code: string,
  date: string
): Promise<number | null> {
  try {
    const appKey = process.env.KIS_APP_KEY;
    const appSecret = process.env.KIS_APP_SECRET;

    if (!appKey || !appSecret) throw new Error("KIS credentials not set");

    const token = await getAccessToken();
    const targetDate = toKisDate(date);
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: toKisDate(shiftIsoDate(date, -14)),
      FID_INPUT_DATE_2: targetDate,
      FID_PERIOD_DIV_CODE: "D",
      FID_ORG_ADJ_PRC: "0",
    });

    const response = await fetch(
      `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "authorization": `Bearer ${token}`,
          "appkey": appKey,
          "appsecret": appSecret,
          "tr_id": "FHKST03010100",
          "custtype": "P",
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as KisDailyPriceResponse;
    const row = data.output2
      ?.filter((item) => item.stck_bsop_date && item.stck_bsop_date <= targetDate)
      .sort((a, b) => (b.stck_bsop_date || "").localeCompare(a.stck_bsop_date || ""))[0];
    const close = Number(row?.stck_clpr);

    return Number.isFinite(close) && close > 0 ? close : null;
  } catch {
    return null;
  }
}

export async function fetchKISDomesticIndexSeries(
  code: string,
  startDate: string,
  endDate: string
): Promise<KisIndexPoint[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("KIS credentials not set");

  const token = await getAccessToken();
  const points = new Map<string, number>();
  let cursor = endDate;

  for (let page = 0; page < 6; page += 1) {
    const params = new URLSearchParams({
      FID_PERIOD_DIV_CODE: "D",
      FID_COND_MRKT_DIV_CODE: "U",
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: toKisDate(cursor),
    });
    const response = await fetch(
      `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-daily-price?${params.toString()}`,
      {
        cache: "no-store",
        headers: {
          "authorization": `Bearer ${token}`,
          "appkey": appKey,
          "appsecret": appSecret,
          "tr_id": "FHPUP02120000",
          "custtype": "P",
        },
      }
    );
    if (!response.ok) {
      throw new Error(`KIS KOSPI request failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as KisDomesticIndexResponse;
    if (data.rt_cd !== "0") {
      throw new Error(
        `KIS KOSPI request failed: ${data.msg_cd ?? "UNKNOWN"} ${data.msg1 ?? ""}`.trim()
      );
    }

    const rows = data.output2 ?? [];
    rows.forEach((row) => {
      const rawDate = row.stck_bsop_date;
      const value = Number(row.bstp_nmix_prpr);
      if (!rawDate || !Number.isFinite(value) || value <= 0) return;
      const date = toIsoDate(rawDate);
      if (date >= startDate && date <= endDate) points.set(date, value);
    });

    const oldestDate = rows
      .map((row) => row.stck_bsop_date)
      .filter((date): date is string => Boolean(date))
      .sort()[0];
    if (!oldestDate || toIsoDate(oldestDate) <= startDate) break;
    cursor = shiftIsoDate(toIsoDate(oldestDate), -1);
  }

  return Array.from(points.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchKISOverseasIndexSeries(
  code: string,
  startDate: string,
  endDate: string
): Promise<KisIndexPoint[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("KIS credentials not set");

  const token = await getAccessToken();
  const points = new Map<string, number>();
  let cursor = endDate;

  for (let page = 0; page < 6; page += 1) {
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "N",
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: toKisDate(startDate),
      FID_INPUT_DATE_2: toKisDate(cursor),
      FID_PERIOD_DIV_CODE: "D",
    });
    const response = await fetch(
      `${BASE_URL}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice?${params.toString()}`,
      {
        cache: "no-store",
        headers: {
          "authorization": `Bearer ${token}`,
          "appkey": appKey,
          "appsecret": appSecret,
          "tr_id": "FHKST03030100",
          "custtype": "P",
        },
      }
    );
    if (!response.ok) {
      throw new Error(`KIS S&P 500 request failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as KisOverseasIndexResponse;
    if (data.rt_cd !== "0") {
      throw new Error(
        `KIS S&P 500 request failed: ${data.msg_cd ?? "UNKNOWN"} ${data.msg1 ?? ""}`.trim()
      );
    }

    const rows = data.output2 ?? [];
    rows.forEach((row) => {
      const rawDate = row.stck_bsop_date;
      const value = Number(row.ovrs_nmix_prpr);
      if (!rawDate || !Number.isFinite(value) || value <= 0) return;
      const date = toIsoDate(rawDate);
      if (date >= startDate && date <= endDate) points.set(date, value);
    });

    const oldestDate = rows
      .map((row) => row.stck_bsop_date)
      .filter((date): date is string => Boolean(date))
      .sort()[0];
    if (!oldestDate || toIsoDate(oldestDate) <= startDate || rows.length < 100) break;
    cursor = shiftIsoDate(toIsoDate(oldestDate), -1);
  }

  return Array.from(points.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
