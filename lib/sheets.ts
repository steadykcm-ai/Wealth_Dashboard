import { google } from "googleapis";

function getCredentials() {
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credsPath) {
    throw new Error(
      "환경변수 GOOGLE_APPLICATION_CREDENTIALS가 설정되지 않았습니다."
    );
  }

  // JSON 문자열 시도 (Vercel에서 사용)
  try {
    const cleaned = credsPath.trim();
    if (cleaned.startsWith('{')) {
      return JSON.parse(cleaned);
    }
  } catch {
    // 무시하고 파일 경로 시도
  }

  // 파일 경로 시도 (로컬 개발용)
  try {
    const fs = require('fs');
    const fileContent = fs.readFileSync(credsPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (err) {
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS를 읽을 수 없습니다: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) {
    throw new Error(
      "환경변수 GOOGLE_SPREADSHEET_ID가 설정되지 않았습니다."
    );
  }
  return id;
}

export async function batchGetSheetValues(
  ranges: string[]
): Promise<(string | number)[][][] > {
  const credentials = getCredentials();
  const spreadsheetId = getSpreadsheetId();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const valueRanges = response.data.valueRanges ?? [];

  return valueRanges.map((vr) => {
    const rows = vr.values ?? [];
    return rows as (string | number)[][];
  });
}

export async function updateSheetCell(
  sheetTab: string,
  rowIndex: number,
  column: string,
  value: number
): Promise<void> {
  const credentials = getCredentials();
  const spreadsheetId = getSpreadsheetId();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTab}!${column}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

async function resolveSheetId(sheetTab: string): Promise<{ sheetId: number; spreadsheetId: string; sheets: ReturnType<typeof google.sheets> }> {
  const credsPath = getCredentials();
  const spreadsheetId = getSpreadsheetId();
  const auth = new google.auth.GoogleAuth({
    keyFile: credsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetTab);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`시트를 찾을 수 없습니다: ${sheetTab}`);
  }
  return { sheetId, spreadsheetId, sheets };
}

export async function deleteSheetRow(sheetTab: string, rowIndex: number): Promise<void> {
  const { sheetId, spreadsheetId, sheets } = await resolveSheetId(sheetTab);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowIndex - 1,  // 0-based
            endIndex: rowIndex,
          },
        },
      }],
    },
  });
}

export async function insertSheetRow(
  sheetTab: string,
  afterRowIndex: number,  // 1-based, 이 행 다음에 삽입
  item: { assetType: string; accountName: string; name: string; code: string; quantity: number; avgPrice: number }
): Promise<void> {
  const { sheetId, spreadsheetId, sheets } = await resolveSheetId(sheetTab);

  // 빈 행 삽입 (0-based: afterRowIndex = 1-based afterRowIndex 바로 뒤)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        insertDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: afterRowIndex,  // 0-based index = 1-based afterRowIndex
            endIndex: afterRowIndex + 1,
          },
          inheritFromBefore: false,
        },
      }],
    },
  });

  // 새 행 번호 (1-based)
  const newRow = afterRowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTab}!A${newRow}:G${newRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        item.assetType,
        item.accountName,
        item.name,
        item.code,
        item.quantity,
        item.avgPrice,
        `=GOOGLEFINANCE(D${newRow},"price")`,
      ]],
    },
  });
}

export async function appendSheetRow(
  range: string,
  values: (string | number)[]
): Promise<void> {
  const credentials = getCredentials();
  const spreadsheetId = getSpreadsheetId();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}
