import assert from "node:assert/strict";
import test from "node:test";
import {
  maskNhPlugAccountNumber,
  parseDomesticBalance,
  parseUsBalance,
} from "../lib/nhplug-client";

test("NH 계좌번호는 마지막 네 자리만 노출한다", () => {
  assert.equal(maskNhPlugAccountNumber("201-01-036881"), "NH ···· 6881");
});

test("국내주식 잔고를 대시보드 미리보기 형식으로 변환한다", () => {
  const parsed = parseDomesticBalance({
    summary: { dca: 500_000, tot_byn_amt: 1_000_000, tot_eal_amt: 1_200_000, tot_aet_amt: 1_700_000, tot_eal_pls: 200_000 },
    holdings: [{ iem_cd: "005930", iem_nm: "삼성전자", itg_bnc_qty: 10, phs_pr: 100_000, now_pr: 120_000, byn_amt: "1000000", eal_amt: 1_200_000, eal_pls_amt: 200_000 }],
  });
  assert.equal(parsed.summary.cash, 500_000);
  assert.equal(parsed.holdings[0]?.code, "005930");
  assert.equal(parsed.holdings[0]?.quantity, 10);
  assert.equal(parsed.holdings[0]?.currentValue, 1_200_000);
});

test("미국주식 잔고는 원화 평가액을 우선 사용한다", () => {
  const parsed = parseUsBalance({
    summary: { krw_dca: 300_000, abk_amt: 1_000_000, eal_amt_sum: 1_100_000, tot_aet_amt: 1_400_000, eal_pls_sum_amt: 100_000 },
    holdings: [{ iem_cd: "AAPL", iem_nm: "애플", cns_bse_bnc_qty: 2, krw_avg_phs_pr: 500_000, end_pr: 550_000, krw_abk_amt1: 1_000_000, krw_eal_amt: 1_100_000, krw_eal_pls_amt: 100_000, cur_cd: "USD" }],
  });
  assert.equal(parsed.summary.currentValue, 1_100_000);
  assert.equal(parsed.holdings[0]?.market, "us");
  assert.equal(parsed.holdings[0]?.averagePrice, 500_000);
});
