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

console.log("행\tB(이름)\t\t\tC(티커)\tF(현재가)");
console.log("─".repeat(60));
rows.forEach((row, i) => {
  const b = String(row[1] ?? "").trim();
  const c = String(row[2] ?? "").trim();
  const f = row[5] ?? "";
  if (b || c) {
    console.log(`${i + 1}\t${b.padEnd(20)}\t${c.padEnd(10)}\t${f}`);
  }
});
