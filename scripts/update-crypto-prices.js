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

// Google Sheets API 임포트
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

async function updateCryptoPrices() {
  try {
    // crypto.json에서 데이터 읽기
    const cryptoJsonPath = 'C:/tmp/crypto.json';
    const cryptoData = JSON.parse(fs.readFileSync(cryptoJsonPath, 'utf-8'));
    const items = cryptoData.exchanges[0].items;

    console.log(`${items.length}개 항목의 가격을 업데이트합니다...\n`);

    const credentials = getCredentials();
    const spreadsheetId = getSpreadsheetId();

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // BlockChain 시트의 sheetId 조회
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const blockchainSheet = meta.data.sheets?.find(s => s.properties?.title === 'BlockChain');
    const sheetId = blockchainSheet?.properties?.sheetId;

    if (sheetId === undefined) {
      throw new Error('BlockChain 시트를 찾을 수 없습니다.');
    }

    console.log(`BlockChain 시트 ID: ${sheetId}\n`);

    // 값으로 업데이트하는 request 구성 (values.batchUpdate 사용)
    const valueUpdates = items.map(item => ({
      range: `BlockChain!F${item.rowIndex}`,
      values: [[item.currentPrice]],
    }));

    console.log(`${valueUpdates.length}개 셀 업데이트 요청 생성\n`);

    // 100개씩 나눠서 전송 (API 제한)
    for (let i = 0; i < valueUpdates.length; i += 100) {
      const batch = valueUpdates.slice(i, i + 100);
      console.log(`배치 ${Math.floor(i / 100) + 1}/${Math.ceil(valueUpdates.length / 100)} 전송...`);

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          data: batch,
          valueInputOption: 'RAW',
        },
      });

      console.log(`  ✓ ${batch.length}개 셀 업데이트 완료`);
    }

    console.log('\n✓ 모든 가격 업데이트 완료!');
  } catch (err) {
    console.error('오류:', err.message);
    process.exit(1);
  }
}

updateCryptoPrices();
