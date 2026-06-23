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
  };
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpireTime > now) {
    return cachedToken;
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

    cachedToken = token;
    const expiresIn = data.expires_in || DEFAULT_TOKEN_EXPIRES_IN_SECONDS;
    tokenExpireTime = now + expiresIn * 1000 - TOKEN_EXPIRY_BUFFER_MS;
    return cachedToken;
  } catch (err: unknown) {
    throw err;
  }
}

export async function fetchKISPrice(code: string): Promise<number | null> {
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

    if (!isNaN(price) && price > 0) {
      return price;
    }

    return null;
  } catch (err: unknown) {
    return null;
  }
}
