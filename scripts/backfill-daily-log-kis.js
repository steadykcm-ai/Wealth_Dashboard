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

function shiftIsoDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function normalizeKisCode(code) {
  if (typeof code !== "string") return null;
  const match = code.match(/\d{6}/);
  return match ? match[0] : null;
}

function normalizeAccountName(name) {
  return typeof name === "string" ? name.replace(/\([^)]*\)/g, "").trim() : "";
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

function getAssetAmounts(asset, priceByCode, date) {
  const quantity = Number(asset.quantity || 0);
  const avgPrice = Number(asset.avg_price || 0);
  const isManual = asset.valuation_mode === "manual";
  const valuationDate = typeof asset.valuation_updated_at === "string"
    ? asset.valuation_updated_at.slice(0, 10)
    : null;

  if (isManual && (!valuationDate || date < valuationDate)) return null;

  if (isManual) {
    return {
      invest: Number(asset.manual_invest_amount || 0),
      value: Number(asset.manual_value || 0),
    };
  }

  const kisCode = normalizeKisCode(asset.code);
  const currentPrice = kisCode
    ? getPriceOnOrBefore(priceByCode.get(kisCode) || new Map(), date, avgPrice)
    : avgPrice;

  return {
    invest: quantity * avgPrice,
    value: quantity * currentPrice,
  };
}

function summarizeAssets(assets, priceByCode, date, assetTypes) {
  let invest = 0;
  let value = 0;

  assets
    .filter((asset) => assetTypes.includes(asset.asset_type))
    .forEach((asset) => {
      const amounts = getAssetAmounts(asset, priceByCode, date);
      if (!amounts) return;
      invest += amounts.invest;
      value += amounts.value;
    });

  return {
    invest,
    value,
    profit: value - invest,
  };
}

function summarizeAccounts(assets, priceByCode, date, cashByAccount) {
  const accounts = new Map();

  assets.forEach((asset) => {
    const accountName = normalizeAccountName(asset.account_name);
    if (!accountName) return;
    const amounts = getAssetAmounts(asset, priceByCode, date);
    if (!amounts) return;

    const category = asset.asset_type === "개별주식" ? "stocks" : "pension";
    const key = `${category}:${accountName}`;
    const current = accounts.get(key) || {
      user_id: OWNER_USER_ID,
      date,
      category,
      account_name: accountName,
      invest: 0,
      value: 0,
      cash: 0,
      profit: 0,
      total: 0,
      updated_at: new Date().toISOString(),
    };

    current.invest += amounts.invest;
    current.value += amounts.value;
    accounts.set(key, current);
  });

  accounts.forEach((account) => {
    account.cash = cashByAccount.get(account.account_name) || 0;
    account.profit = account.value - account.invest;
    account.total = account.value + account.cash;
  });

  return Array.from(accounts.values());
}

async function main() {
  const { data: logs, error: logsError } = await supabase
    .from("daily_log")
    .select("date, total_cash, stocks_cash, pension_cash")
    .eq("user_id", OWNER_USER_ID)
    .order("date", { ascending: true });

  if (logsError) throw logsError;
  if (!logs || logs.length === 0) {
    throw new Error("No daily_log rows found to backfill.");
  }

  const validLogs = logs.filter((row) => row.date);
  const dates = validLogs.map((row) => row.date);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("account_name, asset_type, code, quantity, avg_price, valuation_mode, manual_invest_amount, manual_value, valuation_updated_at")
    .eq("is_cash", false)
    .eq("user_id", OWNER_USER_ID)
    .neq("asset_type", "암호화폐");

  if (assetsError) throw assetsError;

  const { data: cashRows, error: cashError } = await supabase
    .from("cash")
    .select("account_name, amount")
    .eq("user_id", OWNER_USER_ID);

  if (cashError) throw cashError;

  const cashByAccount = new Map();
  (cashRows || []).forEach((row) => {
    const accountName = normalizeAccountName(row.account_name);
    if (!accountName) return;
    cashByAccount.set(accountName, (cashByAccount.get(accountName) || 0) + Number(row.amount || 0));
  });

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
    const closes = await fetchDailyCloses(token, code, shiftIsoDate(startDate, -14), endDate);
    priceByCode.set(code, closes);
    await sleep(150);
  }

  const rows = validLogs.map((log) => {
    const date = log.date;
    const stocks = summarizeAssets(assets || [], priceByCode, date, ["개별주식"]);
    const pension = summarizeAssets(assets || [], priceByCode, date, ["개인연금", "IRP"]);

    return {
      date,
      user_id: OWNER_USER_ID,
      stocks_invest: stocks.invest,
      stocks_value: stocks.value,
      stocks_profit: stocks.profit,
      stocks_cash: Number(log.stocks_cash || 0),
      pension_invest: pension.invest,
      pension_value: pension.value,
      pension_profit: pension.profit,
      pension_cash: Number(log.pension_cash || 0),
      crypto_invest: 0,
      crypto_value: 0,
      crypto_profit: 0,
      total_cash: Number(log.total_cash || 0),
    };
  });

  const accountRows = validLogs.flatMap((log) =>
    summarizeAccounts(assets || [], priceByCode, log.date, cashByAccount)
  );

  const preview = rows.slice(0, 5).map((row) => ({
    date: row.date,
    total: row.stocks_value + row.pension_value + row.total_cash,
    stocks: row.stocks_value,
    pension: row.pension_value,
  }));

  console.table(preview);
  console.log(`Prepared ${rows.length} daily_log rows from ${startDate} to ${endDate}.`);
  console.log(`Prepared ${accountRows.length} daily_account_log rows.`);

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

  for (let index = 0; index < accountRows.length; index += 500) {
    const batch = accountRows.slice(index, index + 500);
    const { error: accountError } = await supabase
      .from("daily_account_log")
      .upsert(batch, { onConflict: "user_id,date,category,account_name" });
    if (accountError) throw accountError;
  }

  console.log(`Updated ${rows.length} daily_log rows.`);
  console.log(`Updated ${accountRows.length} daily_account_log rows.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
