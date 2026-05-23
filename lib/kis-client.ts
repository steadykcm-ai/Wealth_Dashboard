const BASE_URL = "https://openapi.koreainvestment.com:9443";

let cachedToken: string | null = null;
let tokenExpireTime: number = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpireTime > now) {
    return cachedToken;
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;

  console.log("🔑 KIS Token: requesting...", { hasKey: !!appKey, hasSecret: !!appSecret });

  if (!appKey || !appSecret) {
    throw new Error("KIS_APP_KEY and KIS_APP_SECRET must be set");
  }

  try {
    const body = {
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    };
    console.log("[DEBUG] Token request body:", JSON.stringify(body, null, 2));

    const response = await fetch(`${BASE_URL}/oauth2/tokenP`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    console.log("[DEBUG] Token response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("[DEBUG] Token error response:", errorText);
      throw new Error(`Token request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as any;
    console.log("[DEBUG] Token response data:", JSON.stringify(data, null, 2));

    const token = data.access_token as string;
    if (!token) throw new Error("No access_token in response");

    cachedToken = token;
    tokenExpireTime = now + (data.expires_in || 3600) * 1000;

    console.log("✅ KIS Token: obtained", { expiresIn: data.expires_in });
    return cachedToken;
  } catch (err: unknown) {
    console.error("❌ Token fetch error:", err);
    throw err;
  }
}

export async function fetchKISPrice(code: string): Promise<number | null> {
  try {
    const token = await getAccessToken();
    const appKey = process.env.KIS_APP_KEY;
    const appSecret = process.env.KIS_APP_SECRET;

    if (!appKey || !appSecret) throw new Error("KIS credentials not set");

    const url = `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`;
    console.log(`[DEBUG] Price request URL for ${code}:`, url);
    console.log(`[DEBUG] Token (first 20 chars):`, token.substring(0, 20) + "...");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        personalseckey: "1112865",
        "tr-id": "FHKST01010100",
        custtype: "P",
      },
    });

    console.log(`[DEBUG] Price response status for ${code}:`, response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ KIS ${code}: ${response.status} ${errorText}`);
      return null;
    }

    const data = (await response.json()) as any;
    console.log(`[DEBUG] Price response data for ${code}:`, JSON.stringify(data, null, 2));

    const price = parseFloat(data.output?.stck_prpr);
    console.log(`[DEBUG] Parsed price for ${code}:`, price, "isNaN:", isNaN(price));

    if (!isNaN(price) && price > 0) {
      console.log(`✅ KIS ${code}: ${price}`);
      return price;
    }

    console.log(`❌ KIS ${code}: no valid price in response (price=${price})`);
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ KIS ${code}: ${msg}`);
    return null;
  }
}
