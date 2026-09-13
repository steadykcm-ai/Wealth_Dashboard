import assert from "node:assert/strict";
import test from "node:test";
import { buildNhPlugSyncPreview } from "../lib/nhplug-sync-preview";
import type { NhPlugPreviewResponse } from "../lib/nhplug-types";

const preview: NhPlugPreviewResponse = {
  provider: "NH투자증권 Namuh PLUG",
  readOnly: true,
  updatedAt: "2026-09-13T00:00:00.000Z",
  tokenSource: "database",
  tokenExpiresAt: "2026-09-14T00:00:00.000Z",
  totals: { accounts: 1, holdings: 3, currentValue: 0, cash: 0 },
  accounts: [{
    accountId: "NH ···· 7187",
    accountType: "01",
    domestic: null,
    us: null,
    errors: [],
    holdings: [
      { code: "005930", name: "삼성전자", quantity: 10, averagePrice: 70000, currentPrice: 71000, investedAmount: 700000, currentValue: 710000, profitLoss: 10000, currency: "KRW", market: "domestic" },
      { code: "AAPL", name: "Apple", quantity: 2, averagePrice: 200, currentPrice: 210, investedAmount: 400, currentValue: 420, profitLoss: 20, currency: "USD", market: "us" },
      { code: "NEW", name: "신규 종목", quantity: 1, averagePrice: 1000, currentPrice: 1100, investedAmount: 1000, currentValue: 1100, profitLoss: 100, currency: "KRW", market: "domestic" },
    ],
  }],
};

test("NH 보유 종목을 대시보드 코드와 합산 비교한다", () => {
  const result = buildNhPlugSyncPreview(preview, [
    { id: 1, code: "005930.KS", name: "삼성전자", quantity: 8, avg_price: 70000 },
    { id: 2, code: "AAPL", name: "Apple", quantity: 2, avg_price: 195 },
  ]);

  assert.equal(result.total, 3);
  assert.equal(result.newCount, 1);
  assert.equal(result.quantityMismatchCount, 1);
  assert.equal(result.averagePriceMismatchCount, 1);
  assert.equal(result.matchedCount, 0);
  assert.equal(result.candidates.find((candidate) => candidate.code === "005930")?.status, "quantity_mismatch");
  assert.equal(result.candidates.find((candidate) => candidate.code === "AAPL")?.status, "average_price_mismatch");
});
