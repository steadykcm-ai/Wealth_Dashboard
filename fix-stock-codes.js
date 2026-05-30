const fs = require('fs');
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;

const yf = new YahooFinance();

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/"/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/"/g, ''));

    const row = {};
    header.forEach((key, i) => {
      row[key] = values[i] || '';
    });
    return row;
  });
}

async function findCorrectCode(code, name) {
  // 이미 형식이 있으면 그대로 반환
  if (code.includes('.')) {
    return code;
  }

  // .KS 시도
  try {
    const q = await yf.quote(`${code}.KS`);
    // 종목명이 일치하거나 유사한지 확인
    if (q && q.regularMarketPrice && q.longName) {
      const matches = q.longName.toLowerCase().includes(name.toLowerCase()) ||
                     name.toLowerCase().includes(q.longName.toLowerCase());
      if (matches) {
        console.log(`  ✓ ${name}: ${code}.KS (${q.longName})`);
        return `${code}.KS`;
      }
    }
  } catch (e) {}

  // .KQ 시도
  try {
    const q = await yf.quote(`${code}.KQ`);
    if (q && q.regularMarketPrice && q.longName) {
      const matches = q.longName.toLowerCase().includes(name.toLowerCase()) ||
                     name.toLowerCase().includes(q.longName.toLowerCase());
      if (matches) {
        console.log(`  ✓ ${name}: ${code}.KQ (${q.longName})`);
        return `${code}.KQ`;
      }
    }
  } catch (e) {}

  console.log(`  ? ${name}: ${code} (자동 검증 실패 - 수동 확인 필요)`);
  return code; // 검증 실패해도 코드 반환
}

async function fixCodes() {
  console.log('📊 CSV 파싱 중...\n');
  const data = parseCSV(path.join(__dirname, 'Pension kcm - Assets.csv'));

  console.log('🔍 종목 코드 검증 중...\n');

  const fixed = [];
  for (const row of data) {
    if (row['코드'] && row['종목명']) {
      const correctCode = await findCorrectCode(row['코드'], row['종목명']);
      if (correctCode) {
        row['코드'] = correctCode;
      }
      fixed.push(row);
    } else {
      fixed.push(row);
    }
  }

  console.log('\n📝 CSV 저장 중...');

  const header = Object.keys(fixed[0]);
  const csvLines = [header.join(',')];

  for (const row of fixed) {
    const values = header.map(key => {
      const value = row[key] || '';
      // 쉼표나 따옴표가 있으면 따옴표로 감싸기
      if (String(value).includes(',') || String(value).includes('"')) {
        return `"${String(value).replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvLines.push(values.join(','));
  }

  fs.writeFileSync(
    path.join(__dirname, 'Pension kcm - Assets.csv'),
    csvLines.join('\n'),
    'utf-8'
  );

  console.log('✅ CSV 수정 완료!\n');
}

fixCodes();
