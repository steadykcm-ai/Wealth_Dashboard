// F열이 비어있는 종목 티커 추출 후 Upbit API로 가격 조회 테스트
import { google } from "googleapis";

const SPREADSHEET_ID = "1MdNxFQq6bBrvfm_5p6DGHYmuqQ4bsSQhgRMLsMdQcFI";
const CREDS_PATH = "C:\\tmp\\finance-dashboard-keys.json";

const auth = new google.auth.GoogleAuth({
  keyFile: CREDS_PATH,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });
const res = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: SPREADSHEET_ID,
  ranges: ["BlockChain!A1:F60"],
  valueRenderOption: "UNFORMATTED_VALUE",
});

const rows = res.data.valueRanges?.[0]?.values ?? [];

function extractUpbitTicker(raw) {
  const match = raw.match(/^CURRENCY:([A-Z]+)KRW$/i);
  if (match) return match[1].toUpperCase();
  return raw.toUpperCase();
}

const missing = [];
rows.forEach((row, i) => {
  if (typeof row[1] !== "string" || !String(row[1]).trim()) return;
  const qty = Number(row[3]);
  const avgPrice = Number(row[4]);
  if (qty <= 0 || avgPrice <= 0) return;
  const f = row[5];
  const isMissing = typeof f !== "number" || f <= 0;
  if (isMissing) {
    const rawTicker = String(row[2] ?? "").trim();
    if (rawTicker) {
      const ticker = extractUpbitTicker(rawTicker);
      if (/^[A-Z]+$/.test(ticker)) {
        missing.push({ row: i + 1, name: String(row[1] ?? "").trim(), ticker });
      }
    }
  }
});

console.log("보완 대상:", missing.map(m => `${m.name}(${m.ticker})`).join(", "));

if (missing.length === 0) { console.log("없음"); process.exit(0); }

const markets = missing.map(m => `KRW-${m.ticker}`).join(",");
const upbitRes = await fetch(`https://api.upbit.com/v1/ticker?markets=${markets}`);
const prices = await upbitRes.json();

const priceMap = Object.fromEntries(prices.map(p => [p.market.replace("KRW-", ""), p.trade_price]));

console.log("\n결과:");
missing.forEach(({ name, ticker, row }) => {
  const price = priceMap[ticker];
  console.log(`  행${row} ${name}(${ticker}): ${price !== undefined ? price.toLocaleString("ko-KR") + "원" : "Upbit 미상장"}`);
});
