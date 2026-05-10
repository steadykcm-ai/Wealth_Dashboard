const fs = require('fs');
const path = require('path');

// 환경변수 직접 로드
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
});

const { google } = require('googleapis');

function getCredentials() {
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credsPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS가 설정되지 않았습니다.');
  }

  try {
    const cleaned = credsPath.trim();
    if (cleaned.startsWith('{')) {
      return JSON.parse(cleaned);
    }
  } catch {
    // 파일 경로 시도
  }

  try {
    const fileContent = fs.readFileSync(credsPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (err) {
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS를 읽을 수 없습니다: ${err.message}`);
  }
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) {
    throw new Error('GOOGLE_SPREADSHEET_ID가 설정되지 않았습니다.');
  }
  return id;
}

const SKIP_KEYWORDS = new Set([
  "보유종목", "총자산(원금)", "총자산", "원금", "", "Summary",
]);

function isAccountNameRow(row) {
  const b = row[1];
  if (typeof b !== "string") return false;
  const name = b.trim();
  if (!name || SKIP_KEYWORDS.has(name)) return false;
  const empty = (v) => v === undefined || v === null || v === "";
  return empty(row[2]) && empty(row[3]) && empty(row[4]);
}

function isDataRow(row) {
  if (typeof row[1] !== "string") return false;
  const name = row[1].trim();
  if (!name || SKIP_KEYWORDS.has(name)) return false;
  const qty = Number(row[3]);
  const price = Number(row[4]);
  return qty > 0 && price > 0;
}

async function migrateToAssets() {
  try {
    const credentials = getCredentials();
    const spreadsheetId = getSpreadsheetId();

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Stocks, Pension, IRP 시트 읽기 (수식 포함)
    console.log('📖 기존 시트 데이터 읽기 중...\n');
    const ranges = [
      'Stocks!A1:N100',
      'Pension!A1:N100',
      'IRP!A1:N100',
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
      valueRenderOption: 'FORMULA',
    });

    const stocksRows = response.data.valueRanges[0]?.values ?? [];
    const pensionRows = response.data.valueRanges[1]?.values ?? [];
    const irpRows = response.data.valueRanges[2]?.values ?? [];

    // 2. 각 시트의 데이터를 Assets 형식으로 변환
    console.log('🔄 데이터 변환 중...\n');

    // 현금 정보 추출 함수
    function extractCashByAccount(rows, category) {
      const cashByAccount = {};
      let currentAccount = null;
      for (const row of rows) {
        if (typeof row[1] === "string" && !['보유종목', '총자산(원금)', '총자산', '원금', '', 'Summary'].includes(row[1].trim())) {
          const empty = (v) => v === undefined || v === null || v === "";
          if (empty(row[2]) && empty(row[3]) && empty(row[4])) {
            currentAccount = String(row[1]).trim();
          }
        }
        // 총자산 행에서 현금(I열, index 8) 추출
        if (currentAccount && typeof row[1] === "string" && row[1].trim() === "총자산" && typeof row[8] === "number") {
          cashByAccount[currentAccount] = Number(row[8]);
        }
      }
      return cashByAccount;
    }

    // 현금 정보 추출
    const stocksCash = extractCashByAccount(stocksRows, '개별주식');
    const pensionCash = extractCashByAccount(pensionRows, '개인연금');
    const irpCash = extractCashByAccount(irpRows, 'IRP');

    // 헤더 행 추가
    const assetsData = [
      ['자산유형', '계좌명', '종목명', '코드', '수량', '매입가', '현재가']
    ];

    // 현금 정보를 위에 추가 (계좌별)
    console.log('💰 현금 정보 추가...');
    for (const [account, cash] of Object.entries(stocksCash)) {
      if (cash > 0) assetsData.push(['현금', account, '-', '-', '-', '-', cash]);
    }
    for (const [account, cash] of Object.entries(pensionCash)) {
      if (cash > 0) assetsData.push(['현금', account, '-', '-', '-', '-', cash]);
    }
    for (const [account, cash] of Object.entries(irpCash)) {
      if (cash > 0) assetsData.push(['현금', account, '-', '-', '-', '-', cash]);
    }
    console.log(`  ✓ ${Object.keys(stocksCash).length + Object.keys(pensionCash).length + Object.keys(irpCash).length}개 계좌 현금 추가\n`);

    // Stocks 처리
    console.log('개별주식 처리...');
    let currentAccount = null;
    for (let i = 0; i < stocksRows.length; i++) {
      const row = stocksRows[i];
      if (isAccountNameRow(row)) {
        currentAccount = String(row[1]).trim();
        console.log(`  계좌: ${currentAccount}`);
      } else if (isDataRow(row) && currentAccount) {
        assetsData.push([
          '개별주식',           // A: 자산유형
          currentAccount,       // B: 계좌명
          row[1],              // C: 종목명
          row[2],              // D: 코드
          row[3],              // E: 수량
          row[4],              // F: 매입가
          row[5] || `=GOOGLEFINANCE(D${assetsData.length + 2},"price")` // G: 현재가
        ]);
      }
    }
    console.log(`  ✓ ${assetsData.length}개 종목\n`);

    // Pension 처리
    console.log('개인연금 처리...');
    currentAccount = null;
    const pensionStart = assetsData.length;
    for (let i = 0; i < pensionRows.length; i++) {
      const row = pensionRows[i];
      if (isAccountNameRow(row)) {
        currentAccount = String(row[1]).trim();
        console.log(`  계좌: ${currentAccount}`);
      } else if (isDataRow(row) && currentAccount) {
        assetsData.push([
          '개인연금',           // A: 자산유형
          currentAccount,       // B: 계좌명
          row[1],              // C: 종목명
          row[2],              // D: 코드
          row[3],              // E: 수량
          row[4],              // F: 매입가
          row[5] || `=GOOGLEFINANCE(D${assetsData.length + 2},"price")` // G: 현재가
        ]);
      }
    }
    console.log(`  ✓ ${assetsData.length - pensionStart}개 종목\n`);

    // IRP 처리
    console.log('IRP 처리...');
    currentAccount = null;
    const irpStart = assetsData.length;
    for (let i = 0; i < irpRows.length; i++) {
      const row = irpRows[i];
      if (isAccountNameRow(row)) {
        currentAccount = String(row[1]).trim();
        console.log(`  계좌: ${currentAccount}`);
      } else if (isDataRow(row) && currentAccount) {
        assetsData.push([
          'IRP',               // A: 자산유형
          currentAccount,      // B: 계좌명
          row[1],             // C: 종목명
          row[2],             // D: 코드
          row[3],             // E: 수량
          row[4],             // F: 매입가
          row[5] || `=GOOGLEFINANCE(D${assetsData.length + 2},"price")` // G: 현재가
        ]);
      }
    }
    console.log(`  ✓ ${assetsData.length - irpStart}개 종목\n`);

    if (assetsData.length === 0) {
      console.log('❌ 마이그레이션할 데이터가 없습니다.');
      return;
    }

    console.log(`📊 총 ${assetsData.length}개 종목 데이터 준비 완료\n`);

    // 3. Assets 시트에 데이터 쓰기
    console.log('📝 Assets 시트에 데이터 쓰기 중...\n');

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Assets!A1:G10000',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: assetsData,
      },
    });

    console.log(`✅ 마이그레이션 완료!\n`);
    console.log(`📈 결과:`);
    console.log(`   개별주식: ${assetsData.filter(r => r[0] === '개별주식').length}개`);
    console.log(`   개인연금: ${assetsData.filter(r => r[0] === '개인연금').length}개`);
    console.log(`   IRP: ${assetsData.filter(r => r[0] === 'IRP').length}개`);
    console.log(`\n Assets 시트 확인 후, 브라우저에서 새로고침하세요!`);
  } catch (err) {
    console.error('❌ 오류:', err.message);
    process.exit(1);
  }
}

migrateToAssets();
