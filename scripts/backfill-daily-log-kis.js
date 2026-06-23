const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.local") });
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env.vercel.backfill.local"),
});

const { createClient } = require("@supabase/supabase-js");

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const OWNER_USER_ID = "56701cc8-3dff-405d-a2b7-1ff4301e92cc";
const APPLY = process.argv.includes("--apply");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const appKey = process.env.KIS_APP_KEY;
const appSecret = process.env.KIS_APP_SECRET;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE key env vars are required.");
}

if (!appKey || !appSecret) {
  throw new Error("KIS_APP_KEY and KIS_APP_SECRET env vars are required.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toKisDate(date) {
  return date.replace(/-/g, "");
}

function toIsoDate(kisDate) {
  return `${kisDate.slice(0, 4)}-${kisDate.slice(4, 6)}-${kisDate.slice(6, 8)}`;
}

function normalizeKisCode(code) {
  if (typeof code !== "string") return null;
  const match = code.match(/\d{6}/);
  return match ? match[0] : null;
}

async function getAccessToken() {
  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KIS token request failed: HTTP ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("KIS token response did not include access_token.");
  }

  return data.access_token;
}

async function fetchDailyCloses(token, code, startDate, endDate) {
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: toKisDate(startDate),
    FID_INPUT_DATE_2: toKisDate(endDate),
    FID_PERIOD_DIV_CODE: "D",
    FID_ORG_ADJ_PRC: "0",
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params.toString()}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        "tr_id": "FHKST03010100",
        custtype: "P",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KIS daily price failed for ${code}: HTTP ${res.status} ${text}`);
  }

  const data = await res.json();
  const rows = Array.isArray(data.output2) ? data.output2 : [];
  const closes = new Map();

  rows.forEach((row) => {
    const date = row.stck_bsop_date;
    const close = Number(row.stck_clpr);
    if (typeof date === "string" && Number.isFinite(close) && close > 0) {
      closes.set(toIsoDate(date), close);
    }
  });

  return closes;
}

function getPriceOnOrBefore(priceMap, date, fallback) {
  if (priceMap.has(date)) return priceMap.get(date);

  const target = new Date(date).getTime();
  let bestDate = "";
  let bestPrice = fallback;

  for (const [priceDate, price] of priceMap.entries()) {
    const priceTime = new Date(priceDate).getTime();
    if (priceTime <= target && priceDate > bestDate) {
      bestDate = priceDate;
      bestPrice = price;
    }
  }

  return bestPrice;
}

function summarizeAssets(assets, priceByCode, date, assetTypes) {
  let invest = 0;
  let value = 0;

  assets
    .filter((asset) => assetTypes.includes(asset.asset_type))
    .forEach((asset) => {
      const quantity = Number(asset.quantity || 0);
      const avgPrice = Number(asset.avg_price || 0);
      const kisCode = normalizeKisCode(asset.code);
      const currentPrice = kisCode
        ? getPriceOnOrBefore(priceByCode.get(kisCode) || new Map(), date, avgPrice)
        : avgPrice;

      invest += quantity * avgPrice;
      value += quantity * currentPrice;
    });

  return {
    invest,
    value,
    profit: value - invest,
  };
}

async function main() {
  const { data: logs, error: logsError } = await supabase
    .from("daily_log")
    .select("date")
    .eq("user_id", OWNER_USER_ID)
    .order("date", { ascending: true });

  if (logsError) throw logsError;
  if (!logs || logs.length === 0) {
    throw new Error("No daily_log rows found to backfill.");
  }

  const dates = logs.map((row) => row.date).filter(Boolean);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("asset_type, code, quantity, avg_price")
    .eq("is_cash", false)
    .eq("user_id", OWNER_USER_ID)
    .neq("asset_type", "암호화폐");

  if (assetsError) throw assetsError;

  const { data: cashRows, error: cashError } = await supabase
    .from("cash")
    .select("amount")
    .eq("user_id", OWNER_USER_ID);

  if (cashError) throw cashError;

  const totalCash = (cashRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const codes = Array.from(
    new Set(
      (assets || [])
        .map((asset) => normalizeKisCode(asset.code))
        .filter((code) => typeof code === "string")
    )
  );

  const token = await getAccessToken();
  const priceByCode = new Map();

  for (const code of codes) {
    const closes = await fetchDailyCloses(token, code, startDate, endDate);
    priceByCode.set(code, closes);
    await sleep(150);
  }

  const rows = dates.map((date) => {
    const stocks = summarizeAssets(assets || [], priceByCode, date, ["개별주식"]);
    const pension = summarizeAssets(assets || [], priceByCode, date, ["개인연금", "IRP"]);

    return {
      date,
      user_id: OWNER_USER_ID,
      stocks_invest: stocks.invest,
      stocks_value: stocks.value,
      stocks_profit: stocks.profit,
      pension_invest: pension.invest,
      pension_value: pension.value,
      pension_profit: pension.profit,
      crypto_invest: 0,
      crypto_value: 0,
      crypto_profit: 0,
      total_cash: totalCash,
    };
  });

  const preview = rows.slice(0, 5).map((row) => ({
    date: row.date,
    total: row.stocks_value + row.pension_value + row.total_cash,
    stocks: row.stocks_value,
    pension: row.pension_value,
  }));

  console.table(preview);
  console.log(`Prepared ${rows.length} daily_log rows from ${startDate} to ${endDate}.`);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to update Supabase.");
    return;
  }

  for (const row of rows) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("daily_log")
      .update(row)
      .eq("date", row.date)
      .eq("user_id", row.user_id)
      .select("date");

    if (updateError) throw updateError;

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertError } = await supabase.from("daily_log").insert(row);
      if (insertError) throw insertError;
    }
  }

  console.log(`Updated ${rows.length} daily_log rows.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
