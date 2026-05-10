/**
 * 종목 데이터 수집:
 *   - KOSPI 주식: KIND (한국거래소 상장법인 목록)
 *   - KOSDAQ 주식: KIND
 *   - ETF: NAVER Finance API
 * 실행: node scripts/fetch-stocks.mjs  (또는 npm run fetch-stocks)
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../public/stocks-kr.json");

// ── KIND HTML 테이블 파싱 ─────────────────────────────────
function extractCellText(tdHtml) {
  return tdHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseKindHtml(html) {
  const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].slice(1); // 헤더 제외
  const results = [];
  for (const [, rowHtml] of rows) {
    const cells = [...rowHtml.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(([, c]) => extractCellText(c));
    const name = cells[0];
    const code = cells[2]; // 종목코드 = 3번째 컬럼
    if (name && /^\d{6}$/.test(code)) results.push({ name, code });
  }
  return results;
}

async function fetchKind(marketType, label) {
  console.log(`📥 ${label} (KIND)...`);
  const url = `https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=${marketType}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://kind.krx.co.kr/" },
  });
  if (!res.ok) throw new Error(`KIND ${label} 실패: ${res.status}`);
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("euc-kr").decode(buf);
  const rows = parseKindHtml(html);
  console.log(`  ✓ ${rows.length}개`);
  return rows;
}

// ── NAVER ETF 목록 ────────────────────────────────────────
async function fetchNaverEtfs() {
  console.log("📥 ETF (NAVER Finance)...");
  const res = await fetch("https://finance.naver.com/api/sise/etfItemList.nhn", {
    headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/" },
  });
  if (!res.ok) throw new Error(`NAVER ETF 실패: ${res.status}`);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("euc-kr").decode(buf);
  const data = JSON.parse(text);
  const list = data?.result?.etfItemList ?? [];
  const rows = list.map((e) => ({ name: e.itemname, code: e.itemcode }));
  console.log(`  ✓ ${rows.length}개`);
  return rows;
}

// ── 메인 ─────────────────────────────────────────────────
(async () => {
  try {
    const [kospi, kosdaq, etfs] = await Promise.all([
      fetchKind("stockMkt",  "KOSPI"),
      fetchKind("kosdaqMkt", "KOSDAQ"),
      fetchNaverEtfs(),
    ]);

    const seen = new Set();
    const result = [];

    function push(rows, prefix) {
      for (const { name, code } of rows) {
        const ticker = `${prefix}:${code}`;
        if (seen.has(ticker)) continue;
        seen.add(ticker);
        result.push([name, ticker]);
      }
    }

    push(kospi,  "KRX");
    push(kosdaq, "KOSDAQ");
    push(etfs,   "KRX");

    result.sort((a, b) => a[0].localeCompare(b[0], "ko"));

    const json = JSON.stringify(result);
    writeFileSync(OUT, json, "utf-8");

    console.log(`\n✅ 완료: ${result.length}개 종목 저장`);
    console.log(`   KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length} + ETF ${etfs.length}`);
    console.log(`   파일 크기: ${(json.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error("❌ 오류:", err.message);
    process.exit(1);
  }
})();
