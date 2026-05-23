const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function analyzeSheets() {
  try {
    // 환경변수 로드
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credsPath) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SPREADSHEET_ID not set');
    }

    // 자격증명 로드
    const credentials = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 모든 탭 메타데이터 조회
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabNames = meta.data.sheets.map(s => s.properties.title);

    console.log('\n=== SHEET TABS ===');
    console.log(tabNames);

    // Assets 탭 읽기
    console.log('\n=== ASSETS TAB (A1:G200) ===');
    const assetsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assets!A1:G200',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const assetsData = assetsResponse.data.values || [];
    console.log(`Rows: ${assetsData.length}`);
    if (assetsData.length > 0) {
      console.log('Header:', assetsData[0]);
      console.log('First 3 rows:');
      assetsData.slice(1, 4).forEach((row, i) => {
        console.log(`  Row ${i + 2}:`, row);
      });
    }

    // BlockChain 탭 읽기
    console.log('\n=== BLOCKCHAIN TAB (A1:N100) ===');
    const cryptoResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'BlockChain!A1:N100',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const cryptoData = cryptoResponse.data.values || [];
    console.log(`Rows: ${cryptoData.length}`);
    if (cryptoData.length > 0) {
      console.log('Header:', cryptoData[0]);
      console.log('First 3 rows:');
      cryptoData.slice(1, 4).forEach((row, i) => {
        console.log(`  Row ${i + 2}:`, row);
      });
    }

    // Log_daily 탭 읽기
    console.log('\n=== LOG_DAILY TAB (A1:Z200) ===');
    const logDailyResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Log_daily!A1:Z200',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const logDailyData = logDailyResponse.data.values || [];
    console.log(`Rows: ${logDailyData.length}`);
    if (logDailyData.length > 0) {
      console.log('Header:', logDailyData[0]);
      console.log('First 3 rows:');
      logDailyData.slice(1, 4).forEach((row, i) => {
        console.log(`  Row ${i + 2}:`, row);
      });
    }

    // Log_Total 탭 읽기
    console.log('\n=== LOG_TOTAL TAB (A1:N50) ===');
    const logTotalResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Log_Total!A1:N50',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const logTotalData = logTotalResponse.data.values || [];
    console.log(`Rows: ${logTotalData.length}`);
    if (logTotalData.length > 0) {
      console.log('Header:', logTotalData[0]);
      console.log('First 3 rows:');
      logTotalData.slice(1, 4).forEach((row, i) => {
        console.log(`  Row ${i + 2}:`, row);
      });
    }

    // Pension_Input 탭 읽기
    console.log('\n=== PENSION_INPUT TAB (A1:D100) ===');
    const depositResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Pension_Input!A1:D100',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const depositData = depositResponse.data.values || [];
    console.log(`Rows: ${depositData.length}`);
    if (depositData.length > 0) {
      console.log('Header:', depositData[0]);
      console.log('First 3 rows:');
      depositData.slice(1, 4).forEach((row, i) => {
        console.log(`  Row ${i + 2}:`, row);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

analyzeSheets();
